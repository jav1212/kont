-- Read-only checks for ADM-029 after migration installation.
select
  to_regclass('public.shared_inventory_product_category_aliases') as alias_table,
  to_regclass('public.shared_inventory_product_category_alias_events') as event_table,
  (select count(*) from public.shared_inventory_departments) as category_count,
  (select count(*) from public.shared_inventory_product_category_aliases) as alias_count,
  (select count(*) from public.shared_inventory_product_category_alias_events) as event_count;

select p.proname,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'list_native_product_category_aliases',
  'create_native_product_category_alias',
  'retire_native_product_category_alias',
  'resolve_native_product_category_alias',
  'guard_product_category_alias_name'
)
order by p.proname;

select c.conname, c.contype, c.convalidated
from pg_constraint c
where c.conrelid in (
  'public.shared_inventory_product_category_aliases'::regclass,
  'public.shared_inventory_product_category_alias_events'::regclass
)
order by c.conrelid::regclass::text, c.conname;
