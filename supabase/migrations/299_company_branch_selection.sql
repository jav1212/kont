-- ADM-009: durable per-user selection, isolated by organization and company.
create table public.shared_user_company_branch_selections (
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  branch_id uuid references public.shared_company_branches(id) on delete restrict,
  version integer not null check (version > 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, organization_id, company_id),
  foreign key (tenant_id, company_id) references public.shared_companies(tenant_id, id) on delete restrict
);
create index shared_user_company_branch_selection_company_fk_idx on public.shared_user_company_branch_selections(tenant_id, company_id);
create index shared_user_company_branch_selection_org_fk_idx on public.shared_user_company_branch_selections(organization_id);
create index shared_user_company_branch_selection_branch_idx
  on public.shared_user_company_branch_selections(branch_id);

create table public.shared_company_branch_selection_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  previous_branch_id uuid references public.shared_company_branches(id) on delete restrict,
  branch_id uuid references public.shared_company_branches(id) on delete restrict,
  action text not null check (action in ('selected', 'cleared')),
  version integer not null check (version > 0),
  occurred_at timestamptz not null default clock_timestamp(),
  check ((action = 'selected' and branch_id is not null) or (action = 'cleared' and branch_id is null))
);
create index shared_company_branch_selection_events_scope_idx
  on public.shared_company_branch_selection_events(user_id, organization_id, company_id, occurred_at desc, id desc);
create index shared_company_branch_selection_events_tenant_fk_idx on public.shared_company_branch_selection_events(tenant_id);
create index shared_company_branch_selection_events_org_fk_idx on public.shared_company_branch_selection_events(organization_id);
create index shared_company_branch_selection_events_previous_branch_fk_idx on public.shared_company_branch_selection_events(previous_branch_id);
create index shared_company_branch_selection_events_branch_fk_idx on public.shared_company_branch_selection_events(branch_id);

alter table public.shared_user_company_branch_selections enable row level security;
alter table public.shared_company_branch_selection_events enable row level security;
revoke all on public.shared_user_company_branch_selections, public.shared_company_branch_selection_events from public, anon, authenticated, service_role;

insert into public.access_control_permissions(code, resource, action, description)
values ('branches.select', 'branches', 'select', 'Seleccionar sucursal de trabajo')
on conflict (code) do update set description = excluded.description;
insert into public.organization_role_permissions(role_id, permission_code)
select r.id, 'branches.select' from public.organization_roles r where r.code in ('owner', 'admin')
on conflict do nothing;

create or replace function public.company_branch_selection_snapshot(
  p_user_id uuid, p_organization_id uuid, p_company_id text, p_branch_id uuid, p_version integer, p_updated_at timestamptz
) returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object('user_id', p_user_id, 'organization_id', p_organization_id,
    'company_id', p_company_id, 'branch_id', p_branch_id, 'version', p_version, 'updated_at', p_updated_at)
$$;
revoke all on function public.company_branch_selection_snapshot(uuid,uuid,text,uuid,integer,timestamptz) from public, anon, authenticated, service_role;

create or replace function public.get_native_company_branch_selection(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant_id uuid;
  v_selection public.shared_user_company_branch_selections%rowtype;
begin
  v_tenant_id := public.assert_company_administration_access(p_organization_id, p_actor_user_id, 'branches.read');
  if not exists (select 1 from public.shared_companies where tenant_id = v_tenant_id and organization_id = p_organization_id and id = p_company_id) then
    raise exception 'COMPANY_BRANCH_COMPANY_NOT_FOUND';
  end if;
  select * into v_selection from public.shared_user_company_branch_selections
  where user_id = p_actor_user_id and organization_id = p_organization_id and company_id = p_company_id;
  if found then
    return public.company_branch_selection_snapshot(v_selection.user_id, v_selection.organization_id, v_selection.company_id, v_selection.branch_id, v_selection.version, v_selection.updated_at);
  end if;
  return public.company_branch_selection_snapshot(p_actor_user_id, p_organization_id, p_company_id, null, 0, null);
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
  select * into v_selection from public.shared_user_company_branch_selections
  where user_id = p_actor_user_id and organization_id = p_organization_id and company_id = p_company_id for update;
  if found then
    v_current_branch_id := v_selection.branch_id;
    v_current_version := v_selection.version;
    v_updated_at := v_selection.updated_at;
  else
    v_current_branch_id := null;
    v_current_version := 0;
    v_updated_at := null;
  end if;
  if v_current_version <> p_expected_version then raise exception 'COMPANY_BRANCH_SELECTION_VERSION_CONFLICT'; end if;
  if v_current_branch_id is not distinct from p_branch_id then
    return public.company_branch_selection_snapshot(p_actor_user_id, p_organization_id, p_company_id, v_current_branch_id, v_current_version, v_updated_at);
  end if;

  if v_current_version = 0 then
    insert into public.shared_user_company_branch_selections(user_id, tenant_id, organization_id, company_id, branch_id, version)
    values (p_actor_user_id, v_tenant_id, p_organization_id, p_company_id, p_branch_id, 1)
    returning * into v_selection;
  else
    update public.shared_user_company_branch_selections set branch_id = p_branch_id, version = version + 1, updated_at = clock_timestamp()
    where user_id = p_actor_user_id and organization_id = p_organization_id and company_id = p_company_id
    returning * into v_selection;
  end if;
  insert into public.shared_company_branch_selection_events(tenant_id, organization_id, company_id, user_id,
    previous_branch_id, branch_id, action, version)
  values (v_tenant_id, p_organization_id, p_company_id, p_actor_user_id, v_current_branch_id, p_branch_id,
    case when p_branch_id is null then 'cleared' else 'selected' end, v_selection.version);
  return public.company_branch_selection_snapshot(v_selection.user_id, v_selection.organization_id, v_selection.company_id,
    v_selection.branch_id, v_selection.version, v_selection.updated_at);
end;
$$;

create or replace function public.reject_company_branch_selection_event_mutation()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'COMPANY_BRANCH_SELECTION_EVENT_IMMUTABLE'; end;
$$;
create trigger shared_company_branch_selection_events_immutable
before update or delete or truncate on public.shared_company_branch_selection_events
for each statement execute function public.reject_company_branch_selection_event_mutation();
revoke all on function public.reject_company_branch_selection_event_mutation() from public, anon, authenticated, service_role;
revoke all on function public.get_native_company_branch_selection(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.select_native_company_branch(uuid,uuid,text,uuid,integer) from public, anon, authenticated;
grant execute on function public.get_native_company_branch_selection(uuid,uuid,text) to service_role;
grant execute on function public.select_native_company_branch(uuid,uuid,text,uuid,integer) to service_role;
