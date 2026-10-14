-- ADM-025: typed fiscal contact data over the existing company source of truth.
-- Legal name, RIF and person nature keep their existing administration commands.
-- No historical fiscal classification or RIF value is inferred or rewritten.

create table public.shared_company_fiscal_profile_requests (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 1 and 128),
  tenant_id uuid not null,
  company_id text not null,
  actor_user_id uuid not null,
  intent jsonb not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (organization_id, idempotency_key)
);

create table public.shared_company_fiscal_profile_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_id uuid not null,
  company_id text not null,
  actor_user_id uuid not null,
  idempotency_key text not null,
  previous_version integer not null check (previous_version > 0),
  version integer not null check (version = previous_version + 1),
  previous_fiscal_address text,
  fiscal_address text,
  previous_taxpayer_type text not null,
  taxpayer_type text not null,
  reason text not null,
  occurred_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);
create index shared_company_fiscal_profile_events_scope_idx
  on public.shared_company_fiscal_profile_events(organization_id, company_id, occurred_at desc);

create function public.reject_company_fiscal_profile_event_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'COMPANY_FISCAL_PROFILE_IMMUTABLE';
end;
$$;
create trigger shared_company_fiscal_profile_events_immutable
before update or delete on public.shared_company_fiscal_profile_events
for each row execute function public.reject_company_fiscal_profile_event_mutation();

alter table public.shared_company_fiscal_profile_requests enable row level security;
alter table public.shared_company_fiscal_profile_events enable row level security;
revoke all on public.shared_company_fiscal_profile_requests,
  public.shared_company_fiscal_profile_events from public,anon,authenticated,service_role;

create function public.company_fiscal_profile_snapshot(p_company public.shared_companies)
returns jsonb language sql immutable set search_path=public as $$
  select jsonb_build_object(
    'companyId',p_company.id,
    'legalName',p_company.name,
    'taxId',p_company.rif,
    'personNature',p_company.person_nature,
    'fiscalAddress',p_company.address,
    'taxpayerType',p_company.taxpayer_type,
    'companyVersion',p_company.version
  );
$$;
revoke all on function public.company_fiscal_profile_snapshot(public.shared_companies)
  from public,anon,authenticated,service_role;

create function public.get_native_company_fiscal_profile(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_company public.shared_companies%rowtype;
begin
  v_tenant := public.assert_company_administration_access(
    p_organization_id,p_actor_user_id,'companies.read');
  select * into v_company from public.shared_companies
   where tenant_id=v_tenant and organization_id=p_organization_id and id=p_company_id;
  if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
  return public.company_fiscal_profile_snapshot(v_company);
end;
$$;

create function public.configure_native_company_fiscal_profile(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,
  p_expected_version integer,p_idempotency_key text,p_reason text,
  p_fiscal_address text,p_taxpayer_type text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid;
  v_company public.shared_companies%rowtype;
  v_saved public.shared_companies%rowtype;
  v_request public.shared_company_fiscal_profile_requests%rowtype;
  v_intent jsonb;
  v_result jsonb;
  v_address text;
begin
  v_tenant := public.assert_company_administration_access(
    p_organization_id,p_actor_user_id,'companies.update');
  v_address := case when p_fiscal_address is null then null else btrim(p_fiscal_address) end;
  if p_expected_version is null or p_expected_version < 1
    or p_company_id is null or length(btrim(p_company_id)) < 1
    or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 128
    or p_reason is null or length(btrim(p_reason)) not between 1 and 500
    or btrim(p_reason) ~ '[[:cntrl:]]'
    or (p_fiscal_address is not null and
      (length(v_address) not between 1 and 500 or v_address ~ '[[:cntrl:]]'))
    or p_taxpayer_type is null or p_taxpayer_type not in ('ordinario','especial')
  then raise exception 'COMPANY_FISCAL_PROFILE_INVALID'; end if;

  v_intent := jsonb_build_object(
    'actorUserId',p_actor_user_id,'companyId',p_company_id,
    'expectedVersion',p_expected_version,'reason',btrim(p_reason),
    'fiscalAddress',v_address,'taxpayerType',p_taxpayer_type);
  insert into public.shared_company_fiscal_profile_requests(
    organization_id,idempotency_key,tenant_id,company_id,actor_user_id,intent)
  values(p_organization_id,btrim(p_idempotency_key),v_tenant,p_company_id,p_actor_user_id,v_intent)
  on conflict (organization_id,idempotency_key) do nothing;
  select * into v_request from public.shared_company_fiscal_profile_requests
   where organization_id=p_organization_id and idempotency_key=btrim(p_idempotency_key)
   for update;
  if v_request.tenant_id is distinct from v_tenant
    or v_request.company_id is distinct from p_company_id
    or v_request.actor_user_id is distinct from p_actor_user_id
    or v_request.intent is distinct from v_intent
  then raise exception 'COMPANY_FISCAL_PROFILE_IDEMPOTENCY_CONFLICT'; end if;
  if v_request.result is not null then return v_request.result; end if;

  select * into v_company from public.shared_companies
   where tenant_id=v_tenant and organization_id=p_organization_id and id=p_company_id
   for update;
  if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
  if v_company.status <> 'active' then raise exception 'COMPANY_TRANSITION_INVALID'; end if;
  if v_company.version <> p_expected_version then raise exception 'COMPANY_VERSION_CONFLICT'; end if;
  if v_company.address is not distinct from v_address
    and v_company.taxpayer_type = p_taxpayer_type
  then raise exception 'COMPANY_FISCAL_PROFILE_UNCHANGED'; end if;

  update public.shared_companies
     set address=v_address,taxpayer_type=p_taxpayer_type
   where tenant_id=v_tenant and organization_id=p_organization_id
     and id=p_company_id and version=p_expected_version
   returning * into v_saved;
  if not found then raise exception 'COMPANY_VERSION_CONFLICT'; end if;
  v_result := public.company_fiscal_profile_snapshot(v_saved);
  update public.shared_company_fiscal_profile_requests set result=v_result
   where organization_id=p_organization_id and idempotency_key=btrim(p_idempotency_key);
  insert into public.shared_company_fiscal_profile_events(
    organization_id,tenant_id,company_id,actor_user_id,idempotency_key,
    previous_version,version,previous_fiscal_address,fiscal_address,
    previous_taxpayer_type,taxpayer_type,reason)
  values(p_organization_id,v_tenant,p_company_id,p_actor_user_id,btrim(p_idempotency_key),
    v_company.version,v_saved.version,v_company.address,v_saved.address,
    v_company.taxpayer_type,v_saved.taxpayer_type,btrim(p_reason));
  return v_result;
end;
$$;

revoke all on function public.get_native_company_fiscal_profile(uuid,uuid,text),
  public.configure_native_company_fiscal_profile(uuid,uuid,text,integer,text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.get_native_company_fiscal_profile(uuid,uuid,text),
  public.configure_native_company_fiscal_profile(uuid,uuid,text,integer,text,text,text,text)
  to service_role;
