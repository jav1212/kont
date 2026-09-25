-- Sales dashboard visibility is a read capability beneath sales.read. Keep the
-- permission explicit: a cashier may read invoices without receiving aggregate
-- commercial indicators.
--
-- The shared catalog serves legacy authorization consumers. Organization roles
-- are the native source of truth and are updated independently per workspace.

insert into public.shared_authorization_permissions (code, resource, action, description)
values ('sales.read.dashboard', 'sales.dashboard', 'read', 'Ver tablero e indicadores de ventas')
on conflict (code) do update
set resource = excluded.resource,
    action = excluded.action,
    description = excluded.description;

delete from public.shared_authorization_role_permissions
where role = 'cajero'
  and permission_code = 'sales.read.dashboard';

-- Preserve existing global-role behavior for each role that already reads sales,
-- while deliberately excluding cashiers.
insert into public.shared_authorization_role_permissions (role, permission_code)
select grant_row.role, 'sales.read.dashboard'
from public.shared_authorization_role_permissions grant_row
where grant_row.permission_code = 'sales.read'
  and grant_row.role <> 'cajero'
on conflict (role, permission_code) do nothing;

insert into public.access_control_permissions (code, resource, action, description)
values ('sales.read.dashboard', 'sales.dashboard', 'read', 'Ver tablero e indicadores de ventas')
on conflict (code) do update
set resource = excluded.resource,
    action = excluded.action,
    description = excluded.description;

delete from public.organization_role_permissions grant_row
using public.organization_roles role
where grant_row.role_id = role.id
  and role.code = 'cashier'
  and grant_row.permission_code = 'sales.read.dashboard';

-- System templates, their organization copies, and custom roles retain the
-- dashboard access they had implicitly through sales.read. The row trigger on
-- organization_role_permissions increments each affected role and membership
-- authorization version, invalidating native authorization snapshots.
insert into public.organization_role_permissions (role_id, permission_code)
select role.id, 'sales.read.dashboard'
from public.organization_roles role
join public.organization_role_permissions sales_read
  on sales_read.role_id = role.id
 and sales_read.permission_code = 'sales.read'
where role.status = 'active'
  and role.code <> 'cashier'
on conflict (role_id, permission_code) do nothing;

-- This migration only writes grants associated with the same organization role.
-- Existing RLS policies remain organization-scoped; no cross-workspace read or
-- write policy is introduced here.
do $$
begin
  if exists (
    select 1
    from public.organization_roles role
    join public.organization_role_permissions grant_row
      on grant_row.role_id = role.id
     and grant_row.permission_code = 'sales.read.dashboard'
    where role.code = 'cashier'
  ) then
    raise exception 'Cashier roles must not receive sales.read.dashboard';
  end if;
end;
$$;
