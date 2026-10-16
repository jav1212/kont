-- ADM-013: server-derived online presence for branches with authorized clients.
-- A branch is online while at least one authorized client heartbeat is <= 90s old.
create table public.shared_company_branch_presence (
  tenant_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  branch_id uuid not null,
  user_id uuid not null,
  client_instance_id uuid not null,
  last_seen_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, branch_id, user_id, client_instance_id),
  constraint shared_company_branch_presence_branch_fk
    foreign key (branch_id, tenant_id, company_id)
    references public.shared_company_branches(id, tenant_id, company_id) on delete cascade
);
create index shared_company_branch_presence_fresh_idx
  on public.shared_company_branch_presence(tenant_id, company_id, branch_id, last_seen_at desc);
alter table public.shared_company_branch_presence enable row level security;
revoke all on public.shared_company_branch_presence from public, anon, authenticated, service_role;

insert into public.access_control_permissions(code, resource, action, description)
values ('branches.connect', 'branches', 'connect', 'Reportar y consultar la presencia conectada de sucursales')
on conflict (code) do update set description = excluded.description;
insert into public.organization_role_permissions(role_id, permission_code)
select r.id, 'branches.connect' from public.organization_roles r
where r.code in ('owner', 'admin') and r.status = 'active'
on conflict do nothing;

create or replace function public.record_native_company_branch_heartbeat(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
  p_branch_id uuid, p_client_instance_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant_id uuid;
  v_last_seen_at timestamptz;
begin
  if p_branch_id is null or p_client_instance_id is null then
    raise exception 'COMPANY_BRANCH_CONNECTIVITY_INVALID';
  end if;
  v_tenant_id := public.assert_company_administration_access(p_organization_id, p_actor_user_id, 'branches.connect');
  if not exists (
    select 1 from public.shared_companies c join public.shared_company_branches b
      on b.tenant_id=c.tenant_id and b.organization_id=c.organization_id and b.company_id=c.id
    where c.tenant_id=v_tenant_id and c.organization_id=p_organization_id and c.id=p_company_id
      and c.status='active' and b.id=p_branch_id
  ) then raise exception 'COMPANY_BRANCH_NOT_FOUND'; end if;
  perform 1 from public.organization_memberships m
    join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.status='active'
    join public.organization_role_permissions rp on rp.role_id=r.id and rp.permission_code='branches.select'
    where m.organization_id=p_organization_id and m.user_id=p_actor_user_id and m.status='active'
    for share of m,r,rp;
  if not found then raise exception 'COMPANY_BRANCH_CONNECTIVITY_ACCESS_DENIED'; end if;
  if not public.company_branch_user_can_select_any(p_actor_user_id,p_organization_id) and not exists (
    select 1 from public.shared_company_branch_memberships m where m.tenant_id=v_tenant_id
      and m.organization_id=p_organization_id and m.company_id=p_company_id and m.branch_id=p_branch_id
      and m.user_id=p_actor_user_id and m.status='active'
  ) then raise exception 'COMPANY_BRANCH_CONNECTIVITY_ACCESS_DENIED'; end if;

  insert into public.shared_company_branch_presence(tenant_id,organization_id,company_id,branch_id,user_id,client_instance_id,last_seen_at)
  values(v_tenant_id,p_organization_id,p_company_id,p_branch_id,p_actor_user_id,p_client_instance_id,clock_timestamp())
  on conflict (tenant_id,branch_id,user_id,client_instance_id) do update
    set organization_id=excluded.organization_id, company_id=excluded.company_id,
        last_seen_at=greatest(shared_company_branch_presence.last_seen_at,excluded.last_seen_at)
  returning last_seen_at into v_last_seen_at;
  return jsonb_build_object('branchId',p_branch_id,'clientInstanceId',p_client_instance_id,'lastSeenAt',v_last_seen_at);
end;
$$;

create or replace function public.get_native_company_branch_connectivity(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant_id uuid;
  v_result jsonb;
begin
  v_tenant_id := public.assert_company_administration_access(p_organization_id,p_actor_user_id,'branches.read');
  if not exists(select 1 from public.shared_companies c where c.tenant_id=v_tenant_id
    and c.organization_id=p_organization_id and c.id=p_company_id) then raise exception 'COMPANY_BRANCH_COMPANY_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'branchId',b.id,
    'online',coalesce(presence.client_count,0)>0,
    'connectedClientCount',coalesce(presence.client_count,0),
    'lastSeenAt',presence.last_seen_at
  ) order by b.code),'[]'::jsonb) into v_result
  from public.shared_company_branches b
  left join lateral (
    select count(*) filter (where p.last_seen_at >= clock_timestamp()-interval '90 seconds')::integer as client_count,
      max(p.last_seen_at) as last_seen_at
    from public.shared_company_branch_presence p
    join public.organization_memberships m on m.organization_id=p.organization_id
      and m.user_id=p.user_id and m.status='active'
    join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.status='active'
    join public.organization_role_permissions rp on rp.role_id=r.id and rp.permission_code='branches.connect'
    where p.tenant_id=b.tenant_id and p.organization_id=b.organization_id and p.company_id=b.company_id
      and p.branch_id=b.id
      and (public.company_branch_user_can_select_any(p.user_id,p.organization_id) or exists(
        select 1 from public.shared_company_branch_memberships a where a.tenant_id=p.tenant_id
          and a.organization_id=p.organization_id and a.company_id=p.company_id and a.branch_id=p.branch_id
          and a.user_id=p.user_id and a.status='active'))
  ) presence on true
  where b.tenant_id=v_tenant_id and b.organization_id=p_organization_id and b.company_id=p_company_id
    and (public.company_branch_user_can_select_any(p_actor_user_id,p_organization_id) or exists(
      select 1 from public.shared_company_branch_memberships a where a.tenant_id=b.tenant_id
        and a.organization_id=b.organization_id and a.company_id=b.company_id and a.branch_id=b.id
        and a.user_id=p_actor_user_id and a.status='active'));
  return v_result;
end;
$$;

revoke all on function public.record_native_company_branch_heartbeat(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_native_company_branch_connectivity(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_native_company_branch_heartbeat(uuid,uuid,text,uuid,uuid) to service_role;
grant execute on function public.get_native_company_branch_connectivity(uuid,uuid,text) to service_role;
