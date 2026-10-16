-- ADM-011: assign active organization members to branches and enforce those
-- assignments when branch-scoped users browse or change operational context.
create table public.shared_company_branch_memberships (
  tenant_id uuid not null,
  organization_id uuid not null,
  company_id text not null,
  branch_id uuid not null references public.shared_company_branches(id) on delete restrict,
  user_id uuid not null,
  status text not null check (status in ('active', 'revoked')),
  version integer not null check (version > 0),
  changed_by uuid not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, organization_id, company_id, branch_id, user_id),
  foreign key (tenant_id, company_id) references public.shared_companies(tenant_id, id) on delete restrict,
  foreign key (organization_id, user_id) references public.organization_memberships(organization_id, user_id) on delete cascade
);
create index shared_company_branch_memberships_org_user_idx
  on public.shared_company_branch_memberships(organization_id, user_id);
create index shared_company_branch_memberships_tenant_company_idx
  on public.shared_company_branch_memberships(tenant_id, company_id);
create index shared_company_branch_memberships_branch_idx
  on public.shared_company_branch_memberships(branch_id);

create table public.shared_company_branch_membership_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  branch_id uuid not null references public.shared_company_branches(id) on delete restrict,
  user_id uuid not null,
  actor_user_id uuid not null,
  action text not null check (action in ('assigned', 'revoked')),
  version integer not null check (version > 0),
  occurred_at timestamptz not null default clock_timestamp()
);
create index shared_company_branch_membership_events_tenant_idx
  on public.shared_company_branch_membership_events(tenant_id);
create index shared_company_branch_membership_events_org_idx
  on public.shared_company_branch_membership_events(organization_id);
create index shared_company_branch_membership_events_company_idx
  on public.shared_company_branch_membership_events(tenant_id, company_id);
create index shared_company_branch_membership_events_branch_idx
  on public.shared_company_branch_membership_events(branch_id);

alter table public.shared_company_branch_memberships enable row level security;
alter table public.shared_company_branch_membership_events enable row level security;
revoke all on public.shared_company_branch_memberships, public.shared_company_branch_membership_events from public, anon, authenticated, service_role;

insert into public.access_control_permissions(code, resource, action, description) values
  ('branches.assign_users', 'branches', 'assign_users', 'Asociar usuarios a sucursales'),
  ('branches.select_any', 'branches', 'select_any', 'Seleccionar cualquier sucursal de la empresa')
on conflict (code) do update set description = excluded.description;
insert into public.organization_role_permissions(role_id, permission_code)
select r.id, p.code from public.organization_roles r
cross join public.access_control_permissions p
where r.code in ('owner', 'admin') and p.code in ('branches.assign_users', 'branches.select_any')
on conflict do nothing;

create or replace function public.company_branch_user_can_select_any(p_actor_user_id uuid, p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_memberships m
    join public.organization_roles r on r.id = m.role_id and r.organization_id = m.organization_id and r.status = 'active'
    join public.organization_role_permissions rp on rp.role_id = r.id and rp.permission_code = 'branches.select_any'
    where m.organization_id = p_organization_id and m.user_id = p_actor_user_id and m.status = 'active'
  )
