-- Run after migration 253 against a disposable database with a company fixture.
-- Every invoice, product and movement created here is rolled back.
\set ON_ERROR_STOP on
begin;
do $$
declare
  t uuid; c text; b text := gen_random_uuid()::text;
  b2 text := gen_random_uuid()::text; b3 text := gen_random_uuid()::text;
  l text; sibling_line text; l2 text; l3 text; inv text; sibling_inv text; prod text;
  doc text := 'RESUME-' || gen_random_uuid()::text;
  code text := 'RESUME-' || gen_random_uuid()::text;
  rif text := 'J' || lpad((random()*999999999)::bigint::text,9,'0');
  header jsonb; staged jsonb; sibling jsonb; batch jsonb; config jsonb; override_config jsonb;
  payload jsonb; details jsonb; products jsonb; supplier jsonb; response jsonb;
  sibling_before jsonb; saved_items jsonb; saved_totals jsonb; movement_count integer;
begin
  select tenant_id,id into t,c from public.shared_companies limit 1;
  if t is null then raise exception 'Fixture requires a company'; end if;
  config := '{"reviewed":true,"costsIncludeVat":false,"vatMappings":{"IVA":"general_16"}}'::jsonb;
  override_config := config || '{"costsIncludeVat":true}'::jsonb;
  header := jsonb_build_object('sourceRow',9,'date','2026-09-05','supplierName','Resume fixture','supplierRif',rif,
    'documentNumber',doc,'controlNumber','00-001','reference','153','supplierExternalId','151',
    'currency','VES','totalBs','116','documentType','Factura','exchangeRate','1');
  staged := jsonb_build_object('header',header,'items','[]'::jsonb,'selected',true,
    'productResolutions','{}'::jsonb,'acceptDifference',true);
  sibling := staged || jsonb_build_object('header',header || jsonb_build_object('sourceRow',10,'documentNumber',doc || '-B'));
  batch := jsonb_build_object('id',b,'companyId',c,'period','2026-09','fileName','fixture.csv','companyRif','', 'config',config);
  perform public.shared_inventory_purchase_csv_import_save(t,batch,jsonb_build_array(staged,sibling));
  select id into l from public.shared_inventory_purchase_import_lines where tenant_id=t and batch_id=b and source_row=9;
  select id into sibling_line from public.shared_inventory_purchase_import_lines where tenant_id=t and batch_id=b and source_row=10;
  supplier := jsonb_build_object('rif',rif,'name','Resume fixture');
  payload := jsonb_build_object('companyId',c,'revision',1,'documentNumber',doc,'controlNumber','00-001',
    'date','2026-09-05','currency','VES','subtotal','0','vatAmount','0','total','116');
  response := public.shared_inventory_purchase_csv_import_execute_resumable_line(t,b,l,'draft',payload,'[]'::jsonb,supplier,'[]'::jsonb);
  inv := response->>'invoiceId';
  response := public.shared_inventory_purchase_csv_import_execute_resumable_line(t,b,sibling_line,'draft',
    payload || jsonb_build_object('documentNumber',doc || '-B'),'[]'::jsonb,supplier,'[]'::jsonb);
  sibling_inv := response->>'invoiceId';
  select to_jsonb(x) into sibling_before from public.shared_inventory_purchase_import_lines x where tenant_id=t and id=sibling_line;

  details := jsonb_build_array(jsonb_build_object('code',code,'quantity','1','unitCost','100','totalCost','100',
    'vatRate','general_16','currency','VES','currencyCost','100','exchangeRate','1'));
  products := jsonb_build_array(jsonb_build_object('code',code,'name','Resume product','measureUnit','unidad',
    'valuationMethod','promedio_ponderado','vatType','general'));
  staged := staged || jsonb_build_object('items',details);
  perform public.shared_inventory_purchase_csv_import_save_target(t,
    batch || jsonb_build_object('revision',1,'config',override_config),jsonb_build_array(staged),inv);
  if (select to_jsonb(x) from public.shared_inventory_purchase_import_lines x where tenant_id=t and id=sibling_line) is distinct from sibling_before then
    raise exception 'Target save changed a sibling';
  end if;
  if (select configuration from public.shared_inventory_purchase_import_batches where tenant_id=t and id=b) is distinct from config then
    raise exception 'Target save changed batch configuration';
  end if;
  -- Old clients omit configOverride; a full-batch save must retain its nested key.
  perform public.shared_inventory_purchase_csv_import_save(t,batch || '{"revision":2}'::jsonb,jsonb_build_array(staged,sibling));
  if (select calculation->'configOverride' from public.shared_inventory_purchase_import_lines where tenant_id=t and id=l) is distinct from override_config then
    raise exception 'Full-batch save lost line-specific IVA review';
  end if;
  payload := payload || '{"revision":3,"subtotal":"100","vatAmount":"16","total":"116"}'::jsonb;
  begin
    perform public.shared_inventory_purchase_csv_import_execute_target_line(t,b,l,'draft',payload || '{"revision":2}'::jsonb,details,supplier,products,inv);
    raise exception 'Stale target execution unexpectedly succeeded';
  exception when others then if sqlerrm not like '%desactualizada%' then raise; end if; end;
  begin
    perform public.shared_inventory_purchase_csv_import_execute_target_line(t,b,sibling_line,'draft',payload,details,supplier,products,inv);
    raise exception 'Another line unexpectedly accepted the target';
  exception when others then if sqlerrm not like '%not linked%' then raise; end if; end;
  begin
    perform public.shared_inventory_purchase_csv_import_execute_target_line(gen_random_uuid(),b,l,'draft',payload,details,supplier,products,inv);
    raise exception 'Cross-tenant target unexpectedly succeeded';
  exception when others then if sqlerrm not like '%not found%' then raise; end if; end;
  begin
    perform public.shared_inventory_purchase_csv_import_execute_target_line(t,b,l,'draft',payload || '{"companyId":"another-company"}'::jsonb,details,supplier,products,inv);
    raise exception 'Cross-company target unexpectedly succeeded';
  exception when others then if sqlerrm not like '%company mismatch%' then raise; end if; end;

  update public.shared_inventory_purchase_invoices set notes='Notas manuales',period='2026-08',rate_decimals=2 where tenant_id=t and id=inv;
  response := public.shared_inventory_purchase_csv_import_execute_target_line(t,b,l,'draft',payload,details,supplier,products,inv);
  if response->>'invoiceId'<>inv or response->>'status'<>'saved' then raise exception 'Target draft changed identity'; end if;
  if not exists(select 1 from public.shared_inventory_purchase_invoices where tenant_id=t and id=inv and notes='Notas manuales' and period='2026-08' and rate_decimals=2) then
    raise exception 'Target completion overwrote manual header fields';
  end if;
  select jsonb_agg(to_jsonb(x) order by id) into saved_items from public.shared_inventory_purchase_invoice_items x where tenant_id=t and invoice_id=inv;
  select jsonb_build_array(subtotal,vat_amount,total) into saved_totals from public.shared_inventory_purchase_invoices where tenant_id=t and id=inv;
  select product_id into prod from public.shared_inventory_purchase_invoice_items where tenant_id=t and invoice_id=inv limit 1;
  begin
    perform public.shared_inventory_purchase_csv_import_execute_target_line(t,b,l,'draft',payload,details,supplier,products,inv);
    raise exception 'Populated target unexpectedly accepted replacement';
  exception when others then if sqlerrm not like '%ya contiene productos%' then raise; end if; end;

  -- Re-importing just headers must preserve populated drafts, including retries.
  staged := staged || '{"items":[]}'::jsonb;
  perform public.shared_inventory_purchase_csv_import_save(t,batch || jsonb_build_object('id',b2),jsonb_build_array(staged));
  select id into l2 from public.shared_inventory_purchase_import_lines where tenant_id=t and batch_id=b2;
  payload := payload || '{"revision":1,"subtotal":"0","vatAmount":"0","total":"999"}'::jsonb;
  for movement_count in 1..2 loop
    response := public.shared_inventory_purchase_csv_import_execute_resumable_line(t,b2,l2,'draft',payload,'[]'::jsonb,supplier,'[]'::jsonb);
    if response->>'invoiceId'<>inv or response->>'status'<>'saved' then raise exception 'Re-import did not reuse populated draft'; end if;
    if (select jsonb_agg(to_jsonb(x) order by id) from public.shared_inventory_purchase_invoice_items x where tenant_id=t and invoice_id=inv) is distinct from saved_items then raise exception 'Header retry destroyed products'; end if;
    if (select jsonb_build_array(subtotal,vat_amount,total) from public.shared_inventory_purchase_invoices where tenant_id=t and id=inv) is distinct from saved_totals then raise exception 'Header retry replaced totals'; end if;
  end loop;

  -- Confirm the other empty draft directly, then ensure new and linked retries skip it.
  payload := payload || jsonb_build_object('revision',3,'documentNumber',doc || '-B','subtotal','100','vatAmount','16','total','116');
  products := jsonb_build_array(jsonb_build_object('code',code,'id',prod));
  response := public.shared_inventory_purchase_csv_import_execute_target_line(t,b,sibling_line,'confirm',payload,details,supplier,products,sibling_inv);
  if response->>'invoiceId'<>sibling_inv or response->>'status'<>'confirmed' then raise exception 'Target confirmation failed'; end if;
  select count(*) into movement_count from public.shared_inventory_movements where tenant_id=t and purchase_invoice_id=sibling_inv;
  if movement_count<>1 then raise exception 'Confirmation must post once'; end if;
  response := public.shared_inventory_purchase_csv_import_execute_target_line(t,b,sibling_line,'confirm',payload,details,supplier,products,sibling_inv);
  if response->>'idempotent'<>'true' then raise exception 'Confirmed target retry was not idempotent'; end if;
  perform public.shared_inventory_purchase_csv_import_save(t,batch || jsonb_build_object('id',b3),jsonb_build_array(sibling));
  select id into l3 from public.shared_inventory_purchase_import_lines where tenant_id=t and batch_id=b3;
  response := public.shared_inventory_purchase_csv_import_execute_resumable_line(t,b3,l3,'confirm',payload || '{"revision":1}'::jsonb,'[]'::jsonb,supplier,'[]'::jsonb);
  if response->>'invoiceId'<>sibling_inv or response->>'idempotent'<>'true' then raise exception 'Confirmed re-import was not omitted'; end if;
  if (select count(*) from public.shared_inventory_movements where tenant_id=t and purchase_invoice_id=sibling_inv)<>movement_count then raise exception 'Re-import duplicated stock'; end if;
end $$;
rollback;
