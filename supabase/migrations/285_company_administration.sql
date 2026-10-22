-- Portable company administration uses the existing operational source of truth.
-- Schema/constraints/grants inspected read-only through Supabase MCP on 2026-09-28.
-- Deploy before using the new package commands; no production client is migrated here.
-- Existing direct-write policies are preserved: authorization and auditing below
-- cover these RPCs, not a cutover of legacy writers or all business operations.
alter table public.shared_companies
    add column if not exists trade_name text,
    add column if not exists country text not null default 'VE' check (country = 'VE'),
    add column if not exists status text not null default 'active'
        check (status in ('active', 'suspended', 'archived')),
    add column if not exists version integer not null default 1 check (version > 0);

-- Every writer, including the legacy Web, advances the concurrency token.
create or replace function public.advance_shared_company_version()
returns trigger language plpgsql set search_path = public as $$
begin
    new.version := old.version + 1;
    new.updated_at := now();
    return new;
end;
$$;
create trigger shared_companies_advance_version
before update on public.shared_companies
for each row execute function public.advance_shared_company_version();

create table public.shared_company_creation_requests (
    organization_id uuid not null references public.organizations(id) on delete cascade,
    idempotency_key text not null check (length(idempotency_key) between 1 and 128),
    intent jsonb not null,
    result jsonb,
    created_at timestamptz not null default now(),
    primary key (organization_id, idempotency_key)
);
create table public.shared_company_administration_events (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    company_id text not null,
    actor_user_id uuid not null,
    action text not null check (action in ('created', 'updated', 'suspended', 'activated', 'document_numbering_updated')),
    previous_version integer,
    version integer not null,
    occurred_at timestamptz not null default now()
);
alter table public.shared_company_creation_requests enable row level security;
alter table public.shared_company_administration_events enable row level security;
revoke all on public.shared_company_creation_requests, public.shared_company_administration_events
    from public, anon, authenticated;

