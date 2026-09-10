-- Guided CSV purchase imports retain their vetted source fields and execute a
-- single line under a database transaction.  The import tables introduced in
-- 184 remain the audit record; this migration only adds CSV-specific payloads.

alter table public.shared_inventory_purchase_import_batches
  add column if not exists source_metadata jsonb not null default '{}'::jsonb,
  add column if not exists configuration jsonb not null default '{}'::jsonb,
  add column if not exists revision integer not null default 1;

alter table public.shared_inventory_purchase_import_lines
  add column if not exists source_header jsonb not null default '{}'::jsonb,
  add column if not exists source_items jsonb not null default '[]'::jsonb,
  add column if not exists calculation jsonb not null default '{}'::jsonb,
  add column if not exists execution_mode text,
  add column if not exists processed_at timestamptz;

alter table public.shared_inventory_purchase_import_lines
  drop constraint if exists shared_purchase_import_lines_execution_mode_check;
alter table public.shared_inventory_purchase_import_lines
  add constraint shared_purchase_import_lines_execution_mode_check
  check (execution_mode is null or execution_mode in ('draft','confirm'));

alter table public.shared_inventory_purchase_invoices
  add column if not exists calculation_basis text not null default 'standard';
alter table public.shared_inventory_purchase_invoices
  drop constraint if exists shared_purchase_invoice_calculation_basis_check;
alter table public.shared_inventory_purchase_invoices
  add constraint shared_purchase_invoice_calculation_basis_check
  check (calculation_basis in ('standard','source_bs'));

