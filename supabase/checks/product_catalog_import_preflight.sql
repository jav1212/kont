-- Read-only ADM-005 preflight. Run only against the authorized development project.
select
  to_regclass('public.shared_product_catalog_import_requests') is not null as request_table_exists,
  to_regclass('public.shared_product_catalog_import_events') is not null as event_table_exists,
  count(*) filter (where organization_id is not null) as companies_in_organizations
from public.shared_companies;

select c.relname as table_name,c.relrowsecurity as rls_enabled,
  coalesce(array_agg(distinct g.grantee) filter(where g.privilege_type is not null),array[]::text[]) as direct_grantees
from pg_class c join pg_namespace n on n.oid=c.relnamespace
left join information_schema.role_table_grants g on g.table_schema=n.nspname and g.table_name=c.relname
where n.nspname='public' and c.relname in('shared_product_catalog_import_requests','shared_product_catalog_import_events')
group by c.relname,c.relrowsecurity order by c.relname;

select p.oid::regprocedure::text as signature,p.prosecdef,p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in('preview_native_product_catalog_import','execute_native_product_catalog_import','assert_user_security_access')
order by signature;

select
  count(*) filter(where code_group_count>1) as duplicate_product_code_groups,
  sum(code_group_count) filter(where code_group_count>1) as duplicate_product_code_rows
from (select tenant_id,company_id,lower(btrim(code)) as code_key,count(*) as code_group_count from public.shared_inventory_products group by tenant_id,company_id,lower(btrim(code))) groups;

select count(*) as legacy_barcode_values_missing_from_multi_barcode_table
from public.shared_inventory_products p
where nullif(btrim(p.barcode),'') is not null and not exists(select 1 from public.shared_product_barcodes b where b.tenant_id=p.tenant_id and b.product_id=p.id and b.value=p.barcode);
