-- Read models execute in PostgREST read-only transactions. They authorize the
-- caller without row locks because they do not make write decisions.
create or replace function public.assert_user_security_read_access(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_company_id text default null,
  p_permission text default 'members.update'
) returns uuid
language plpgsql stable security definer set search_path=public as $$
declare v_tenant_id uuid;
begin
  select o.legacy_tenant_id into v_tenant_id
  from public.organizations o
  join public.organization_memberships m on m.organization_id=o.id
  join public.organization_roles r on r.id=m.role_id and r.organization_id=o.id
  join public.organization_role_permissions rp on rp.role_id=r.id
  where o.id=p_organization_id and o.status='active' and m.user_id=p_actor_user_id
    and m.status='active' and r.status='active' and rp.permission_code=p_permission;
  if not found then raise exception 'ORGANIZATIONAL_USER_ACCESS_DENIED'; end if;
  if p_company_id is not null and not exists(
    select 1 from public.shared_companies c
    where c.organization_id=p_organization_id and c.id=p_company_id
  ) then raise exception 'ORGANIZATIONAL_USER_COMPANY_INVALID'; end if;
  if p_company_id is not null and exists(
    select 1 from public.organization_user_security s
    where s.organization_id=p_organization_id and s.user_id=p_actor_user_id
  ) and not exists(
    select 1 from public.organization_user_allowed_companies a
    where a.organization_id=p_organization_id and a.user_id=p_actor_user_id
      and a.company_id=p_company_id
  ) then raise exception 'ORGANIZATIONAL_USER_ACCESS_DENIED'; end if;
  return v_tenant_id;
end $$;

comment on function public.assert_user_security_read_access(uuid,uuid,text,text) is
  'Authorizes read-only RPCs without row locks. STABLE functions run in read-only PostgREST transactions and do not make write decisions.';

revoke all on function public.assert_user_security_read_access(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.assert_user_security_read_access(uuid,uuid,text,text) to service_role;

-- Retain the complete current Treasury query definition and replace only the
-- lock-taking authorization helper. This keeps its STABLE MVCC contract intact.
do $$
declare v_definition text;
begin
  select replace(
    pg_get_functiondef('public.shared_treasury_query(jsonb,jsonb)'::regprocedure),
    'public.assert_user_security_access(',
    'public.assert_user_security_read_access('
  ) into v_definition;
  execute v_definition;
end $$;

revoke all on function public.shared_treasury_query(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_treasury_query(jsonb,jsonb) to service_role;
