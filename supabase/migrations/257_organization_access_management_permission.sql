-- Web authorization now consumes the organization catalog. Preserve the
-- existing terminal/carnet administration capability introduced by migration
-- 254 without allowing the legacy global role editor to control organizations.
insert into public.access_control_permissions (code, resource, action, description)
values ('access.manage', 'access', 'manage', 'Gestionar terminales y carnets')
on conflict (code) do nothing;

-- Include templates (organization_id is null): the existing organization
-- provisioning trigger copies these grants when a new workspace is created.
-- Custom roles and cashier/seller/accountant defaults are never changed.
insert into public.organization_role_permissions (role_id, permission_code)
select id, 'access.manage'
from public.organization_roles
where kind = 'system' and status = 'active' and code in ('owner', 'admin')
on conflict (role_id, permission_code) do nothing;

do $$
begin
  if exists (
    select 1
    from public.organization_roles role
    where role.kind = 'system' and role.status = 'active'
      and role.code in ('owner', 'admin')
      and not exists (
        select 1 from public.organization_role_permissions grant_row
        where grant_row.role_id = role.id and grant_row.permission_code = 'access.manage'
      )
  ) then
    raise exception 'Organization access administration defaults were not provisioned';
  end if;
end;
$$;
