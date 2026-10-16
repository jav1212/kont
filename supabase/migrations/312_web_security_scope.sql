-- A restricted grant category stays restricted when its final grant is removed.
create table public.organization_scoped_grant_policies (
  membership_id uuid not null references public.organization_memberships(id) on delete cascade,
  permission_code text not null references public.access_control_permissions(code),
  target_kind text not null,
  company_id text not null default '',
  primary key(membership_id,permission_code,target_kind,company_id)
);
alter table public.organization_scoped_grant_policies enable row level security;
revoke all on public.organization_scoped_grant_policies from public,anon,authenticated,service_role;
insert into public.organization_scoped_grant_policies
  select distinct membership_id,permission_code,target_kind,company_id from public.organization_membership_scoped_grants;

create function public.retain_scoped_grant_policy() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    insert into public.organization_scoped_grant_policies values(new.membership_id,new.permission_code,new.target_kind,new.company_id) on conflict do nothing;
    return new;
  end if;
  return old;
end $$;
revoke all on function public.retain_scoped_grant_policy() from public,anon,authenticated,service_role;
create trigger retain_scoped_grant_policy after insert on public.organization_membership_scoped_grants
  for each row execute function public.retain_scoped_grant_policy();

create function public.web_user_security_scope(p_actor_id uuid,p_organization_id uuid,p_credential_session boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_membership uuid; v_tenant uuid;
begin
  select m.id,o.legacy_tenant_id into v_membership,v_tenant
  from public.organization_memberships m join public.organizations o on o.id=m.organization_id
  join public.organization_roles r on r.id=m.role_id and r.organization_id=o.id
  where m.user_id=p_actor_id and o.id=p_organization_id and m.status='active' and o.status='active' and r.status='active';
  if not found then raise exception 'ORGANIZATIONAL_USER_ACCESS_DENIED'; end if;
  -- A valid provider cookie cannot bypass an organization's password-session policy.
  -- Merely reading an API never resets inactivity or failed-attempt evidence.
  if p_credential_session and exists(
    select 1 from public.account_security_policies p join auth.users u on u.id=p_actor_id
    left join public.account_security_states s on s.organization_id=p.organization_id and s.user_id=p_actor_id
    where p.organization_id=p_organization_id and (
      s.locked_until>clock_timestamp()
      or (p.password_maximum_age_days is not null and coalesce(s.password_changed_at,u.created_at)
        + make_interval(days=>p.password_maximum_age_days)<=clock_timestamp())
      or (p.inactivity_maximum_days is not null and coalesce(s.last_authenticated_at,u.created_at)
        + make_interval(days=>p.inactivity_maximum_days)<=clock_timestamp())
    )
  ) then raise exception 'ACCOUNT_SECURITY_DENIED'; end if;
  return jsonb_build_object('tenantId',v_tenant,'organizationId',p_organization_id,
    'allowedCompanyIds',case when exists(select 1 from public.organization_user_security where organization_id=p_organization_id and user_id=p_actor_id)
      then coalesce((select jsonb_agg(company_id order by company_id) from public.organization_user_allowed_companies where organization_id=p_organization_id and user_id=p_actor_id),'[]'::jsonb) else null end,
    'policies',coalesce((select jsonb_agg(jsonb_build_object('permission',permission_code,'kind',target_kind,'companyId',company_id)) from public.organization_scoped_grant_policies where membership_id=v_membership),'[]'::jsonb),
    'grants',coalesce((select jsonb_agg(jsonb_build_object('permission',permission_code,'kind',target_kind,'targetId',target_id,'companyId',company_id)) from public.organization_membership_scoped_grants where membership_id=v_membership),'[]'::jsonb));
end $$;
revoke all on function public.web_user_security_scope(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.web_user_security_scope(uuid,uuid,boolean) to service_role;
