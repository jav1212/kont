alter table public.organizations add column if not exists version integer not null default 1 check (version > 0);

insert into public.shared_authorization_permissions(code, resource, action, description) values
  ('organizations.read', 'organizations', 'read', 'Ver la configuración de la organización'),
  ('organizations.update', 'organizations', 'update', 'Editar la configuración de la organización')
on conflict (code) do update set description = excluded.description;
insert into public.shared_authorization_role_permissions(role, permission_code) values
  ('admin', 'organizations.read'), ('admin', 'organizations.update')
on conflict do nothing;

insert into public.access_control_permissions(code, resource, action, description) values
  ('organizations.read', 'organizations', 'read', 'Ver la configuración de la organización'),
  ('organizations.update', 'organizations', 'update', 'Editar la configuración de la organización')
on conflict (code) do update set description = excluded.description;
insert into public.organization_role_permissions(role_id, permission_code)
select id, permission.code from public.organization_roles role
cross join (values ('organizations.read'), ('organizations.update')) permission(code)
where role.code in ('owner', 'admin')
on conflict do nothing;

create or replace function public.update_organization_native(p_organization_id uuid, p_expected_version integer, p_name text, p_logo_url text, p_update_name boolean, p_update_logo_url boolean)
returns public.organizations language plpgsql security definer set search_path = public as $$
declare v_result public.organizations;
begin
  update public.organizations set
    name = case when p_update_name then trim(p_name) else name end,
    avatar_url = case when p_update_logo_url then p_logo_url else avatar_url end,
    version = version + 1,
    updated_at = now()
  where id = p_organization_id and version = p_expected_version returning * into v_result;
  if v_result.id is null then raise exception 'ORGANIZATION_VERSION_CONFLICT'; end if;
  return v_result;
end; $$;
revoke all on function public.update_organization_native(uuid, integer, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.update_organization_native(uuid, integer, text, text, boolean, boolean) to service_role;

insert into storage.buckets (id, name, public) values ('organization-logos', 'organization-logos', true) on conflict (id) do nothing;
drop policy if exists organization_logos_public_read on storage.objects;
create policy organization_logos_public_read on storage.objects for select using (bucket_id = 'organization-logos');
