-- Reversible ADM-005 RPC smoke. It creates isolated source records inside one transaction and rolls them back.
begin;
set local role service_role;
do $smoke$
declare f record; source_category text:=gen_random_uuid()::text; source_product text:=gen_random_uuid()::text; extra_destination_product text:=gen_random_uuid()::text; second_barcode text:='ADM005-B2-'||gen_random_uuid()::text; preview jsonb; result jsonb; replay jsonb; selection jsonb;
begin
 select c.tenant_id,c.organization_id,c.id source_company_id,d.id destination_company_id,m.user_id actor_user_id into f
 from public.shared_companies c join public.shared_companies d on d.organization_id=c.organization_id and d.id<>c.id
 join public.organization_memberships m on m.organization_id=c.organization_id and m.status='active'
 join public.organization_roles r on r.id=m.role_id and r.status='active'
 join public.organization_role_permissions rp on rp.role_id=r.id and rp.permission_code in('inventory.read','inventory.update')
 where c.organization_id is not null group by c.tenant_id,c.organization_id,c.id,d.id,m.user_id having count(distinct rp.permission_code)=2 limit 1;
 if not found then raise exception 'No authorized same-organization fixture is available';end if;
 insert into public.shared_inventory_departments(tenant_id,id,company_id,name,description,active,version)values(f.tenant_id,source_category,f.source_company_id,'  ADM005 smoke '||source_category||'  ','rollback only',true,1);
 insert into public.shared_inventory_products(tenant_id,id,company_id,code,name,description,measure_unit,active,department_id,version)values(f.tenant_id,source_product,f.source_company_id,'  adm005-'||replace(source_product,'-','')||'  ','  ADM005 smoke product '||source_product||'  ','rollback only','unidad',true,source_category,1);
 insert into public.shared_product_barcodes(tenant_id,company_id,product_id,value)values(f.tenant_id,f.source_company_id,source_product,'ADM005-B-'||source_product);
 insert into public.shared_inventory_product_profiles(tenant_id,company_id,product_id)values(f.tenant_id,f.source_company_id,source_product);
 selection:=jsonb_build_object('sourceCategoryIds',jsonb_build_array(source_category),'sourceProductIds',jsonb_build_array(source_product),'conflictPolicy','fail');
 preview:=public.preview_native_product_catalog_import(f.actor_user_id,f.organization_id,f.source_company_id,f.destination_company_id,selection);
 if jsonb_array_length(preview->'conflicts')<>0 or preview->>'sourceSnapshotToken' is null or preview->>'destinationSnapshotToken' is null then raise exception 'Preview did not isolate clean fixture';end if;
 result:=public.execute_native_product_catalog_import(f.actor_user_id,f.organization_id,f.source_company_id,f.destination_company_id,selection,preview->>'sourceSnapshotToken',preview->>'destinationSnapshotToken','adm005-smoke-'||source_product);
 replay:=public.execute_native_product_catalog_import(f.actor_user_id,f.organization_id,f.source_company_id,f.destination_company_id,selection,preview->>'sourceSnapshotToken',preview->>'destinationSnapshotToken','adm005-smoke-'||source_product);
 if result<>replay or jsonb_array_length(result->'createdCategories')<>1 or jsonb_array_length(result->'createdProducts')<>1 then raise exception 'Atomic creation or idempotent replay failed';end if;
 if exists(select 1 from public.shared_inventory_products p join jsonb_array_elements(result->'createdProducts') x on x->>'destinationItemId'=p.id where p.code<>upper(btrim('  adm005-'||replace(source_product,'-','')||'  ')) or p.name<>btrim('  ADM005 smoke product '||source_product||'  ')) then raise exception 'Product master was not canonicalized';end if;
 if exists(select 1 from public.shared_inventory_departments d join jsonb_array_elements(result->'createdCategories') x on x->>'destinationItemId'=d.id where d.name<>btrim('  ADM005 smoke '||source_category||'  ')) then raise exception 'Category master was not canonicalized';end if;
 if exists(select 1 from public.shared_inventory_products p join jsonb_array_elements(result->'createdProducts') x on x->>'destinationItemId'=p.id where p.current_stock<>0 or p.average_cost<>0 or p.sale_price_mode is not null or p.custom_fields<>'{}'::jsonb) then raise exception 'Operational product fields were copied';end if;
 insert into public.shared_inventory_products(tenant_id,id,company_id,code,name,description,measure_unit,active,version)values(f.tenant_id,extra_destination_product,f.destination_company_id,'ADM005-EXTRA-'||replace(extra_destination_product,'-',''),'ADM005 extra barcode target','rollback only','unidad',true,1);
 insert into public.shared_inventory_product_profiles(tenant_id,company_id,product_id)values(f.tenant_id,f.destination_company_id,extra_destination_product);
 insert into public.shared_product_barcodes(tenant_id,company_id,product_id,value)values(f.tenant_id,f.destination_company_id,extra_destination_product,second_barcode),(f.tenant_id,f.source_company_id,source_product,second_barcode);
 preview:=public.preview_native_product_catalog_import(f.actor_user_id,f.organization_id,f.source_company_id,f.destination_company_id,selection);
 if (select count(*) from jsonb_array_elements(preview->'conflicts') x where x->>'itemKind'='product' and x->>'sourceItemId'=source_product and x->>'reason'='destination_product_barcode_exists')<>1 then raise exception 'Repeated barcode conflict was not deduplicated';end if;
 begin
  perform public.preview_native_product_catalog_import(f.actor_user_id,f.organization_id,f.source_company_id,f.destination_company_id,null);
  raise exception 'Malformed null selection was accepted';
 exception when raise_exception then if sqlerrm <> 'PRODUCT_CATALOG_IMPORT_INVALID' then raise; end if; end;
 begin
  perform public.preview_native_product_catalog_import(f.actor_user_id,f.organization_id,f.source_company_id,f.destination_company_id,'"not-an-object"'::jsonb);
  raise exception 'Malformed scalar selection was accepted';
 exception when raise_exception then if sqlerrm <> 'PRODUCT_CATALOG_IMPORT_INVALID' then raise; end if; end;
 begin
  perform public.preview_native_product_catalog_import(f.actor_user_id,f.organization_id,f.source_company_id,f.destination_company_id,'{"sourceCategoryIds":{},"sourceProductIds":[],"conflictPolicy":"skip"}'::jsonb);
  raise exception 'Malformed collection selection was accepted';
 exception when raise_exception then if sqlerrm <> 'PRODUCT_CATALOG_IMPORT_INVALID' then raise; end if; end;
 selection:=jsonb_build_object('sourceCategoryIds',jsonb_build_array(source_category),'sourceProductIds',jsonb_build_array(source_product),'conflictPolicy','skip');
 preview:=public.preview_native_product_catalog_import(f.actor_user_id,f.organization_id,f.source_company_id,f.destination_company_id,selection);
 if not exists(select 1 from jsonb_array_elements(preview->'conflicts') x where x->>'itemKind'='product' and x->>'sourceItemId'=source_product and x->>'reason'='destination_product_category_conflict') then raise exception 'Skipped category dependency was not reported for product';end if;
 result:=public.execute_native_product_catalog_import(f.actor_user_id,f.organization_id,f.source_company_id,f.destination_company_id,selection,preview->>'sourceSnapshotToken',preview->>'destinationSnapshotToken','adm005-skip-'||source_product);
 if jsonb_array_length(result->'createdCategories')<>0 or jsonb_array_length(result->'createdProducts')<>0 or jsonb_array_length(result->'skippedCategorySourceIds')<>1 or jsonb_array_length(result->'skippedProductSourceIds')<>1 then raise exception 'Skip dependency did not preserve category/product relationship';end if;
 update public.shared_inventory_products set code='' where tenant_id=f.tenant_id and id=source_product;
 selection:=jsonb_build_object('sourceCategoryIds','[]'::jsonb,'sourceProductIds',jsonb_build_array(source_product),'conflictPolicy','skip');
 preview:=public.preview_native_product_catalog_import(f.actor_user_id,f.organization_id,f.source_company_id,f.destination_company_id,selection);
 if not exists(select 1 from jsonb_array_elements(preview->'conflicts') x where x->>'itemKind'='product' and x->>'sourceItemId'=source_product and x->>'reason'='source_product_unsupported_master') then raise exception 'Unsupported product master was not reported';end if;
 begin perform public.execute_native_product_catalog_import(f.actor_user_id,f.organization_id,f.source_company_id,f.destination_company_id,selection,preview->>'sourceSnapshotToken','stale-destination-token','adm005-stale-'||source_product);raise exception 'Expected stale destination token';exception when others then if sqlerrm not like '%PRODUCT_CATALOG_IMPORT_DESTINATION_VERSION_CONFLICT%' then raise;end if;end;
 begin perform public.execute_native_product_catalog_import(gen_random_uuid(),f.organization_id,f.source_company_id,f.destination_company_id,selection,preview->>'sourceSnapshotToken',preview->>'destinationSnapshotToken','adm005-denied-'||source_product);raise exception 'Expected denied actor';exception when others then if sqlerrm not like '%ACCESS_DENIED%' and sqlerrm not like '%OUTSIDE_COMPANY%' then raise;end if;end;
end $smoke$;
rollback;
