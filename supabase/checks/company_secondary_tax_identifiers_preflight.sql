-- Read-only ADM-027 preflight. Run against the development project.
select
  to_regclass('public.shared_company_secondary_tax_identifiers') is not null as identifiers_table_exists,
  to_regclass('public.shared_company_secondary_tax_identifier_events') is not null as events_table_exists,
  count(*) as companies
from public.shared_companies;

select
  p.proname,
  p.proconfig,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_native_company_secondary_tax_identifiers',
    'set_native_company_secondary_tax_identifier',
    'remove_native_company_secondary_tax_identifier'
  )
order by p.proname;

select count(*) as eligible_smoke_company_memberships
from public.shared_companies c
join public.organization_memberships m
  on m.organization_id = c.organization_id and m.status = 'active'
join public.organization_roles r
  on r.id = m.role_id and r.organization_id = m.organization_id and r.status = 'active'
join public.organization_role_permissions readp
  on readp.role_id = r.id and readp.permission_code = 'companies.read'
join public.organization_role_permissions updatep
  on updatep.role_id = r.id and updatep.permission_code = 'companies.update'
where c.organization_id is not null and c.status = 'active';
