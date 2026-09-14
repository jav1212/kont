-- The historic one-file report has no supplier RIF or invoice control number.
-- Resolve its supplier under tenant/company scope and use the catalog supplier
-- identity plus document/date as its re-import key.  Existing controls remain
-- authoritative on drafts; confirmed invoices are immutable/idempotent.
create or replace function public.shared_inventory_purchase_csv_import_execute_resumable_line(
  p_tenant_id uuid, p_batch_id text, p_line_id text, p_mode text, p_invoice jsonb,
  p_items jsonb, p_supplier jsonb, p_products jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_batch record; v_line record; v_existing record; v_supplier record;
  v_rif text; v_identity text; v_count integer; v_supplier_id text;
  v_name_key text := upper(btrim(regexp_replace(translate(coalesce(p_supplier->>'name',''),
    'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑáàäâéèëêíìïîóòöôúùüûñ',
    'AAAAEEEEIIIIOOOOUUUUNaaaaeeeeiiiioooouuuun'), '[^A-Za-z0-9]+', ' ', 'g')));
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

  if p_supplier->>'sourceFormat' = 'complete' then
    if nullif(p_supplier->>'id','') is not null then
      select * into v_supplier from public.shared_inventory_suppliers
        where tenant_id=p_tenant_id and company_id=v_batch.company_id and id=p_supplier->>'id' and active;
      if not found then raise exception 'El proveedor seleccionado no pertenece a la empresa o está inactivo'; end if;
    else
      select count(*), min(id) into v_count,v_supplier_id from public.shared_inventory_suppliers
       where tenant_id=p_tenant_id and company_id=v_batch.company_id and active
         and upper(btrim(regexp_replace(translate(name,
           'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑáàäâéèëêíìïîóòöôúùüûñ',
           'AAAAEEEEIIIIOOOOUUUUNaaaaeeeeiiiioooouuuun'), '[^A-Za-z0-9]+', ' ', 'g')))=v_name_key;
      if v_count=0 then raise exception 'No se encontró un proveedor activo con ese nombre; selecciona o crea el proveedor'; end if;
      if v_count>1 then raise exception 'Proveedor ambiguo: selecciona una coincidencia'; end if;
      select * into v_supplier from public.shared_inventory_suppliers
        where tenant_id=p_tenant_id and company_id=v_batch.company_id and id=v_supplier_id and active;
      if not found then raise exception 'El proveedor coincidente ya no está activo; selecciona otro proveedor'; end if;
    end if;
    v_rif := upper(regexp_replace(coalesce(v_supplier.rif,''),'[^A-Za-z0-9]','','g'));
    -- Legacy execution takes the fiscal-RIF advisory lock before touching a
    -- supplier row. Keep that ordering when complete files resolve by name.
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_batch.company_id || ':supplier:' || v_rif, 0));
    select * into v_supplier from public.shared_inventory_suppliers
      where tenant_id=p_tenant_id and company_id=v_batch.company_id and id=v_supplier.id and active for update;
    if not found then raise exception 'El proveedor seleccionado ya no está activo'; end if;
    p_supplier := p_supplier || jsonb_build_object('id',v_supplier.id,'rif',v_supplier.rif);
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_batch.company_id || ':supplier-id:' || v_supplier.id, 0));

    if v_line.invoice_id is not null then
      select * into v_existing from public.shared_inventory_purchase_invoices
       where tenant_id=p_tenant_id and company_id=v_batch.company_id and id=v_line.invoice_id for update;
      if not found then raise exception 'Imported invoice no longer exists'; end if;
      if v_existing.status='confirmada' then return jsonb_build_object('invoiceId',v_existing.id,'status','confirmed','idempotent',true); end if;
      p_invoice := jsonb_set(p_invoice,'{controlNumber}',to_jsonb(coalesce(v_existing.control_number,'')));
      return public.shared_inventory_purchase_csv_import_execute_line(p_tenant_id,p_batch_id,p_line_id,p_mode,p_invoice,p_items,p_supplier,p_products);
    end if;

    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_batch.company_id || ':complete-invoice:' || v_supplier.id || ':' || coalesce(p_invoice->>'documentNumber','') || ':' || coalesce(p_invoice->>'date',''), 0));
    select count(*),min(f.id) into v_count,v_supplier_id from public.shared_inventory_purchase_invoices f
      where f.tenant_id=p_tenant_id and f.company_id=v_batch.company_id and f.supplier_id=v_supplier.id
        and f.invoice_number=coalesce(p_invoice->>'documentNumber','');
    if v_count>1 then raise exception 'Factura ambigua para proveedor y documento; revísala antes de reimportar'; end if;
    if v_count=1 then
      select * into v_existing from public.shared_inventory_purchase_invoices where tenant_id=p_tenant_id and id=v_supplier_id for update;
      update public.shared_inventory_purchase_import_lines set invoice_id=v_existing.id,updated_at=now() where tenant_id=p_tenant_id and id=v_line.id;
      if v_existing.status='confirmada' then
        update public.shared_inventory_purchase_import_lines set status='completed',execution_mode='confirm',processed_at=now(),updated_at=now() where tenant_id=p_tenant_id and id=v_line.id;
        return jsonb_build_object('invoiceId',v_existing.id,'status','confirmed','idempotent',true);
      end if;
      p_invoice := jsonb_set(p_invoice,'{controlNumber}',to_jsonb(coalesce(v_existing.control_number,'')));
    end if;
    return public.shared_inventory_purchase_csv_import_execute_line(p_tenant_id,p_batch_id,p_line_id,p_mode,p_invoice,p_items,p_supplier,p_products);
  end if;

  -- Legacy two-file reports retain their RIF/control identity unchanged.
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
  select f.* into v_existing from public.shared_inventory_purchase_invoices f join public.shared_inventory_suppliers s on s.tenant_id=f.tenant_id and s.id=f.supplier_id
   where f.tenant_id=p_tenant_id and f.company_id=p_invoice->>'companyId' and f.invoice_number=coalesce(p_invoice->>'documentNumber','') and f.control_number=coalesce(p_invoice->>'controlNumber','') and upper(regexp_replace(s.rif,'[^A-Za-z0-9]','','g'))=v_rif
   order by f.updated_at desc limit 1 for update;
  if found then
    update public.shared_inventory_purchase_import_lines set invoice_id=v_existing.id,updated_at=now() where tenant_id=p_tenant_id and id=p_line_id;
    if v_existing.status='confirmada' then
      update public.shared_inventory_purchase_import_lines set status='completed',execution_mode='confirm',processed_at=now(),updated_at=now() where tenant_id=p_tenant_id and id=p_line_id;
      return jsonb_build_object('invoiceId',v_existing.id,'status','confirmed','idempotent',true);
    end if;
    if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 and exists(select 1 from public.shared_inventory_purchase_invoice_items where tenant_id=p_tenant_id and invoice_id=v_existing.id) then
      update public.shared_inventory_purchase_import_lines set status='in_progress',execution_mode='draft',processed_at=now(),actual_subtotal=v_existing.subtotal,actual_vat_amount=v_existing.vat_amount,actual_total=v_existing.total,difference_total=v_existing.total-expected_total,updated_at=now() where tenant_id=p_tenant_id and id=p_line_id;
      return jsonb_build_object('invoiceId',v_existing.id,'status','saved','idempotent',true);
    end if;
  end if;
  return public.shared_inventory_purchase_csv_import_execute_line(p_tenant_id,p_batch_id,p_line_id,p_mode,p_invoice,p_items,p_supplier,p_products);
end $$;
revoke all on function public.shared_inventory_purchase_csv_import_execute_resumable_line(uuid,text,text,text,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_inventory_purchase_csv_import_execute_resumable_line(uuid,text,text,text,jsonb,jsonb,jsonb,jsonb) to service_role;
