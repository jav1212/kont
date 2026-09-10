-- An imported header-only draft can later receive its detail without exposing
-- siblings in the original batch.  These RPCs retain the original header as
-- the authority and lock the invoice before replacing any detail.

create or replace function public.shared_inventory_purchase_csv_import_save_target(
  p_tenant_id uuid, p_batch jsonb, p_rows jsonb, p_target_invoice_id text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_batch record; v_line record; v_invoice record; v_row jsonb;
begin
  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) <> 1 then
    raise exception 'Target import save requires exactly one row';
  end if;
  select * into v_batch from public.shared_inventory_purchase_import_batches
    where tenant_id=p_tenant_id and id=p_batch->>'id' and company_id=p_batch->>'companyId' for update;
  if not found then raise exception 'Purchase import batch not found'; end if;
  if v_batch.revision is distinct from (p_batch->>'revision')::integer then
    raise exception 'Importación desactualizada; recarga antes de guardar';
  end if;
  select * into v_line from public.shared_inventory_purchase_import_lines
    where tenant_id=p_tenant_id and batch_id=v_batch.id and invoice_id=p_target_invoice_id
      and source_row=(p_rows->0->'header'->>'sourceRow')::integer for update;
  if not found then raise exception 'Imported invoice is not linked to this batch'; end if;
  select * into v_invoice from public.shared_inventory_purchase_invoices
    where tenant_id=p_tenant_id and company_id=v_batch.company_id and id=p_target_invoice_id for update;
  if not found or v_invoice.status <> 'borrador' then raise exception 'Solo se puede editar un borrador importado'; end if;
  if exists(select 1 from public.shared_inventory_purchase_invoice_items where tenant_id=p_tenant_id and invoice_id=p_target_invoice_id) then
    raise exception 'El borrador ya contiene productos y no puede importar detalles CSV';
  end if;
  v_row := p_rows->0;
  update public.shared_inventory_purchase_import_lines set
    source_items=coalesce(v_row->'items','[]'::jsonb),
    calculation=(v_row-'header'-'items') || jsonb_build_object('configOverride', p_batch->'config'),
    updated_at=now()
  where tenant_id=p_tenant_id and id=v_line.id;
  update public.shared_inventory_purchase_import_batches set revision=revision+1,updated_at=now()
    where tenant_id=p_tenant_id and id=v_batch.id;
end $$;

