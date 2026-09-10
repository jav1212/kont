-- Integration assertions run against the real PostgreSQL RPCs, with no durable data.
begin;
do $$
declare
  t uuid; c text; b text := gen_random_uuid()::text; b2 text := gen_random_uuid()::text;
  l text; l2 text; inv text; prod text; supp text; ordinary text := gen_random_uuid()::text;
  code text := 'CSV-TEST-' || gen_random_uuid()::text;
  rif text := 'J' || lpad((random()*999999999)::bigint::text,9,'0');
  doc text := 'CSV-' || gen_random_uuid()::text;
  header jsonb; staged jsonb; batch jsonb; payload jsonb; items jsonb; products jsonb; response jsonb;
  count_before integer; n integer;
begin
  select tenant_id,id into t,c from public.shared_companies limit 1;
  if t is null then raise exception 'Fixture requires a company'; end if;
  header:=jsonb_build_object('sourceRow',9,'date','2026-09-05','supplierName','CSV temporary supplier','supplierRif',rif,
    'documentNumber',doc,'controlNumber','00-001','reference','153','supplierExternalId','151','currency','USD','totalBs','116','documentType','Factura','exchangeRate','804.81');
  staged:=jsonb_build_object('header',header,'items','[]'::jsonb,'selected',true,'productResolutions','{}'::jsonb,'acceptDifference',false);
  batch:=jsonb_build_object('id',b,'companyId',c,'period','2026-09','fileName','fixture.csv','companyRif','',
    'config',jsonb_build_object('reviewed',false,'costsIncludeVat',false,'vatMappings',jsonb_build_object('IVA1','general_16')));
  perform public.shared_inventory_purchase_csv_import_save(t,batch,jsonb_build_array(staged));
  select id into l from public.shared_inventory_purchase_import_lines where tenant_id=t and batch_id=b;
  payload:=jsonb_build_object('companyId',c,'revision',1,'documentNumber',doc,'controlNumber','00-001','date','2026-09-05',
    'currency','USD','subtotal','0','vatAmount','0','total','116','dollarRate','804.81');
  response:=public.shared_inventory_purchase_csv_import_execute_line(t,b,l,'confirm',payload,'[]'::jsonb,
    jsonb_build_object('rif',rif,'name','CSV temporary supplier'),'[]'::jsonb);
  inv:=response->>'invoiceId';
  if response->>'status'<>'saved' then raise exception 'Header-only confirm must produce a draft'; end if;
  if not exists(select 1 from public.shared_inventory_purchase_invoices where tenant_id=t and id=inv and status='borrador' and subtotal=0 and vat_amount=0 and total=116) then raise exception 'Header-only draft totals invalid'; end if;
  if exists(select 1 from public.shared_inventory_movements where tenant_id=t and purchase_invoice_id=inv) then raise exception 'Draft posted stock'; end if;

  items:=jsonb_build_array(jsonb_build_object('code',code,'quantity','1','unitCost','100','totalCost','100','vatRate','general_16','currency','USD','currencyCost','0.01','exchangeRate','804.81'));
  products:=jsonb_build_array(jsonb_build_object('code',code,'name','CSV temporary product','measureUnit','unidad','valuationMethod','promedio_ponderado','vatType','general',
    'salePricing',jsonb_build_object('mode','fixed','amount',12.5,'currency','USD')));
  staged:=staged||jsonb_build_object('items',items,'acceptDifference',true);
  batch:=batch||jsonb_build_object('revision',1,'config',jsonb_build_object('reviewed',true,'costsIncludeVat',false,'vatMappings',jsonb_build_object('IVA1','general_16')));
  perform public.shared_inventory_purchase_csv_import_save(t,batch,jsonb_build_array(staged));
  if not exists(select 1 from public.shared_inventory_purchase_import_lines where tenant_id=t and id=l and invoice_id=inv and source_items=items) then raise exception 'Resume lost line/invoice identity or new detail'; end if;
  begin
    perform public.shared_inventory_purchase_csv_import_save(t,batch,jsonb_build_array(staged));
    raise exception 'Stale save unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%desactualizada%' then raise; end if;
  end;
  payload:=payload||jsonb_build_object('revision',2,'subtotal','100','vatAmount','16','total','116');
  response:=public.shared_inventory_purchase_csv_import_execute_line(t,b,l,'confirm',payload,items,jsonb_build_object('rif',rif,'name','CSV temporary supplier'),products);
  if response->>'invoiceId'<>inv or response->>'status'<>'confirmed' then raise exception 'Draft did not transition to confirmed'; end if;
  select product_id into prod from public.shared_inventory_purchase_invoice_items where tenant_id=t and invoice_id=inv;
  if not exists(select 1 from public.shared_inventory_products where tenant_id=t and id=prod and current_stock=1 and average_cost=100 and sale_price_value=12.5 and sale_price_currency_code='USD') then raise exception 'Stock, canonical cost or sale price wrong'; end if;
  if not exists(select 1 from public.shared_inventory_purchase_invoices where tenant_id=t and id=inv and status='confirmada' and subtotal=100 and vat_amount=16 and total=116 and dollar_rate=804.81) then raise exception 'Canonical all-USD totals changed'; end if;
  response:=public.shared_inventory_purchase_csv_import_execute_line(t,b,l,'confirm',payload,items,jsonb_build_object('rif',rif,'name','CSV temporary supplier'),products);
  if response->>'idempotent'<>'true' then raise exception 'Retry not idempotent'; end if;
  select count(*) into n from public.shared_inventory_movements where tenant_id=t and purchase_invoice_id=inv;
  if n<>1 then raise exception 'Retry duplicated movements'; end if;

  batch:=batch||jsonb_build_object('id',b2,'revision',null);
  perform public.shared_inventory_purchase_csv_import_save(t,batch,jsonb_build_array(staged));
  select id into l2 from public.shared_inventory_purchase_import_lines where tenant_id=t and batch_id=b2;
  payload:=payload||jsonb_build_object('revision',1);
  begin
    perform public.shared_inventory_purchase_csv_import_execute_line(t,b2,l2,'confirm',payload,items,jsonb_build_object('rif',rif,'name','CSV temporary supplier'),products);
    raise exception 'Duplicate invoice unexpectedly succeeded';
  exception when others then if sqlerrm not like '%Duplicate purchase%' then raise; end if; end;
  begin
    perform public.shared_inventory_purchase_csv_import_execute_line(gen_random_uuid(),b,l,'confirm',payload,items,jsonb_build_object('rif',rif,'name','CSV temporary supplier'),products);
    raise exception 'Cross-tenant execution unexpectedly succeeded';
  exception when others then if sqlerrm not like '%not found%' then raise; end if; end;
  begin
    perform public.shared_inventory_purchase_csv_import_execute_line(t,b2,l2,'confirm',payload||jsonb_build_object('companyId','wrong-company'),items,jsonb_build_object('rif',rif,'name','CSV temporary supplier'),products);
    raise exception 'Cross-company execution unexpectedly succeeded';
  exception when others then if sqlerrm not like '%company mismatch%' then raise; end if; end;

  select supplier_id into supp from public.shared_inventory_purchase_invoices where tenant_id=t and id=inv;
  insert into public.shared_inventory_purchase_invoices(tenant_id,id,company_id,supplier_id,invoice_number,invoice_date,period,status,dollar_rate)
    values(t,ordinary,c,supp,'STANDARD-FIXTURE','2026-09-05','2026-09','borrador',800);
  insert into public.shared_inventory_purchase_invoice_items(tenant_id,id,invoice_id,product_id,quantity,unit_cost,total_cost,vat_rate,currency,currency_cost,dollar_rate)
    values(t,gen_random_uuid()::text,ordinary,prod,1,100,100,'general_16','USD',1,800);
  perform public.shared_inventory_purchase_invoice_recalculate_totals(t,ordinary);
  if not exists(select 1 from public.shared_inventory_purchase_invoices where tenant_id=t and id=ordinary and subtotal=800 and vat_amount=128 and total=928) then raise exception 'Standard USD fiscal behavior changed'; end if;
  update public.shared_inventory_purchase_invoices set document_type='nota_credito' where tenant_id=t and id=ordinary;
  perform public.shared_inventory_purchase_invoice_recalculate_totals(t,ordinary);
  if not exists(select 1 from public.shared_inventory_purchase_invoices where tenant_id=t and id=ordinary and total=-928) then raise exception 'Standard credit sign changed'; end if;

  -- Failure after supplier/product creation must roll the entire row back.
  select count(*) into count_before from public.shared_inventory_products where tenant_id=t and company_id=c;
  begin
    perform public.shared_inventory_purchase_csv_import_execute_line(t,b2,l2,'confirm',payload||jsonb_build_object('documentNumber',doc||'-invalid','total','999'),
      jsonb_build_array((items->0)||jsonb_build_object('code',code||'-invalid')),
      jsonb_build_object('rif',rif,'name','CSV temporary supplier'),jsonb_build_array((products->0)||jsonb_build_object('code',code||'-invalid')));
    raise exception 'Invalid totals unexpectedly succeeded';
  exception when others then if sqlerrm not like '%totales guardados%' then raise; end if; end;
  select count(*) into n from public.shared_inventory_products where tenant_id=t and company_id=c;
  if n<>count_before then raise exception 'Failed row left an orphan product'; end if;

  begin
    perform public.shared_inventory_purchase_csv_import_execute_line(t,b,l,'confirm',payload,items,jsonb_build_object('rif',rif),products);
    raise exception 'Stale execution unexpectedly succeeded';
  exception when others then if sqlerrm not like '%desactualizada%' then raise; end if; end;

  -- A code collision must require a selected identity, never LIMIT 1 guessing.
  insert into public.shared_inventory_products(tenant_id,id,company_id,code,name,type,measure_unit,valuation_method,vat_type)
    values(t,gen_random_uuid()::text,c,code,'Duplicate test code','mercancia','unidad','promedio_ponderado','general');
  begin
    perform public.shared_inventory_purchase_csv_import_execute_line(t,b2,l2,'confirm',payload||jsonb_build_object('documentNumber',doc||'-ambiguous'),items,jsonb_build_object('rif',rif),products);
    raise exception 'Ambiguous product unexpectedly succeeded';
  exception when others then if sqlerrm not like '%Producto ambiguo%' then raise; end if; end;

  insert into public.shared_inventory_suppliers(tenant_id,id,company_id,rif,name)
    values(t,gen_random_uuid()::text,c,rif,'Duplicate test RIF');
  begin
    perform public.shared_inventory_purchase_csv_import_execute_line(t,b2,l2,'confirm',payload||jsonb_build_object('documentNumber',doc||'-ambiguous'),items,jsonb_build_object('rif',rif),products);
    raise exception 'Ambiguous supplier unexpectedly succeeded';
  exception when others then if sqlerrm not like '%Proveedor ambiguo%' then raise; end if; end;
end $$;
rollback;