-- Preserve the established fiscal algorithm; CSV imports select the VES branch
-- even when every source line happens to be denominated in USD.
create or replace function public.shared_inventory_purchase_invoice_recalculate_totals(
    p_tenant_id uuid,
    p_invoice_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_sign numeric;
    v_currency text;
    v_rate numeric;
    v_subtotal_source numeric;
    v_vat_source numeric;
    v_subtotal_raw numeric;
    v_vat_raw numeric;
    v_subtotal_fiscal numeric;
    v_vat_fiscal numeric;
    v_extra_taxes numeric;
begin
    select
        case when coalesce(f.document_type, 'factura') = 'nota_credito' then -1 else 1 end,
        case
            when f.calculation_basis <> 'source_bs' and count(i.id) > 0 and bool_and(upper(coalesce(i.currency, 'VES')) in ('USD', 'D')) then 'D'
            else 'B'
        end,
        coalesce(nullif(f.dollar_rate, 0), max(nullif(i.dollar_rate, 0)), 0)
    into v_sign, v_currency, v_rate
    from public.shared_inventory_purchase_invoices f
    left join public.shared_inventory_purchase_invoice_items i
      on i.tenant_id = f.tenant_id and i.invoice_id = f.id
    where f.tenant_id = p_tenant_id and f.id = p_invoice_id
    group by f.document_type, f.dollar_rate, f.calculation_basis;

    if v_currency = 'D' and v_rate <= 0 then
        raise exception 'USD purchase invoice requires a positive dollar rate';
    end if;

    with raw_lines as (
        select
            i.id,
            i.vat_rate,
            case
                when v_currency = 'D'
                  and upper(coalesce(i.currency, 'VES')) in ('USD', 'D')
                  and i.currency_cost is not null
                    then i.quantity * i.currency_cost
                when v_currency = 'D'
                  and upper(coalesce(i.currency, 'VES')) in ('USD', 'D')
                  and i.vat_base is not null
                    then i.vat_base / v_rate
                else i.quantity * i.unit_cost
            end as raw_base,
            i.discount_type,
            i.discount_value,
            case when v_currency = 'D' then coalesce(i.discount_amount, 0) / v_rate
                 else coalesce(i.discount_amount, 0) end as discount_amount,
            i.surcharge_type,
            i.surcharge_value,
            case when v_currency = 'D' then coalesce(i.surcharge_amount, 0) / v_rate
                 else coalesce(i.surcharge_amount, 0) end as surcharge_amount
        from public.shared_inventory_purchase_invoice_items i
        where i.tenant_id = p_tenant_id and i.invoice_id = p_invoice_id
    ),
    line_net as (
        select *,
            raw_base
            - case when discount_type = 'porcentaje' then raw_base * coalesce(discount_value, 0) / 100
                   else discount_amount end
            + case when surcharge_type = 'porcentaje' then raw_base * coalesce(surcharge_value, 0) / 100
                   else surcharge_amount end as net_base
        from raw_lines
    ),
    line_sum as (
        select coalesce(sum(net_base), 0) as net_total from line_net
    ),
    header_values as (
        select
            ls.net_total,
            case
                when f.discount_type = 'porcentaje' then ls.net_total * coalesce(f.discount_value, 0) / 100
                when v_currency = 'D' then coalesce(f.discount_amount, 0) / v_rate
                else coalesce(f.discount_amount, 0)
            end as header_discount,
            case
                when f.surcharge_type = 'porcentaje' then ls.net_total * coalesce(f.surcharge_value, 0) / 100
                when v_currency = 'D' then coalesce(f.surcharge_amount, 0) / v_rate
                else coalesce(f.surcharge_amount, 0)
            end as header_surcharge
        from line_sum ls
        join public.shared_inventory_purchase_invoices f
          on f.tenant_id = p_tenant_id and f.id = p_invoice_id
    ),
    final_lines as (
        select
            ln.vat_rate,
            ln.net_base
              + case when hv.net_total <> 0
                     then (hv.header_surcharge - hv.header_discount) * ln.net_base / hv.net_total
                     else 0 end as final_base
        from line_net ln
        cross join header_values hv
    )
    select
        coalesce(sum(final_base), 0),
        coalesce(sum(final_base * case vat_rate
            when 'reducida_8' then 8
            when 'general_16' then 16
            else 0
        end / 100), 0)
    into v_subtotal_source, v_vat_source
    from final_lines;

    if v_currency = 'D' then
        v_subtotal_raw := v_subtotal_source * v_rate;
        v_vat_raw := v_vat_source * v_rate;
    else
        v_subtotal_raw := v_subtotal_source;
        v_vat_raw := v_vat_source;
    end if;

    v_subtotal_fiscal := round(v_subtotal_raw, 2);
    v_vat_fiscal := trunc(v_vat_raw, 2);

    select coalesce(sum(coalesce(nullif(t->>'monto', '')::numeric, 0)), 0)
    into v_extra_taxes
    from public.shared_inventory_purchase_invoices f
    cross join lateral jsonb_array_elements(coalesce(f.taxes, '[]'::jsonb)) t
    where f.tenant_id = p_tenant_id and f.id = p_invoice_id;

    update public.shared_inventory_purchase_invoices
    set subtotal = v_sign * v_subtotal_fiscal,
        vat_amount = v_sign * v_vat_fiscal,
        total = v_sign * trunc(v_subtotal_fiscal + v_vat_fiscal + v_extra_taxes, 2),
        updated_at = now()
    where tenant_id = p_tenant_id and id = p_invoice_id;
end;
$$;

-- The application sends only a whitelisted, server-recomputed payload. This
-- procedure locks the staged row before doing any write, so retries return the
-- same invoice and concurrent executions cannot duplicate it.
create or replace function public.shared_inventory_purchase_csv_import_execute_line(
    p_tenant_id uuid,
    p_batch_id text,
    p_line_id text,
    p_mode text,
    p_invoice jsonb,
    p_items jsonb,
    p_supplier jsonb,
    p_products jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_batch record; v_line record; v_supplier_id text; v_invoice_id text;
    v_product jsonb; v_product_id text; v_item jsonb; v_existing text;
    v_supplier_rif text := upper(regexp_replace(coalesce(p_supplier->>'rif',''), '[^A-Za-z0-9]', '', 'g'));
    v_identity text; v_status text; v_count integer; v_actual_status text;
begin
    if p_mode not in ('draft','confirm') then raise exception 'Invalid import execution mode'; end if;
    select * into v_batch from public.shared_inventory_purchase_import_batches
     where tenant_id=p_tenant_id and id=p_batch_id for update;
    if not found then raise exception 'Purchase import batch not found'; end if;
    if (p_invoice->>'revision')::integer is distinct from v_batch.revision then
      raise exception 'Importación desactualizada; recarga antes de ejecutar';
    end if;
    select * into v_line from public.shared_inventory_purchase_import_lines
     where tenant_id=p_tenant_id and id=p_line_id and batch_id=p_batch_id for update;
    if not found then raise exception 'Purchase import line not found'; end if;
    if coalesce(p_invoice->>'companyId','') <> v_batch.company_id then raise exception 'Import company mismatch'; end if;
    if v_line.invoice_id is not null then
      select status into v_actual_status from public.shared_inventory_purchase_invoices
       where tenant_id=p_tenant_id and company_id=v_batch.company_id and id=v_line.invoice_id for update;
      if not found then raise exception 'Imported invoice no longer exists in this company'; end if;
      if v_actual_status='confirmada' then
        return jsonb_build_object('invoiceId',v_line.invoice_id,'status','confirmed','idempotent',true);
      end if;
      v_invoice_id := v_line.invoice_id;
      delete from public.shared_inventory_purchase_invoice_items where tenant_id=p_tenant_id and invoice_id=v_invoice_id;
    end if;
    if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then p_mode := 'draft'; end if;

    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_batch.company_id || ':supplier:' || v_supplier_rif, 0));
    v_supplier_id := nullif(p_supplier->>'id','');
    if v_supplier_id is not null then
      if not exists(select 1 from public.shared_inventory_suppliers where tenant_id=p_tenant_id
        and company_id=v_batch.company_id and id=v_supplier_id and active
        and upper(regexp_replace(rif,'[^A-Za-z0-9]','','g'))=v_supplier_rif) then
        raise exception 'Supplier does not match the import company and RIF';
      end if;
    else
      select count(*),min(id) into v_count,v_supplier_id from public.shared_inventory_suppliers
       where tenant_id=p_tenant_id and company_id=v_batch.company_id
         and upper(regexp_replace(rif, '[^A-Za-z0-9]', '', 'g'))=v_supplier_rif;
      if v_count > 1 then raise exception 'Proveedor ambiguo: selecciona una coincidencia'; end if;
      if v_count=1 and not exists(select 1 from public.shared_inventory_suppliers where tenant_id=p_tenant_id and id=v_supplier_id and active) then
        raise exception 'El proveedor coincidente está inactivo';
      end if;
    end if;
    if v_supplier_id is null then
      v_supplier_id := gen_random_uuid()::text;
      insert into public.shared_inventory_suppliers(tenant_id,id,company_id,rif,name,contact,phone,email,address,notes,active)
      values(p_tenant_id,v_supplier_id,v_batch.company_id,coalesce(p_supplier->>'rif',''),coalesce(nullif(p_supplier->>'name',''),'Proveedor importado'),'','','','','',true);
    end if;

    v_identity := lower(trim(coalesce(p_invoice->>'documentNumber',''))) || ':' || lower(trim(coalesce(p_invoice->>'controlNumber',''))) || ':' || v_supplier_rif;
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_batch.company_id || ':invoice:' || v_identity, 0));
    select f.id into v_existing from public.shared_inventory_purchase_invoices f
      join public.shared_inventory_suppliers s on s.tenant_id=f.tenant_id and s.id=f.supplier_id
     where f.tenant_id=p_tenant_id and f.company_id=v_batch.company_id
       and f.invoice_number=coalesce(p_invoice->>'documentNumber','')
       and f.control_number=coalesce(p_invoice->>'controlNumber','')
       and upper(regexp_replace(s.rif, '[^A-Za-z0-9]', '', 'g'))=v_supplier_rif
       and f.id <> coalesce(v_invoice_id, '')
     limit 1 for update;
    if v_existing is not null then raise exception 'Duplicate purchase invoice'; end if;

    for v_product in select value from jsonb_array_elements(coalesce(p_products,'[]'::jsonb)) order by value->>'code' loop
      v_product_id := nullif(v_product->>'id','');
      if v_product_id is null then
        perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_batch.company_id || ':product:' || upper(trim(coalesce(v_product->>'code',''))), 0));
        select count(*),min(id) into v_count,v_product_id from public.shared_inventory_products
         where tenant_id=p_tenant_id and company_id=v_batch.company_id and code=coalesce(v_product->>'code','');
        if v_count > 1 then raise exception 'Producto ambiguo: selecciona una coincidencia'; end if;
        if v_count=1 and not exists(select 1 from public.shared_inventory_products where tenant_id=p_tenant_id and id=v_product_id and active) then
          raise exception 'El producto coincidente está inactivo';
        end if;
        if v_product_id is null then
          v_product_id := coalesce(nullif(v_product->>'createId',''),gen_random_uuid()::text);
          insert into public.shared_inventory_products(tenant_id,id,company_id,code,name,description,type,measure_unit,valuation_method,current_stock,average_cost,active,vat_type,default_currency)
          values(p_tenant_id,v_product_id,v_batch.company_id,coalesce(v_product->>'code',''),coalesce(nullif(v_product->>'name',''),'Producto importado'),'','mercancia',
            case when v_product->>'measureUnit' in ('unidad','kg','g','m','m2','m3','litro','galon','caja','rollo','paquete') then v_product->>'measureUnit' else 'unidad' end,
            case when v_product->>'valuationMethod'='peps' then 'peps' else 'promedio_ponderado' end,0,0,true,
            case when v_product->>'vatType'='exento' then 'exento' else 'general' end,'B');
          if v_product->'salePricing' is not null and v_product->'salePricing' <> 'null'::jsonb then
            update public.shared_inventory_products set
              sale_price_mode=v_product->'salePricing'->>'mode',
              sale_price_value=coalesce(v_product->'salePricing'->>'amount',v_product->'salePricing'->>'percentage')::numeric,
              sale_price_currency=case when v_product->'salePricing'->>'currency'='VES' then 'B' else 'D' end,
              sale_price_currency_code=v_product->'salePricing'->>'currency'
            where tenant_id=p_tenant_id and id=v_product_id;
          end if;
        end if;
      else
        if not exists(select 1 from public.shared_inventory_products where tenant_id=p_tenant_id and company_id=v_batch.company_id and id=v_product_id and code=v_product->>'code' and active) then raise exception 'Product does not match the import company and code'; end if;
      end if;
      p_items := (select jsonb_agg(case when value->>'code'=v_product->>'code' then jsonb_set(value,'{productId}',to_jsonb(v_product_id)) else value end) from jsonb_array_elements(p_items));
    end loop;

    if exists(select 1 from jsonb_array_elements(p_items) where nullif(value->>'productId','') is null) then raise exception 'Unresolved imported product'; end if;
    v_invoice_id := coalesce(v_invoice_id, gen_random_uuid()::text);
    insert into public.shared_inventory_purchase_invoices(tenant_id,id,company_id,supplier_id,invoice_number,control_number,invoice_date,period,status,subtotal,vat_percentage,vat_amount,total,notes,currency_code,exchange_rates,source_subtotal,source_vat_amount,source_total,calculation_basis,document_type,inventory_effect,dollar_rate,rate_decimals)
    values(p_tenant_id,v_invoice_id,v_batch.company_id,v_supplier_id,coalesce(p_invoice->>'documentNumber',''),coalesce(p_invoice->>'controlNumber',''),(p_invoice->>'date')::date,left(p_invoice->>'date',7),'borrador',
      (p_invoice->>'subtotal')::numeric,16,(p_invoice->>'vatAmount')::numeric,(p_invoice->>'total')::numeric,coalesce(p_invoice->>'notes',''),coalesce(nullif(p_invoice->>'currency',''),'VES'),coalesce(p_invoice->'exchangeRates','[]'::jsonb),
      null,null,null,'source_bs','factura','additional_purchase',nullif(p_invoice->>'dollarRate','')::numeric,4)
    on conflict(tenant_id,id) do update set supplier_id=excluded.supplier_id,invoice_number=excluded.invoice_number,control_number=excluded.control_number,invoice_date=excluded.invoice_date,period=excluded.period,subtotal=excluded.subtotal,vat_amount=excluded.vat_amount,total=excluded.total,notes=excluded.notes,currency_code=excluded.currency_code,exchange_rates=excluded.exchange_rates,source_subtotal=null,source_vat_amount=null,source_total=null,dollar_rate=excluded.dollar_rate,rate_decimals=excluded.rate_decimals,updated_at=now();
    for v_item in select value from jsonb_array_elements(p_items) loop
      insert into public.shared_inventory_purchase_invoice_items(tenant_id,id,invoice_id,product_id,quantity,unit_cost,total_cost,vat_rate,currency,currency_cost,dollar_rate,vat_base,vat_included)
      values(p_tenant_id,gen_random_uuid()::text,v_invoice_id,v_item->>'productId',(v_item->>'quantity')::numeric,(v_item->>'unitCost')::numeric,(v_item->>'totalCost')::numeric,
        case when v_item->>'vatRate' in ('exenta','reducida_8','general_16') then v_item->>'vatRate' else 'general_16' end,
        coalesce(nullif(v_item->>'currency',''),'VES'),nullif(v_item->>'currencyCost','')::numeric,nullif(v_item->>'exchangeRate','')::numeric,(v_item->>'totalCost')::numeric,false);
    end loop;
    if jsonb_array_length(p_items)>0 then
      perform public.shared_inventory_purchase_invoice_recalculate_totals(p_tenant_id,v_invoice_id);
      if not exists(select 1 from public.shared_inventory_purchase_invoices where tenant_id=p_tenant_id and id=v_invoice_id
        and subtotal=(p_invoice->>'subtotal')::numeric and vat_amount=(p_invoice->>'vatAmount')::numeric and total=(p_invoice->>'total')::numeric) then
        raise exception 'Los totales guardados no coinciden con la previsualización';
      end if;
    end if;
    v_status := case when p_mode='confirm' then 'completed' else 'in_progress' end;
    update public.shared_inventory_purchase_import_lines set invoice_id=v_invoice_id,status=v_status,execution_mode=p_mode,processed_at=now(),
      actual_subtotal=(p_invoice->>'subtotal')::numeric,actual_vat_amount=(p_invoice->>'vatAmount')::numeric,actual_total=(p_invoice->>'total')::numeric,
      difference_total=(p_invoice->>'total')::numeric-expected_total,updated_at=now() where tenant_id=p_tenant_id and id=p_line_id;
    if p_mode='confirm' then perform public.shared_inventory_purchase_invoice_confirm(p_tenant_id,v_invoice_id); update public.shared_inventory_purchase_import_lines set status='completed',updated_at=now() where tenant_id=p_tenant_id and id=p_line_id; end if;
    update public.shared_inventory_purchase_import_batches set status=case when exists(select 1 from public.shared_inventory_purchase_import_lines where tenant_id=p_tenant_id and batch_id=p_batch_id and status <> 'completed') then 'in_progress' else 'completed' end,updated_at=now() where tenant_id=p_tenant_id and id=p_batch_id;
    return jsonb_build_object('invoiceId',v_invoice_id,'status',case when p_mode='confirm' then 'confirmed' else 'saved' end,'idempotent',false);