create or replace function public.shared_inventory_purchase_csv_import_execute_target_line(
  p_tenant_id uuid, p_batch_id text, p_line_id text, p_mode text, p_invoice jsonb,
  p_items jsonb, p_supplier jsonb, p_products jsonb, p_target_invoice_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_batch record; v_line record; v_invoice record; v_authoritative jsonb; v_supplier_rif text; v_result jsonb;
begin
  if p_mode not in ('draft','confirm') then raise exception 'Invalid import execution mode'; end if;
  select * into v_batch from public.shared_inventory_purchase_import_batches
    where tenant_id=p_tenant_id and id=p_batch_id for update;
  if not found then raise exception 'Purchase import batch not found'; end if;
  if v_batch.company_id <> coalesce(p_invoice->>'companyId','') then raise exception 'Import company mismatch'; end if;
  if v_batch.revision is distinct from (p_invoice->>'revision')::integer then raise exception 'Importación desactualizada; recarga antes de ejecutar'; end if;
  select * into v_line from public.shared_inventory_purchase_import_lines
    where tenant_id=p_tenant_id and id=p_line_id and batch_id=p_batch_id and invoice_id=p_target_invoice_id for update;
  if not found then raise exception 'Imported invoice is not linked to this line'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_batch.company_id || ':supplier:' || upper(regexp_replace(coalesce(p_supplier->>'rif',''),'[^A-Za-z0-9]','','g')), 0));
  select * into v_invoice from public.shared_inventory_purchase_invoices
    where tenant_id=p_tenant_id and company_id=v_batch.company_id and id=p_target_invoice_id for update;
  if not found then raise exception 'Imported invoice no longer exists'; end if;
  select upper(regexp_replace(rif,'[^A-Za-z0-9]','','g')) into v_supplier_rif from public.shared_inventory_suppliers where tenant_id=p_tenant_id and id=v_invoice.supplier_id;
  if v_invoice.invoice_number <> coalesce(p_invoice->>'documentNumber','')
    or coalesce(v_invoice.control_number,'') <> coalesce(p_invoice->>'controlNumber','')
    or v_invoice.invoice_date <> (p_invoice->>'date')::date
    or coalesce(v_invoice.currency_code,'VES') <> coalesce(p_invoice->>'currency','VES')
    or coalesce(v_supplier_rif,'') <> upper(regexp_replace(coalesce(p_supplier->>'rif',''),'[^A-Za-z0-9]','','g')) then
    raise exception 'La identidad de la factura importada fue modificada';
  end if;
  if v_invoice.status='confirmada' then
    return jsonb_build_object('invoiceId',p_target_invoice_id,'status','confirmed','idempotent',true);
  end if;
  if v_invoice.status <> 'borrador' then raise exception 'Solo se puede completar un borrador importado'; end if;
  if exists(select 1 from public.shared_inventory_purchase_invoice_items where tenant_id=p_tenant_id and invoice_id=p_target_invoice_id) then
    raise exception 'El borrador ya contiene productos y no puede importar detalles CSV';
  end if;
  v_authoritative := jsonb_build_object(
    'companyId',v_invoice.company_id,'revision',p_invoice->>'revision',
    'documentNumber',v_invoice.invoice_number,'controlNumber',coalesce(v_invoice.control_number,''),
    'date',v_invoice.invoice_date::text,'currency',coalesce(v_invoice.currency_code,'VES'),
    'subtotal',p_invoice->>'subtotal','vatAmount',p_invoice->>'vatAmount','total',p_invoice->>'total',
    'dollarRate',coalesce(v_invoice.dollar_rate::text,''),'exchangeRates',coalesce(v_invoice.exchange_rates,'[]'::jsonb),
    'notes',coalesce(v_invoice.notes,'')
  );
  -- Retain manual period/rate precision and the exact supplier identity before
  -- confirming, so inventory posting sees the same header as the draft editor.
  v_result := public.shared_inventory_purchase_csv_import_execute_line(
    p_tenant_id,p_batch_id,p_line_id,'draft',v_authoritative,p_items,
    p_supplier || jsonb_build_object('id',v_invoice.supplier_id),p_products);
  update public.shared_inventory_purchase_invoices
    set period=v_invoice.period,rate_decimals=v_invoice.rate_decimals
    where tenant_id=p_tenant_id and id=p_target_invoice_id;
  if p_mode='confirm' and jsonb_array_length(coalesce(p_items,'[]'::jsonb))>0 then
    perform public.shared_inventory_purchase_invoice_confirm(p_tenant_id,p_target_invoice_id);
    update public.shared_inventory_purchase_import_lines
      set status='completed',execution_mode='confirm',updated_at=now()
      where tenant_id=p_tenant_id and id=p_line_id;
    update public.shared_inventory_purchase_import_batches
      set status=case when exists(select 1 from public.shared_inventory_purchase_import_lines
        where tenant_id=p_tenant_id and batch_id=p_batch_id and status<>'completed') then 'in_progress' else 'completed' end,
        updated_at=now()
      where tenant_id=p_tenant_id and id=p_batch_id;
    v_result := v_result || jsonb_build_object('status','confirmed');
  end if;
  return v_result;
end $$;

