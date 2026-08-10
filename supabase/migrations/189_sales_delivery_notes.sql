-- Shared-schema sales document types and delivery-note numbering.

alter table public.shared_companies
  add column if not exists proximo_numero_nota_entrega integer not null default 1;

alter table public.shared_inventory_sales_invoices
  add column if not exists document_type text not null default 'venta';

alter table public.shared_inventory_sales_invoices
  drop constraint if exists shared_sales_invoice_document_type_check;
alter table public.shared_inventory_sales_invoices
  add constraint shared_sales_invoice_document_type_check
  check (document_type in ('venta', 'nota_entrega'));

create index if not exists shared_sales_invoices_document_type_idx
  on public.shared_inventory_sales_invoices(tenant_id, company_id, document_type, period);

alter function public.shared_inventory_sales_invoice_save(uuid,jsonb,jsonb)
  rename to shared_inventory_sales_invoice_save_base;

create function public.shared_inventory_sales_invoice_save(
    p_tenant_id uuid,
    p_invoice jsonb,
    p_items jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
    v_type text := coalesce(nullif(p_invoice->>'tipo_documento',''), 'venta');
    v_number text := coalesce(nullif(p_invoice->>'numero_factura',''), '');
    v_company_id text := p_invoice->>'empresa_id';
    v_next integer;
    v_result jsonb;
begin
    if v_type not in ('venta','nota_entrega') then raise exception 'Invalid sales document type'; end if;
    if v_number = '' then
        if v_type = 'nota_entrega' then
            select proximo_numero_nota_entrega into v_next
            from public.shared_companies where tenant_id=p_tenant_id and id=v_company_id for update;
            v_number := 'NE-' || lpad(coalesce(v_next,1)::text,8,'0');
            update public.shared_companies set proximo_numero_nota_entrega=coalesce(v_next,1)+1
            where tenant_id=p_tenant_id and id=v_company_id;
        else
            select proximo_numero_factura_venta into v_next
            from public.shared_companies where tenant_id=p_tenant_id and id=v_company_id for update;
            v_number := lpad(coalesce(v_next,1)::text,8,'0');
            update public.shared_companies set proximo_numero_factura_venta=coalesce(v_next,1)+1
            where tenant_id=p_tenant_id and id=v_company_id;
        end if;
        p_invoice := jsonb_set(p_invoice,'{numero_factura}',to_jsonb(v_number));
    end if;
    v_result := public.shared_inventory_sales_invoice_save_base(p_tenant_id,p_invoice,p_items);
    update public.shared_inventory_sales_invoices set document_type=v_type
    where tenant_id=p_tenant_id and id=v_result->>'id';
    return v_result || jsonb_build_object('document_type',v_type,'invoice_number',v_number);
end;
$$;

revoke execute on function public.shared_inventory_sales_invoice_save(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_inventory_sales_invoice_save(uuid,jsonb,jsonb) to service_role;

create or replace function public.shared_inventory_sales_igtf_fortnight(
    p_tenant_id uuid, p_company_id text, p_year integer, p_month integer, p_fortnight integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_rif text; v_period text; v_start date; v_end date; v_concepts jsonb; v_total numeric(14,2);
begin
    if p_fortnight not in (1,2) then raise exception 'Fortnight must be 1 or 2'; end if;
    if p_month not between 1 and 12 then raise exception 'Month must be between 1 and 12'; end if;
    v_period:=to_char(make_date(p_year,p_month,1),'YYYY-MM');
    v_start:=case when p_fortnight=1 then make_date(p_year,p_month,1) else make_date(p_year,p_month,16) end;
    v_end:=case when p_fortnight=1 then make_date(p_year,p_month,15) else (make_date(p_year,p_month,1)+interval '1 month'-interval '1 day')::date end;
    select coalesce(nullif(rif,''),id) into v_rif from public.shared_companies where tenant_id=p_tenant_id and id=p_company_id;
    if v_rif is null or v_rif='' then raise exception 'Company not found'; end if;
    select coalesce(jsonb_object_agg(concept,jsonb_build_object('cantidad_operaciones',count_ops,'base_imponible_bs',base_bs,'monto_igtf',amount)), '{}'::jsonb),coalesce(sum(amount),0)
    into v_concepts,v_total from (
        select financial_tax_concept concept,count(*) count_ops,sum(financial_tax_bs_base)::numeric(14,2) base_bs,sum(financial_tax_amount)::numeric(14,2) amount
        from public.shared_inventory_sales_invoices where tenant_id=p_tenant_id and company_id=p_company_id and status='confirmada'
          and document_type='venta' and financial_tax_applies=true and financial_tax_concept is not null and invoice_date between v_start and v_end
        group by financial_tax_concept
    ) agg;
    return jsonb_build_object('agente_rif',v_rif,'periodo',v_period,'quincena',p_fortnight,'fecha_inicio',v_start,'fecha_fin',v_end,'conceptos',v_concepts,'total_igtf',v_total);
end;
$$;