end;
$$;

revoke all on function public.shared_inventory_purchase_csv_import_execute_line(uuid,text,text,text,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_inventory_purchase_csv_import_execute_line(uuid,text,text,text,jsonb,jsonb,jsonb,jsonb) to service_role;
revoke all on function public.shared_inventory_purchase_invoice_recalculate_totals(uuid,text) from public,anon,authenticated;
grant execute on function public.shared_inventory_purchase_invoice_recalculate_totals(uuid,text) to service_role;

-- Atomically replace only unexecuted staged rows.  Completed rows remain the
-- immutable audit link to their invoice when the wizard is resumed.
create or replace function public.shared_inventory_purchase_csv_import_save(
 p_tenant_id uuid,p_batch jsonb,p_rows jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare v_row jsonb; v_id text:=p_batch->>'id'; v_current_revision integer; v_existing_company text;
begin
 if not exists(select 1 from public.shared_companies where tenant_id=p_tenant_id and id=p_batch->>'companyId') then raise exception 'Company does not belong to tenant';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':purchase-import:' || v_id,0));
 select revision,company_id into v_current_revision,v_existing_company from public.shared_inventory_purchase_import_batches where tenant_id=p_tenant_id and id=v_id for update;
 if found then
   if v_existing_company <> p_batch->>'companyId' then raise exception 'Import company mismatch'; end if;
   if v_current_revision is distinct from (p_batch->>'revision')::integer then raise exception 'Importación desactualizada; recarga antes de guardar'; end if;
 end if;
 insert into public.shared_inventory_purchase_import_batches(tenant_id,id,company_id,period,source_file_name,source_company_rif,source_metadata,configuration,status)
 values(p_tenant_id,v_id,p_batch->>'companyId',p_batch->>'period',p_batch->>'fileName',p_batch->>'companyRif','{"source":"purchase_csv","version":1}'::jsonb,p_batch->'config','in_progress')
 on conflict(tenant_id,id) do update set source_file_name=excluded.source_file_name,source_company_rif=excluded.source_company_rif,configuration=excluded.configuration,revision=shared_inventory_purchase_import_batches.revision+1,updated_at=now();
 for v_row in select value from jsonb_array_elements(p_rows) loop
  insert into public.shared_inventory_purchase_import_lines(tenant_id,id,batch_id,source_row,supplier_rif,supplier_name,invoice_date,period,document_type,document_number,control_number,expected_total,source_header,source_items,calculation,status,warnings)
  values(p_tenant_id,gen_random_uuid()::text,v_id,(v_row->'header'->>'sourceRow')::int,v_row->'header'->>'supplierRif',v_row->'header'->>'supplierName',(v_row->'header'->>'date')::date,left(v_row->'header'->>'date',7),'factura',v_row->'header'->>'documentNumber',v_row->'header'->>'controlNumber',(v_row->'header'->>'totalBs')::numeric,v_row->'header',v_row->'items',v_row-'header'-'items','imported','[]'::jsonb)
  on conflict(tenant_id,batch_id,source_row) do update set supplier_rif=excluded.supplier_rif,supplier_name=excluded.supplier_name,invoice_date=excluded.invoice_date,period=excluded.period,document_number=excluded.document_number,control_number=excluded.control_number,expected_total=excluded.expected_total,source_header=excluded.source_header,source_items=excluded.source_items,calculation=excluded.calculation,updated_at=now()
    where shared_inventory_purchase_import_lines.invoice_id is null or exists(
      select 1 from public.shared_inventory_purchase_invoices f where f.tenant_id=p_tenant_id
      and f.id=shared_inventory_purchase_import_lines.invoice_id and f.status='borrador');
 end loop;
 delete from public.shared_inventory_purchase_import_lines l where l.tenant_id=p_tenant_id and l.batch_id=v_id and l.invoice_id is null and not exists(select 1 from jsonb_array_elements(p_rows) r where (r->'header'->>'sourceRow')::int=l.source_row);
end$$;
revoke all on function public.shared_inventory_purchase_csv_import_save(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_inventory_purchase_csv_import_save(uuid,jsonb,jsonb) to service_role;