revoke all on function public.shared_inventory_purchase_csv_import_save_target(uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.shared_inventory_purchase_csv_import_save_target(uuid,jsonb,jsonb,text) to service_role;
revoke all on function public.shared_inventory_purchase_csv_import_execute_target_line(uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.shared_inventory_purchase_csv_import_execute_target_line(uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,text) to service_role;

-- Re-imports are idempotent across batches.  The source line keeps its own
-- audit link; invoice lookup is serialized on the same supplier/document key.
create or replace function public.shared_inventory_purchase_csv_import_execute_resumable_line(
  p_tenant_id uuid, p_batch_id text, p_line_id text, p_mode text, p_invoice jsonb,
  p_items jsonb, p_supplier jsonb, p_products jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_batch record; v_line record; v_existing record; v_rif text; v_identity text;
begin
  if p_mode not in ('draft','confirm') then raise exception 'Invalid import execution mode'; end if;
  select * into v_batch from public.shared_inventory_purchase_import_batches
    where tenant_id=p_tenant_id and id=p_batch_id for update;
  if not found then raise exception 'Purchase import batch not found'; end if;
  if v_batch.company_id <> coalesce(p_invoice->>'companyId','') then raise exception 'Import company mismatch'; end if;
  if v_batch.revision is distinct from (p_invoice->>'revision')::integer then raise exception 'Importación desactualizada; recarga antes de ejecutar'; end if;
  select * into v_line from public.shared_inventory_purchase_import_lines
    where tenant_id=p_tenant_id and id=p_line_id and batch_id=p_batch_id for update;
  if not found then raise exception 'Purchase import line not found'; end if;
  v_rif := upper(regexp_replace(coalesce(p_supplier->>'rif',''),'[^A-Za-z0-9]','','g'));
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_batch.company_id || ':supplier:' || v_rif, 0));
  if v_line.invoice_id is not null then
    select * into v_existing from public.shared_inventory_purchase_invoices where tenant_id=p_tenant_id and company_id=v_batch.company_id and id=v_line.invoice_id for update;
    if not found then raise exception 'Imported invoice no longer exists'; end if;
    if v_existing.status='confirmada' then return jsonb_build_object('invoiceId',v_existing.id,'status','confirmed','idempotent',true); end if;
    if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 and exists(select 1 from public.shared_inventory_purchase_invoice_items where tenant_id=p_tenant_id and invoice_id=v_existing.id) then
      return jsonb_build_object('invoiceId',v_existing.id,'status','saved','idempotent',true);
    end if;
    return public.shared_inventory_purchase_csv_import_execute_line(p_tenant_id,p_batch_id,p_line_id,p_mode,p_invoice,p_items,p_supplier,p_products);
  end if;
  v_identity := lower(trim(coalesce(p_invoice->>'documentNumber',''))) || ':' || lower(trim(coalesce(p_invoice->>'controlNumber',''))) || ':' || v_rif;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || (p_invoice->>'companyId') || ':invoice:' || v_identity, 0));
  select f.* into v_existing from public.shared_inventory_purchase_invoices f
    join public.shared_inventory_suppliers s on s.tenant_id=f.tenant_id and s.id=f.supplier_id
   where f.tenant_id=p_tenant_id and f.company_id=p_invoice->>'companyId'
     and f.invoice_number=coalesce(p_invoice->>'documentNumber','') and f.control_number=coalesce(p_invoice->>'controlNumber','')
     and upper(regexp_replace(s.rif,'[^A-Za-z0-9]','','g'))=v_rif
   order by f.updated_at desc limit 1 for update;
  if found then
    update public.shared_inventory_purchase_import_lines set invoice_id=v_existing.id,updated_at=now()
      where tenant_id=p_tenant_id and id=p_line_id;
    if v_existing.status='confirmada' then
      update public.shared_inventory_purchase_import_lines set status='completed',execution_mode='confirm',processed_at=now(),updated_at=now()
        where tenant_id=p_tenant_id and id=p_line_id;
      return jsonb_build_object('invoiceId',v_existing.id,'status','confirmed','idempotent',true);
    end if;
    if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 and exists(select 1 from public.shared_inventory_purchase_invoice_items where tenant_id=p_tenant_id and invoice_id=v_existing.id) then
      update public.shared_inventory_purchase_import_lines set status='in_progress',execution_mode='draft',processed_at=now(),
        actual_subtotal=v_existing.subtotal,actual_vat_amount=v_existing.vat_amount,actual_total=v_existing.total,
        difference_total=v_existing.total-expected_total,updated_at=now() where tenant_id=p_tenant_id and id=p_line_id;
      return jsonb_build_object('invoiceId',v_existing.id,'status','saved','idempotent',true);
    end if;
  end if;
  return public.shared_inventory_purchase_csv_import_execute_line(p_tenant_id,p_batch_id,p_line_id,p_mode,p_invoice,p_items,p_supplier,p_products);
end $$;
revoke all on function public.shared_inventory_purchase_csv_import_execute_resumable_line(uuid,text,text,text,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_inventory_purchase_csv_import_execute_resumable_line(uuid,text,text,text,jsonb,jsonb,jsonb,jsonb) to service_role;

-- A full-batch save never accepts a client supplied line override.  An override
-- can only be written by the target-draft RPC above, so another browser cannot
-- erase the IVA review saved for one resumed invoice.
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
  values(p_tenant_id,gen_random_uuid()::text,v_id,(v_row->'header'->>'sourceRow')::int,v_row->'header'->>'supplierRif',v_row->'header'->>'supplierName',(v_row->'header'->>'date')::date,left(v_row->'header'->>'date',7),'factura',v_row->'header'->>'documentNumber',v_row->'header'->>'controlNumber',(v_row->'header'->>'totalBs')::numeric,v_row->'header',v_row->'items',v_row-'header'-'items'-'configOverride','imported','[]'::jsonb)
  on conflict(tenant_id,batch_id,source_row) do update set supplier_rif=excluded.supplier_rif,supplier_name=excluded.supplier_name,invoice_date=excluded.invoice_date,period=excluded.period,document_number=excluded.document_number,control_number=excluded.control_number,expected_total=excluded.expected_total,source_header=excluded.source_header,source_items=excluded.source_items,
    calculation=excluded.calculation || case when shared_inventory_purchase_import_lines.calculation ? 'configOverride'
      then jsonb_build_object('configOverride',shared_inventory_purchase_import_lines.calculation->'configOverride') else '{}'::jsonb end,updated_at=now()
    where shared_inventory_purchase_import_lines.invoice_id is null or exists(select 1 from public.shared_inventory_purchase_invoices f where f.tenant_id=p_tenant_id and f.id=shared_inventory_purchase_import_lines.invoice_id and f.status='borrador');
 end loop;
 delete from public.shared_inventory_purchase_import_lines l where l.tenant_id=p_tenant_id and l.batch_id=v_id and l.invoice_id is null and not exists(select 1 from jsonb_array_elements(p_rows) r where (r->'header'->>'sourceRow')::int=l.source_row);
end$$;
