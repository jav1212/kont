-- Read-only ADM-028 preflight against the authorized development project.
select
  count(*) as company_count,
  count(*) filter (where person_nature is null) as awaiting_verified_nature,
  count(*) filter (where person_nature = 'natural') as natural_person_count,
  count(*) filter (where person_nature = 'juridical') as juridical_person_count,
  count(*) filter (where taxpayer_type = 'ordinario') as ordinary_taxpayer_count,
  count(*) filter (where taxpayer_type = 'especial') as special_taxpayer_count
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
  and p.proname in ('create_native_company_with_person_nature', 'set_native_company_person_nature')
order by p.proname;

select count(*) as authorized_smoke_memberships
from public.organizations o
join public.organization_memberships m on m.organization_id = o.id and m.status = 'active'
join public.organization_roles r on r.id = m.role_id and r.organization_id = m.organization_id and r.status = 'active'
join public.organization_role_permissions createp on createp.role_id = r.id and createp.permission_code = 'companies.create'
join public.organization_role_permissions updatep on updatep.role_id = r.id and updatep.permission_code = 'companies.update'
where o.status = 'active';
