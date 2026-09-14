-- Organization-local system roles retain their identity and lifecycle, but each
-- workspace may tailor the grants of its non-owner defaults. Global templates
-- remain immutable inputs for provisioning future organizations.

create or replace function public.access_control_replace_role_permissions(p_role_id uuid,p_permissions text[])
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(
    select 1 from public.organization_roles
    where id=p_role_id
      and organization_id is not null
      and status='active'
      and code<>'owner'
      and kind in ('custom','system')
    for update
  ) then
    raise exception 'Only active custom roles or non-owner organization system roles can be modified';
  end if;
  if exists(select 1 from unnest(p_permissions) as requested_permission(code) left join public.access_control_permissions permission on permission.code=requested_permission.code where permission.code is null) then raise exception 'Unknown permission'; end if;
  delete from public.organization_role_permissions where role_id=p_role_id;
  insert into public.organization_role_permissions(role_id,permission_code) select p_role_id,requested_permission.code from unnest(p_permissions) as requested_permission(code) on conflict do nothing;
end $$;

create or replace function public.access_control_update_role(p_role_id uuid,p_expected_version integer,p_name text,p_description text,p_permissions text[],p_update_name boolean,p_update_description boolean,p_update_permissions boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_current integer; v_kind text;
begin
  if p_expected_version is null or p_expected_version < 1 then raise exception 'ROLE_INVALID'; end if;
  select version,kind into v_current,v_kind from public.organization_roles
  where id=p_role_id
    and organization_id is not null
    and status='active'
    and code<>'owner'
    and kind in ('custom','system')
  for update;
  if v_current is null then raise exception 'ROLE_NOT_FOUND'; end if;
  if v_current<>p_expected_version then raise exception 'ROLE_VERSION_CONFLICT'; end if;
  if v_kind='system' and (p_update_name or p_update_description) then raise exception 'SYSTEM_ROLE_IMMUTABLE'; end if;
  if p_update_permissions and exists(select 1 from unnest(p_permissions) as requested_permission(code) left join public.access_control_permissions permission on permission.code=requested_permission.code where permission.code is null) then raise exception 'ROLE_INVALID'; end if;
  update public.organization_roles set name=case when p_update_name then trim(p_name) else name end,description=case when p_update_description then trim(p_description) else description end,version=version+1,updated_at=now() where id=p_role_id;
  if p_update_permissions then
    delete from public.organization_role_permissions where role_id=p_role_id;
    insert into public.organization_role_permissions(role_id,permission_code) select p_role_id,requested_permission.code from unnest(p_permissions) as requested_permission(code) on conflict do nothing;
  end if;
  return public.access_control_role_json(p_role_id);
end $$;

revoke all on function public.access_control_replace_role_permissions(uuid,text[]),public.access_control_update_role(uuid,integer,text,text,text[],boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.access_control_replace_role_permissions(uuid,text[]),public.access_control_update_role(uuid,integer,text,text,text[],boolean,boolean,boolean) to service_role;
