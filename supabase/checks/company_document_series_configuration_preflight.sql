-- Read-only ADM-017/018/019 preflight for the authorized development project.
select
  to_regclass('public.shared_company_document_series') is not null as series_table_exists,
  to_regclass('public.shared_company_document_series_selection_rules') is not null as rules_table_exists,
  to_regclass('public.shared_company_document_series_requests') is not null as requests_table_exists,
  to_regclass('public.shared_company_document_series_events') is not null as events_table_exists,
  to_regclass('public.shared_company_branches') is not null as branches_table_exists;

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments, p.proconfig,
  has_function_privilege('anon',p.oid,'execute') as anon_execute,
  has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'execute') as service_role_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'create_native_company_document_series', 'list_native_company_document_series',
  'configure_native_company_document_series_selection_rule'
)
order by p.proname;

select indexname, indexdef
from pg_indexes
where schemaname='public' and indexname in (
  'shared_company_document_series_organization_idx',
  'shared_company_document_series_branch_scope_fk_idx',
  'shared_company_document_series_rules_organization_idx',
  'shared_company_document_series_rules_branch_scope_fk_idx',
  'shared_company_document_series_requests_tenant_idx',
  'shared_company_document_series_events_tenant_company_idx',
  'shared_company_document_series_events_series_scope_idx'
)
order by indexname;

select count(*) as eligible_smoke_company_memberships
from public.shared_companies c
join public.organization_memberships m on m.organization_id=c.organization_id and m.status='active'
join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.status='active'
join public.organization_role_permissions readp on readp.role_id=r.id and readp.permission_code='companies.read'
join public.organization_role_permissions updatep on updatep.role_id=r.id and updatep.permission_code='companies.update'
join public.organization_role_permissions branchcreatep on branchcreatep.role_id=r.id and branchcreatep.permission_code='branches.create'
where c.organization_id is not null and c.status='active';