$$;
revoke all on function public.company_branch_user_can_select_any(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function public.company_branch_membership_snapshot(
  p_organization_id uuid, p_company_id text, p_branch_id uuid, p_user_id uuid,
  p_status text, p_version integer, p_changed_by uuid, p_updated_at timestamptz
) returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object('organization_id', p_organization_id, 'company_id', p_company_id,
    'branch_id', p_branch_id, 'user_id', p_user_id, 'status', p_status,
    'version', p_version, 'changed_by', p_changed_by, 'updated_at', p_updated_at)
$$;
revoke all on function public.company_branch_membership_snapshot(uuid,text,uuid,uuid,text,integer,uuid,timestamptz) from public, anon, authenticated, service_role;

create or replace function public.reconcile_company_branch_selection_scope(
  p_tenant_id uuid, p_organization_id uuid, p_company_id text, p_user_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare v_selection public.shared_user_company_branch_selections%rowtype; declare v_previous_branch_id uuid;
begin
  if public.company_branch_user_can_select_any(p_user_id, p_organization_id) then return; end if;
  select * into v_selection from public.shared_user_company_branch_selections s
  where s.user_id = p_user_id and s.organization_id = p_organization_id and s.company_id = p_company_id for update;
  if not found or v_selection.branch_id is null then return; end if;
  if exists(select 1 from public.shared_company_branch_memberships m
    where m.tenant_id = p_tenant_id and m.organization_id = p_organization_id and m.company_id = p_company_id
      and m.branch_id = v_selection.branch_id and m.user_id = p_user_id and m.status = 'active') then return; end if;
  v_previous_branch_id := v_selection.branch_id;
  update public.shared_user_company_branch_selections set branch_id = null, version = version + 1, updated_at = clock_timestamp()
  where user_id = p_user_id and organization_id = p_organization_id and company_id = p_company_id
  returning * into v_selection;
  insert into public.shared_company_branch_selection_events(tenant_id, organization_id, company_id, user_id,
    previous_branch_id, branch_id, action, version)
  values (p_tenant_id, p_organization_id, p_company_id, p_user_id, v_previous_branch_id, null, 'cleared', v_selection.version);
end;
$$;
revoke all on function public.reconcile_company_branch_selection_scope(uuid,uuid,text,uuid) from public, anon, authenticated, service_role;

create or replace function public.list_native_company_branch_memberships(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant_id uuid; v_result jsonb;
begin
  v_tenant_id := public.assert_company_administration_access(p_organization_id, p_actor_user_id, 'branches.assign_users');
  if not exists(select 1 from public.shared_companies where tenant_id = v_tenant_id and organization_id = p_organization_id and id = p_company_id) then
    raise exception 'COMPANY_BRANCH_COMPANY_NOT_FOUND';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('organization_id',m.organization_id,'company_id',m.company_id,
    'branch_id',m.branch_id,'user_id',m.user_id,'status',m.status,'version',m.version,'changed_by',m.changed_by,'updated_at',m.updated_at)
    order by m.branch_id,m.user_id),'[]'::jsonb) into v_result
  from public.shared_company_branch_memberships m
  where m.tenant_id = v_tenant_id and m.organization_id = p_organization_id and m.company_id = p_company_id;
  return v_result;
end;
$$;

create or replace function public.set_native_company_branch_membership(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text, p_branch_id uuid,
  p_user_id uuid, p_status text, p_expected_version integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant_id uuid;
  v_company public.shared_companies%rowtype;
  v_membership public.shared_company_branch_memberships%rowtype;
  v_current_version integer;
  v_current_status text;
begin
  v_tenant_id := public.assert_company_administration_access(p_organization_id, p_actor_user_id, 'branches.assign_users');
  if p_expected_version is null or p_expected_version < 0 or p_branch_id is null or p_user_id is null
    or p_status is null or p_status not in ('active','revoked') then raise exception 'COMPANY_BRANCH_MEMBERSHIP_INVALID'; end if;
  select * into v_company from public.shared_companies where tenant_id = v_tenant_id
    and organization_id = p_organization_id and id = p_company_id for share;
  if not found or v_company.status <> 'active' then raise exception 'COMPANY_BRANCH_COMPANY_NOT_FOUND'; end if;
  if not exists(select 1 from public.shared_company_branches b where b.tenant_id = v_tenant_id
      and b.organization_id = p_organization_id and b.company_id = p_company_id and b.id = p_branch_id) then
    raise exception 'COMPANY_BRANCH_NOT_FOUND';
  end if;
  -- Lock the membership while its status is checked so suspension cannot race an assignment.
  perform 1 from public.organization_memberships m where m.organization_id = p_organization_id
      and m.user_id = p_user_id and (p_status = 'revoked' or m.status = 'active') for share;
  if not found then raise exception 'COMPANY_BRANCH_MEMBER_NOT_FOUND'; end if;

  -- Share the selection lock so revocation cannot race a new branch choice.
  perform pg_advisory_xact_lock(hashtextextended('company-branch-selection:' || p_user_id::text || ':' || p_organization_id::text || ':' || p_company_id, 0));
  select * into v_membership from public.shared_company_branch_memberships m
  where m.tenant_id = v_tenant_id and m.organization_id = p_organization_id and m.company_id = p_company_id
    and m.branch_id = p_branch_id and m.user_id = p_user_id for update;
  if found then
    v_current_version := v_membership.version;
    v_current_status := v_membership.status;
  else
    v_current_version := 0;
    v_current_status := null;
  end if;
  if v_current_version <> p_expected_version then raise exception 'COMPANY_BRANCH_MEMBERSHIP_VERSION_CONFLICT'; end if;
  if v_current_status is not distinct from p_status then
    return public.company_branch_membership_snapshot(p_organization_id,p_company_id,p_branch_id,p_user_id,
      v_membership.status,v_membership.version,v_membership.changed_by,v_membership.updated_at);
  end if;
  if v_current_version = 0 then
    if p_status = 'revoked' then raise exception 'COMPANY_BRANCH_MEMBERSHIP_NOT_FOUND'; end if;
    insert into public.shared_company_branch_memberships(tenant_id,organization_id,company_id,branch_id,user_id,status,version,changed_by)
    values(v_tenant_id,p_organization_id,p_company_id,p_branch_id,p_user_id,p_status,1,p_actor_user_id)
    returning * into v_membership;
  else
    update public.shared_company_branch_memberships set status = p_status, version = version + 1,
      changed_by = p_actor_user_id, updated_at = clock_timestamp()
    where tenant_id = v_tenant_id and organization_id = p_organization_id and company_id = p_company_id
      and branch_id = p_branch_id and user_id = p_user_id returning * into v_membership;
  end if;
  insert into public.shared_company_branch_membership_events(tenant_id,organization_id,company_id,branch_id,user_id,actor_user_id,action,version)
  values(v_tenant_id,p_organization_id,p_company_id,p_branch_id,p_user_id,p_actor_user_id,
    case when p_status='active' then 'assigned' else 'revoked' end,v_membership.version);
  perform public.reconcile_company_branch_selection_scope(v_tenant_id,p_organization_id,p_company_id,p_user_id);
  return public.company_branch_membership_snapshot(v_membership.organization_id,v_membership.company_id,
    v_membership.branch_id,v_membership.user_id,v_membership.status,v_membership.version,v_membership.changed_by,v_membership.updated_at);
end;
$$;

-- Branch-specific roles cannot browse or select outside active assignments.
create or replace function public.list_native_company_branches(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant_id uuid; v_result jsonb;
begin
  v_tenant_id := public.assert_company_administration_access(p_organization_id, p_actor_user_id, 'branches.read');
  if not exists (select 1 from public.shared_companies where tenant_id = v_tenant_id and organization_id = p_organization_id and id = p_company_id) then
    raise exception 'COMPANY_BRANCH_COMPANY_NOT_FOUND';
  end if;
  select coalesce(jsonb_agg(public.company_branch_snapshot(b) order by b.code), '[]'::jsonb) into v_result
  from public.shared_company_branches b where b.tenant_id = v_tenant_id and b.organization_id = p_organization_id and b.company_id = p_company_id
    and (public.company_branch_user_can_select_any(p_actor_user_id,p_organization_id) or exists(
      select 1 from public.shared_company_branch_memberships m where m.tenant_id = b.tenant_id and m.organization_id = b.organization_id
        and m.company_id = b.company_id and m.branch_id = b.id and m.user_id = p_actor_user_id and m.status='active'));
  return v_result;
end;
$$;

create or replace function public.select_native_company_branch(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text, p_branch_id uuid, p_expected_version integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant_id uuid;
  v_company public.shared_companies%rowtype;
  v_selection public.shared_user_company_branch_selections%rowtype;
  v_current_branch_id uuid;
  v_current_version integer;
  v_updated_at timestamptz;
begin
  v_tenant_id := public.assert_company_administration_access(p_organization_id, p_actor_user_id, 'branches.select');
  if p_expected_version is null or p_expected_version < 0 then raise exception 'COMPANY_BRANCH_SELECTION_INVALID'; end if;
  select * into v_company from public.shared_companies
  where tenant_id = v_tenant_id and organization_id = p_organization_id and id = p_company_id for share;
  if not found then raise exception 'COMPANY_BRANCH_COMPANY_NOT_FOUND'; end if;
  if p_branch_id is not null then
    if v_company.status <> 'active' then raise exception 'COMPANY_BRANCH_COMPANY_NOT_OPERATIONAL'; end if;
    if not exists (select 1 from public.shared_company_branches b where b.tenant_id = v_tenant_id
      and b.organization_id = p_organization_id and b.company_id = p_company_id and b.id = p_branch_id) then
      raise exception 'COMPANY_BRANCH_NOT_FOUND';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('company-branch-selection:' || p_actor_user_id::text || ':' || p_organization_id::text || ':' || p_company_id, 0));
  if p_branch_id is not null and not public.company_branch_user_can_select_any(p_actor_user_id,p_organization_id)
    and not exists(select 1 from public.shared_company_branch_memberships m where m.tenant_id = v_tenant_id
      and m.organization_id = p_organization_id and m.company_id = p_company_id and m.branch_id = p_branch_id
      and m.user_id = p_actor_user_id and m.status='active') then
    raise exception 'COMPANY_BRANCH_ASSIGNMENT_REQUIRED';
  end if;
  select * into v_selection from public.shared_user_company_branch_selections
  where user_id = p_actor_user_id and organization_id = p_organization_id and company_id = p_company_id for update;
  if found then
    v_current_branch_id := v_selection.branch_id; v_current_version := v_selection.version; v_updated_at := v_selection.updated_at;
  else
    v_current_branch_id := null; v_current_version := 0; v_updated_at := null;
  end if;
  if v_current_version <> p_expected_version then raise exception 'COMPANY_BRANCH_SELECTION_VERSION_CONFLICT'; end if;
  if v_current_branch_id is not distinct from p_branch_id then
    return public.company_branch_selection_snapshot(p_actor_user_id,p_organization_id,p_company_id,v_current_branch_id,v_current_version,v_updated_at);
  end if;
  if v_current_version = 0 then
    insert into public.shared_user_company_branch_selections(user_id,tenant_id,organization_id,company_id,branch_id,version)
    values(p_actor_user_id,v_tenant_id,p_organization_id,p_company_id,p_branch_id,1) returning * into v_selection;
  else
    update public.shared_user_company_branch_selections set branch_id=p_branch_id,version=version+1,updated_at=clock_timestamp()
    where user_id=p_actor_user_id and organization_id=p_organization_id and company_id=p_company_id returning * into v_selection;
  end if;
  insert into public.shared_company_branch_selection_events(tenant_id,organization_id,company_id,user_id,previous_branch_id,branch_id,action,version)
  values(v_tenant_id,p_organization_id,p_company_id,p_actor_user_id,v_current_branch_id,p_branch_id,
    case when p_branch_id is null then 'cleared' else 'selected' end,v_selection.version);
  return public.company_branch_selection_snapshot(v_selection.user_id,v_selection.organization_id,v_selection.company_id,
    v_selection.branch_id,v_selection.version,v_selection.updated_at);
end;
$$;

create or replace function public.reject_company_branch_membership_event_mutation()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'COMPANY_BRANCH_MEMBERSHIP_EVENT_IMMUTABLE'; end;
$$;
create trigger shared_company_branch_membership_events_immutable
before update or delete or truncate on public.shared_company_branch_membership_events
for each statement execute function public.reject_company_branch_membership_event_mutation();
revoke all on function public.reject_company_branch_membership_event_mutation() from public, anon, authenticated, service_role;
revoke all on function public.list_native_company_branch_memberships(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.set_native_company_branch_membership(uuid,uuid,text,uuid,uuid,text,integer) from public, anon, authenticated;
revoke all on function public.list_native_company_branches(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.select_native_company_branch(uuid,uuid,text,uuid,integer) from public, anon, authenticated;
grant execute on function public.list_native_company_branch_memberships(uuid,uuid,text) to service_role;
grant execute on function public.set_native_company_branch_membership(uuid,uuid,text,uuid,uuid,text,integer) to service_role;
grant execute on function public.list_native_company_branches(uuid,uuid,text) to service_role;
grant execute on function public.select_native_company_branch(uuid,uuid,text,uuid,integer) to service_role;
