-- ADM-008: establish company-scoped branch identities without assigning
-- operational documents or moving existing company data.
create table public.shared_company_branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  code text not null check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9._-]{0,31}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (tenant_id, company_id) references public.shared_companies(tenant_id, id) on delete restrict,
  unique (tenant_id, company_id, code)
);
create index shared_company_branches_org_company_idx on public.shared_company_branches(tenant_id, organization_id, company_id, code);

create table public.shared_company_branch_creation_requests (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  idempotency_key text not null check (length(idempotency_key) between 1 and 128),
  intent jsonb not null,
  result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, company_id, idempotency_key)
);

create table public.shared_company_branch_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  branch_id uuid not null references public.shared_company_branches(id) on delete restrict,
  action text not null check (action = 'created'),
  actor_user_id uuid not null,
  occurred_at timestamptz not null default clock_timestamp()
);

alter table public.shared_company_branches enable row level security;
alter table public.shared_company_branch_creation_requests enable row level security;
alter table public.shared_company_branch_events enable row level security;
revoke all on public.shared_company_branches, public.shared_company_branch_creation_requests, public.shared_company_branch_events from public, anon, authenticated, service_role;

insert into public.access_control_permissions(code, resource, action, description) values
  ('branches.create', 'branches', 'create', 'Crear sucursales de una empresa'),
  ('branches.read', 'branches', 'read', 'Consultar sucursales de una empresa')
on conflict (code) do update set description = excluded.description;
insert into public.organization_role_permissions(role_id, permission_code)
select r.id, p.code from public.organization_roles r
cross join public.access_control_permissions p
where r.code in ('owner', 'admin') and p.code in ('branches.create', 'branches.read')
on conflict do nothing;

create or replace function public.company_branch_snapshot(p_branch public.shared_company_branches)
returns jsonb language sql immutable set search_path = public as $$
  select to_jsonb(p_branch)
$$;
revoke all on function public.company_branch_snapshot(public.shared_company_branches) from public, anon, authenticated, service_role;

create or replace function public.create_native_company_branch(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
  p_idempotency_key text, p_code text, p_name text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant_id uuid;
  v_company public.shared_companies%rowtype;
  v_request public.shared_company_branch_creation_requests%rowtype;
  v_branch public.shared_company_branches%rowtype;
  v_code text;
  v_name text;
  v_intent jsonb;
  v_result jsonb;
begin
  v_tenant_id := public.assert_company_administration_access(p_organization_id, p_actor_user_id, 'branches.create');
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 128
    or p_code is null or upper(btrim(p_code)) !~ '^[A-Z0-9][A-Z0-9._-]{0,31}$'
    or p_name is null or length(btrim(p_name)) not between 1 and 120
  then raise exception 'COMPANY_BRANCH_INVALID'; end if;
  v_code := upper(btrim(p_code));
  v_name := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
  select * into v_company from public.shared_companies
  where tenant_id = v_tenant_id and organization_id = p_organization_id and id = p_company_id for share;
  if not found or v_company.status <> 'active' then raise exception 'COMPANY_BRANCH_COMPANY_NOT_FOUND'; end if;
  v_intent := jsonb_build_object('actor', p_actor_user_id, 'code', v_code, 'name', v_name);
  insert into public.shared_company_branch_creation_requests(organization_id, company_id, idempotency_key, intent)
  values (p_organization_id, p_company_id, btrim(p_idempotency_key), v_intent)
  on conflict (organization_id, company_id, idempotency_key) do nothing;
  select * into v_request from public.shared_company_branch_creation_requests
  where organization_id = p_organization_id and company_id = p_company_id and idempotency_key = btrim(p_idempotency_key) for update;
  if v_request.intent is distinct from v_intent then raise exception 'COMPANY_BRANCH_IDEMPOTENCY_CONFLICT'; end if;
  if v_request.result is not null then return v_request.result; end if;
  begin
    insert into public.shared_company_branches(tenant_id, organization_id, company_id, code, name, created_by)
    values (v_tenant_id, p_organization_id, p_company_id, v_code, v_name, p_actor_user_id)
    returning * into v_branch;
  exception when unique_violation then raise exception 'COMPANY_BRANCH_ALREADY_EXISTS';
  end;
  v_result := public.company_branch_snapshot(v_branch);
  update public.shared_company_branch_creation_requests set result = v_result
  where organization_id = p_organization_id and company_id = p_company_id and idempotency_key = btrim(p_idempotency_key);
  insert into public.shared_company_branch_events(tenant_id, organization_id, company_id, branch_id, action, actor_user_id)
  values (v_tenant_id, p_organization_id, p_company_id, v_branch.id, 'created', p_actor_user_id);
  return v_result;
end;
$$;

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
  from public.shared_company_branches b where b.tenant_id = v_tenant_id and b.organization_id = p_organization_id and b.company_id = p_company_id;
  return v_result;
end;
$$;
revoke all on function public.create_native_company_branch(uuid,uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.list_native_company_branches(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.create_native_company_branch(uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.list_native_company_branches(uuid,uuid,text) to service_role;

create or replace function public.reject_company_branch_event_mutation()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'COMPANY_BRANCH_EVENT_IMMUTABLE'; end;
$$;
create trigger shared_company_branch_events_immutable
before update or delete or truncate on public.shared_company_branch_events
for each statement execute function public.reject_company_branch_event_mutation();
revoke all on function public.reject_company_branch_event_mutation() from public, anon, authenticated, service_role;
