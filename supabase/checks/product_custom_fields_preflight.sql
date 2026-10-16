-- Read-only preflight for ADM-053. Run against the development project only.
select
  to_regclass('public.shared_inventory_product_custom_field_catalogs') is not null as catalog_table_exists,
  to_regclass('public.shared_inventory_product_custom_field_values') is not null as values_table_exists,
  count(*) filter (where custom_fields <> '{}'::jsonb) as legacy_products_with_custom_fields
from public.shared_inventory_products;

select
  c.relname as table_name,
  c.relrowsecurity as row_level_security_enabled,
  coalesce(array_agg(distinct p.grantee) filter (where p.privilege_type is not null), array[]::text[]) as direct_grantees
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join information_schema.role_table_grants p on p.table_schema = n.nspname and p.table_name = c.relname
where n.nspname = 'public'
  and c.relname in ('shared_inventory_product_custom_field_catalogs', 'shared_inventory_product_custom_field_values')
group by c.relname, c.relrowsecurity
order by c.relname;

select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'get_native_product_custom_field_catalog',
    'replace_native_product_custom_field_catalog',
    'get_native_product_custom_field_values',
    'replace_native_product_custom_field_values'
  )
order by routine_name, grantee;