-- Actor IDs must come from a trusted authenticated composition root. RPCs below
-- are service-role-only and independently check current grants and active state.
create or replace function public.assert_company_administration_access(
    p_organization_id uuid, p_actor_user_id uuid, p_permission text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
    v_tenant_id uuid;
begin
    select o.legacy_tenant_id into v_tenant_id
    from public.organizations o
    join public.organization_memberships m on m.organization_id = o.id
    join public.organization_roles r on r.id = m.role_id and r.organization_id = o.id
    join public.organization_role_permissions rp on rp.role_id = r.id
    where o.id = p_organization_id and o.status = 'active'
        and m.user_id = p_actor_user_id and m.status = 'active'
        and r.status = 'active' and rp.permission_code = p_permission
    for share of o, m, r, rp;
    if not found then raise exception 'COMPANY_ACCESS_DENIED'; end if;
    if v_tenant_id is null then raise exception 'COMPANY_ORGANIZATION_NOT_READY'; end if;
    return v_tenant_id;
end;
$$;

create or replace function public.company_administration_tax_id(p_value text)
returns text language plpgsql immutable set search_path = public as $$
declare
    v_parts text[];
begin
    if p_value is null then return null; end if;
    v_parts := regexp_match(regexp_replace(upper(trim(p_value)), '[.\s-]', '', 'g'),
        '^([VEJPGC])([0-9]{7,8})([0-9])$');
    if v_parts is null then raise exception 'COMPANY_INVALID'; end if;
    return v_parts[1] || '-' || lpad(v_parts[2], 8, '0') || '-' || v_parts[3];
end;
$$;

-- New administrative writes serialize within an organization when comparing a
-- mutable tax identifier. Historic IDs and malformed/duplicate RIFs are preserved.
-- Legacy writers do not yet participate in this protocol; they need a later cutover.
create or replace function public.assert_native_company_tax_id_available(
    p_organization_id uuid, p_tax_id text, p_exclude_company_id text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
    if p_tax_id is not null and exists (
        select 1 from public.shared_companies c
        where c.organization_id = p_organization_id
            and (p_exclude_company_id is null or c.id <> p_exclude_company_id)
            and case when regexp_replace(upper(trim(c.rif)), '[.\s-]', '', 'g')
                    ~ '^[VEJPGC][0-9]{8,9}$'
                then public.company_administration_tax_id(c.rif) else null end = p_tax_id
    ) then raise exception 'COMPANY_ALREADY_EXISTS'; end if;
end;
$$;

create or replace function public.company_administration_snapshot(p_company public.shared_companies)
returns jsonb language sql immutable set search_path = public as $$
    select jsonb_build_object(
        'id', p_company.id, 'organization_id', p_company.organization_id,
        'name', p_company.name, 'trade_name', p_company.trade_name,
        'rif', p_company.rif, 'country', p_company.country, 'status', p_company.status,
        'operating_profile', p_company.operating_profile, 'version', p_company.version
    );
$$;

create or replace function public.create_native_company(
    p_actor_user_id uuid, p_organization_id uuid, p_idempotency_key text,
    p_legal_name text, p_trade_name text, p_tax_id text, p_country text,
    p_operating_profile text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_tenant_id uuid;
    v_request public.shared_company_creation_requests%rowtype;
    v_company public.shared_companies%rowtype;
    v_intent jsonb;
    v_result jsonb;
    v_rif text;
begin
    v_tenant_id := public.assert_company_administration_access(
        p_organization_id, p_actor_user_id, 'companies.create');
    if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 128
        or p_legal_name is null or length(trim(p_legal_name)) not between 1 and 200
        or (p_trade_name is not null and length(trim(p_trade_name)) > 200)
        or p_country is distinct from 'VE'
        or p_operating_profile is null or p_operating_profile not in ('standard', 'kiosk')
    then raise exception 'COMPANY_INVALID'; end if;
    v_rif := public.company_administration_tax_id(p_tax_id);
    v_intent := jsonb_build_object('actor', p_actor_user_id,
        'legalName', trim(p_legal_name), 'tradeName', nullif(trim(p_trade_name), ''),
        'taxId', v_rif, 'country', p_country, 'operatingProfile', p_operating_profile);
    -- The unique key serializes concurrent retries. A failed transaction leaves
    -- neither a reserved key nor a partially created company.
    insert into public.shared_company_creation_requests(organization_id, idempotency_key, intent)
    values (p_organization_id, trim(p_idempotency_key), v_intent)
    on conflict (organization_id, idempotency_key) do nothing;
    select * into v_request from public.shared_company_creation_requests
    where organization_id = p_organization_id and idempotency_key = trim(p_idempotency_key)
    for update;
    if v_request.intent is distinct from v_intent then
        raise exception 'COMPANY_IDEMPOTENCY_CONFLICT';
    end if;
    if v_request.result is not null then return v_request.result; end if;
    perform pg_advisory_xact_lock(hashtextextended('company-administration:' || p_organization_id::text, 0));
    perform public.assert_native_company_tax_id_available(p_organization_id, v_rif);
    begin
        insert into public.shared_companies(
            tenant_id, organization_id, id, owner_id, name, trade_name, rif,
            country, status, operating_profile
        ) values (
            v_tenant_id, p_organization_id, gen_random_uuid()::text,
            v_tenant_id::text, trim(p_legal_name), nullif(trim(p_trade_name), ''), v_rif,
            p_country, 'active', p_operating_profile
        ) returning * into v_company;
    exception when unique_violation then
        raise exception 'COMPANY_ALREADY_EXISTS';
    end;
    v_result := public.company_administration_snapshot(v_company);
    update public.shared_company_creation_requests set result = v_result
    where organization_id = p_organization_id and idempotency_key = trim(p_idempotency_key);
    insert into public.shared_company_administration_events(
        organization_id, company_id, actor_user_id, action, version
    ) values (p_organization_id, v_company.id, p_actor_user_id, 'created', v_company.version);
    return v_result;
end;
$$;

create or replace function public.update_native_company(
    p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
    p_expected_version integer, p_changes jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_tenant_id uuid;
    v_company public.shared_companies%rowtype;
begin
    v_tenant_id := public.assert_company_administration_access(
        p_organization_id, p_actor_user_id, 'companies.update');
    if p_expected_version is null or p_expected_version < 1
        or p_changes is null or jsonb_typeof(p_changes) <> 'object'
    then raise exception 'COMPANY_INVALID'; end if;
    if p_changes = '{}'::jsonb or exists (
        select 1 from jsonb_object_keys(p_changes) k
        where k not in ('legalName', 'tradeName', 'taxId', 'operatingProfile')
    ) then raise exception 'COMPANY_INVALID'; end if;
    if (p_changes ? 'legalName' and (
            jsonb_typeof(p_changes->'legalName') <> 'string'
            or length(trim(p_changes->>'legalName')) not between 1 and 200))
        or (p_changes ? 'tradeName' and (
            jsonb_typeof(p_changes->'tradeName') not in ('string', 'null')
            or length(trim(p_changes->>'tradeName')) > 200))
        or (p_changes ? 'taxId' and jsonb_typeof(p_changes->'taxId') not in ('string', 'null'))
        or (p_changes ? 'operatingProfile' and (
            jsonb_typeof(p_changes->'operatingProfile') <> 'string'
            or p_changes->>'operatingProfile' not in ('standard', 'kiosk')))
    then raise exception 'COMPANY_INVALID'; end if;
    perform pg_advisory_xact_lock(hashtextextended('company-administration:' || p_organization_id::text, 0));
    select * into v_company from public.shared_companies
    where tenant_id = v_tenant_id and organization_id = p_organization_id and id = p_company_id
    for update;
    if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
    if v_company.version <> p_expected_version then raise exception 'COMPANY_VERSION_CONFLICT'; end if;
    if v_company.status = 'archived' then raise exception 'COMPANY_TRANSITION_INVALID'; end if;
    if p_changes ? 'taxId' and public.company_administration_tax_id(p_changes->>'taxId')
        is distinct from (case when regexp_replace(upper(trim(v_company.rif)), '[.\s-]', '', 'g')
            ~ '^[VEJPGC][0-9]{8,9}$'
            then public.company_administration_tax_id(v_company.rif) else null end) then
        perform public.assert_native_company_tax_id_available(p_organization_id,
            public.company_administration_tax_id(p_changes->>'taxId'), p_company_id);
    end if;
    update public.shared_companies set
        name = case when p_changes ? 'legalName' then trim(p_changes->>'legalName') else name end,
        trade_name = case when p_changes ? 'tradeName' then nullif(trim(p_changes->>'tradeName'), '') else trade_name end,
        rif = case when p_changes ? 'taxId' then public.company_administration_tax_id(p_changes->>'taxId') else rif end,
        operating_profile = case when p_changes ? 'operatingProfile' then p_changes->>'operatingProfile' else operating_profile end
    where tenant_id = v_tenant_id and organization_id = p_organization_id and id = p_company_id
        and version = p_expected_version
    returning * into v_company;
    if not found then raise exception 'COMPANY_VERSION_CONFLICT'; end if;
    insert into public.shared_company_administration_events(
        organization_id, company_id, actor_user_id, action, previous_version, version
    ) values (p_organization_id, p_company_id, p_actor_user_id, 'updated', p_expected_version, v_company.version);
    return public.company_administration_snapshot(v_company);
end;
$$;

create or replace function public.set_native_company_status(
    p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
    p_expected_version integer, p_status text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_tenant_id uuid;
    v_company public.shared_companies%rowtype;
begin
    v_tenant_id := public.assert_company_administration_access(
        p_organization_id, p_actor_user_id, 'companies.update');
    if p_expected_version is null or p_expected_version < 1
        or p_status is null or p_status not in ('active', 'suspended')
    then raise exception 'COMPANY_INVALID'; end if;
    select * into v_company from public.shared_companies
    where tenant_id = v_tenant_id and organization_id = p_organization_id and id = p_company_id
    for update;
    if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
    if v_company.version <> p_expected_version then raise exception 'COMPANY_VERSION_CONFLICT'; end if;
    if not ((v_company.status = 'active' and p_status = 'suspended')
        or (v_company.status = 'suspended' and p_status = 'active'))
    then raise exception 'COMPANY_TRANSITION_INVALID'; end if;
    update public.shared_companies set status = p_status
    where tenant_id = v_tenant_id and organization_id = p_organization_id and id = p_company_id
        and version = p_expected_version
    returning * into v_company;
    if not found then raise exception 'COMPANY_VERSION_CONFLICT'; end if;
    insert into public.shared_company_administration_events(
        organization_id, company_id, actor_user_id, action, previous_version, version
    ) values (p_organization_id, p_company_id, p_actor_user_id,
        case when p_status = 'active' then 'activated' else 'suspended' end,
        p_expected_version, v_company.version);
    return public.company_administration_snapshot(v_company);
end;
$$;

revoke all on function public.advance_shared_company_version(),
    public.assert_company_administration_access(uuid, uuid, text),
    public.company_administration_tax_id(text),
    public.assert_native_company_tax_id_available(uuid, text, text),
    public.company_administration_snapshot(public.shared_companies),
    public.create_native_company(uuid, uuid, text, text, text, text, text, text),
    public.update_native_company(uuid, uuid, text, integer, jsonb),
    public.set_native_company_status(uuid, uuid, text, integer, text)
from public, anon, authenticated;
grant execute on function
    public.create_native_company(uuid, uuid, text, text, text, text, text, text),
    public.update_native_company(uuid, uuid, text, integer, jsonb),
    public.set_native_company_status(uuid, uuid, text, integer, text)
to service_role;
