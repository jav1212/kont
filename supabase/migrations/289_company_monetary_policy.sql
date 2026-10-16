-- Company monetary policy is an additive, server-composed foundation. It does
-- not alter legacy JSON settings, historical documents, or shared_companies.
-- The policy has an independent version so sales counter allocations do not
-- create unrelated monetary-policy conflicts.

create or replace function public.company_monetary_reference_currencies_valid(p_codes text[])
returns boolean language sql immutable set search_path = public as $$
    select coalesce(cardinality(p_codes) between 1 and 2
        and p_codes <@ array['USD', 'EUR']::text[]
        and cardinality(p_codes) = (select count(distinct code) from unnest(p_codes) as currency(code)), false);
$$;

create table public.shared_company_monetary_policies (
    organization_id uuid not null references public.organizations(id) on delete restrict,
    tenant_id uuid not null,
    company_id text not null,
    policy_version integer not null check (policy_version > 0),
    operating_currency_code text not null check (operating_currency_code = 'VES'),
    operating_currency_minor_unit smallint not null check (operating_currency_minor_unit = 2),
    reference_currency_codes text[] not null
        check (public.company_monetary_reference_currencies_valid(reference_currency_codes)),
    rate_source text not null check (rate_source = 'bcv'),
    rounding_profile text not null check (rounding_profile = 'commercial_v1'),
    allow_previous_available_date boolean not null default false check (allow_previous_available_date = false),
    max_previous_days smallint not null default 0 check (max_previous_days = 0),
    configured_at timestamptz not null default now(),
    configured_by uuid not null,
    primary key (organization_id, company_id),
    unique (organization_id, company_id, tenant_id),
    foreign key (tenant_id, company_id)
        references public.shared_companies(tenant_id, id) on delete restrict
);

create table public.shared_company_monetary_policy_revisions (
    organization_id uuid not null,
    tenant_id uuid not null,
    company_id text not null,
    policy_version integer not null check (policy_version > 0),
    operating_currency_code text not null check (operating_currency_code = 'VES'),
    operating_currency_minor_unit smallint not null check (operating_currency_minor_unit = 2),
    reference_currency_codes text[] not null
        check (public.company_monetary_reference_currencies_valid(reference_currency_codes)),
    rate_source text not null check (rate_source = 'bcv'),
    rounding_profile text not null check (rounding_profile = 'commercial_v1'),
    allow_previous_available_date boolean not null default false check (allow_previous_available_date = false),
    max_previous_days smallint not null default 0 check (max_previous_days = 0),
    configured_at timestamptz not null default now(),
    configured_by uuid not null,
    primary key (organization_id, company_id, policy_version),
    foreign key (organization_id, company_id, tenant_id)
        references public.shared_company_monetary_policies(organization_id, company_id, tenant_id)
        on delete cascade
);

create table public.shared_company_monetary_policy_requests (
    organization_id uuid not null references public.organizations(id) on delete restrict,
    tenant_id uuid not null,
    company_id text not null,
    idempotency_key text not null check (length(idempotency_key) between 1 and 128),
    intent jsonb not null,
    result jsonb,
    created_at timestamptz not null default now(),
    primary key (organization_id, company_id, idempotency_key),
    foreign key (tenant_id, company_id)
        references public.shared_companies(tenant_id, id) on delete restrict
);

create table public.shared_company_monetary_policy_events (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    tenant_id uuid not null,
    company_id text not null,
    actor_user_id uuid not null,
    action text not null check (action = 'configured'),
    reason text not null check (length(reason) between 1 and 500),
    previous_policy_version integer,
    policy_version integer not null check (policy_version > 0),
    previous_policy jsonb,
    policy jsonb not null,
    occurred_at timestamptz not null default now(),
    foreign key (tenant_id, company_id)
        references public.shared_companies(tenant_id, id) on delete restrict
);
create index shared_company_monetary_policy_events_scope_idx
    on public.shared_company_monetary_policy_events(organization_id, company_id, occurred_at desc);
create index shared_company_monetary_policies_company_fk_idx
    on public.shared_company_monetary_policies(tenant_id, company_id);
create index shared_company_monetary_policy_requests_company_fk_idx
    on public.shared_company_monetary_policy_requests(tenant_id, company_id);
create index shared_company_monetary_policy_events_company_fk_idx
    on public.shared_company_monetary_policy_events(tenant_id, company_id);

alter table public.shared_company_monetary_policies enable row level security;
alter table public.shared_company_monetary_policy_revisions enable row level security;
alter table public.shared_company_monetary_policy_requests enable row level security;
alter table public.shared_company_monetary_policy_events enable row level security;
revoke all on public.shared_company_monetary_policies,
    public.shared_company_monetary_policy_revisions,
    public.shared_company_monetary_policy_requests,
    public.shared_company_monetary_policy_events
from public, anon, authenticated, service_role;

-- Revisions and events are append-only evidence. UPDATE is forbidden even to
-- migration owners. Parent deletion is restricted so evidence cannot disappear
-- through a legacy company cascade.
create or replace function public.prevent_company_monetary_policy_evidence_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
    raise exception 'COMPANY_MONETARY_POLICY_EVIDENCE_IMMUTABLE';
end;
$$;
create trigger shared_company_monetary_policy_revisions_immutable
before update on public.shared_company_monetary_policy_revisions
for each row execute function public.prevent_company_monetary_policy_evidence_mutation();
create trigger shared_company_monetary_policy_events_immutable
before update on public.shared_company_monetary_policy_events
for each row execute function public.prevent_company_monetary_policy_evidence_mutation();

create or replace function public.company_monetary_policy_snapshot(
    p_policy public.shared_company_monetary_policies
) returns jsonb language sql stable set search_path = public as $$
    select jsonb_build_object(
        'organization_id', p_policy.organization_id,
        'company_id', p_policy.company_id,
        'policy_version', p_policy.policy_version,
        'operating_currency_code', p_policy.operating_currency_code,
        'operating_currency_minor_unit', p_policy.operating_currency_minor_unit,
        'reference_currency_codes', to_jsonb(p_policy.reference_currency_codes),
        'rate_source', p_policy.rate_source,
        'rounding_profile', p_policy.rounding_profile,
        'allow_previous_available_date', p_policy.allow_previous_available_date,
        'max_previous_days', p_policy.max_previous_days,
        'configured_at', p_policy.configured_at,
        'configured_by', p_policy.configured_by
    );
$$;

create or replace function public.company_monetary_policy_revision_snapshot(
    p_policy public.shared_company_monetary_policy_revisions
) returns jsonb language sql stable set search_path = public as $$
    select jsonb_build_object(
        'organization_id', p_policy.organization_id,
        'company_id', p_policy.company_id,
        'policy_version', p_policy.policy_version,
        'operating_currency_code', p_policy.operating_currency_code,
        'operating_currency_minor_unit', p_policy.operating_currency_minor_unit,
        'reference_currency_codes', to_jsonb(p_policy.reference_currency_codes),
        'rate_source', p_policy.rate_source,
        'rounding_profile', p_policy.rounding_profile,
        'allow_previous_available_date', p_policy.allow_previous_available_date,
        'max_previous_days', p_policy.max_previous_days,
        'configured_at', p_policy.configured_at,
        'configured_by', p_policy.configured_by
    );
$$;

create or replace function public.lock_active_company_for_monetary_policy(
    p_organization_id uuid, p_tenant_id uuid, p_company_id text
) returns void language plpgsql security definer set search_path = public as $$
declare
    v_company public.shared_companies%rowtype;
begin
    select * into v_company from public.shared_companies
    where tenant_id = p_tenant_id and organization_id = p_organization_id and id = p_company_id
    for update;
    if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
    if v_company.status <> 'active' then raise exception 'COMPANY_TRANSITION_INVALID'; end if;
end;
$$;

create or replace function public.assert_company_for_monetary_policy(
    p_organization_id uuid, p_tenant_id uuid, p_company_id text, p_require_active boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
    v_status text;
begin
    select c.status into v_status from public.shared_companies c
    where c.tenant_id = p_tenant_id and c.organization_id = p_organization_id and c.id = p_company_id;
    if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
    if p_require_active and v_status <> 'active' then raise exception 'COMPANY_TRANSITION_INVALID'; end if;
end;
$$;

create or replace function public.get_native_company_monetary_policy(
    p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
    p_policy_version integer default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_tenant_id uuid;
    v_policy public.shared_company_monetary_policies%rowtype;
    v_revision public.shared_company_monetary_policy_revisions%rowtype;
begin
    v_tenant_id := public.assert_company_administration_access(
        p_organization_id, p_actor_user_id, 'companies.read');
    if p_company_id is null or length(trim(p_company_id)) = 0
        or (p_policy_version is not null and p_policy_version < 1)
    then raise exception 'COMPANY_MONETARY_POLICY_INVALID'; end if;
    perform public.assert_company_for_monetary_policy(
        p_organization_id, v_tenant_id, p_company_id, false);
    if p_policy_version is null then
        select * into v_policy from public.shared_company_monetary_policies
        where organization_id = p_organization_id and company_id = p_company_id;
        if not found then return null; end if;
        return public.company_monetary_policy_snapshot(v_policy);
    end if;
    select * into v_revision from public.shared_company_monetary_policy_revisions
    where organization_id = p_organization_id and company_id = p_company_id
        and policy_version = p_policy_version;
    if not found then raise exception 'COMPANY_MONETARY_POLICY_REVISION_NOT_FOUND'; end if;
    return public.company_monetary_policy_revision_snapshot(v_revision);
end;
$$;

create or replace function public.configure_native_company_monetary_policy(
    p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
    p_expected_policy_version integer, p_idempotency_key text, p_reason text,
    p_policy jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_tenant_id uuid;
    v_current public.shared_company_monetary_policies%rowtype;
    v_request public.shared_company_monetary_policy_requests%rowtype;
    v_intent jsonb;
    v_canonical_policy jsonb;
    v_previous_policy jsonb;
    v_result jsonb;
    v_next_version integer;
    v_reference_currency_codes text[];
begin
    v_tenant_id := public.assert_company_administration_access(
        p_organization_id, p_actor_user_id, 'companies.update');
    if p_company_id is null or length(trim(p_company_id)) = 0
        or p_expected_policy_version is null or p_expected_policy_version < 0
        or p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 128
        or p_reason is null or length(trim(p_reason)) not between 1 and 500
    then raise exception 'COMPANY_MONETARY_POLICY_INVALID'; end if;
    if p_policy is null or jsonb_typeof(p_policy) <> 'object' then
        raise exception 'COMPANY_MONETARY_POLICY_INVALID';
    end if;
    if exists (select 1 from jsonb_object_keys(p_policy) k where k not in (
        'operatingCurrency', 'referenceCurrencyCodes', 'rateSource', 'roundingProfile',
        'allowPreviousAvailableDate', 'maxPreviousDays'))
        or not (p_policy ?& array['operatingCurrency', 'referenceCurrencyCodes', 'rateSource',
            'roundingProfile', 'allowPreviousAvailableDate', 'maxPreviousDays'])
        or jsonb_typeof(p_policy->'operatingCurrency') <> 'object'
        or p_policy->'operatingCurrency' is distinct from '{"code":"VES","minorUnit":2}'::jsonb
        or jsonb_typeof(p_policy->'rateSource') <> 'string'
        or p_policy->>'rateSource' is distinct from 'bcv'
        or jsonb_typeof(p_policy->'roundingProfile') <> 'string'
        or p_policy->>'roundingProfile' is distinct from 'commercial_v1'
        or p_policy->'allowPreviousAvailableDate' is distinct from 'false'::jsonb
        or p_policy->'maxPreviousDays' is distinct from '0'::jsonb
    then raise exception 'COMPANY_MONETARY_POLICY_INVALID'; end if;
    if jsonb_typeof(p_policy->'referenceCurrencyCodes') <> 'array' then
        raise exception 'COMPANY_MONETARY_POLICY_INVALID';
    end if;
    if exists (select 1 from jsonb_array_elements(p_policy->'referenceCurrencyCodes') value
        where jsonb_typeof(value) <> 'string') then
        raise exception 'COMPANY_MONETARY_POLICY_INVALID';
    end if;
    select coalesce(array_agg(code order by code), array[]::text[]) into v_reference_currency_codes
    from jsonb_array_elements_text(p_policy->'referenceCurrencyCodes') code;
    if public.company_monetary_reference_currencies_valid(v_reference_currency_codes) is distinct from true then
        raise exception 'COMPANY_MONETARY_POLICY_INVALID';
    end if;

    v_canonical_policy := jsonb_build_object(
        'operatingCurrency', jsonb_build_object('code', 'VES', 'minorUnit', 2),
        'referenceCurrencyCodes', to_jsonb(v_reference_currency_codes),
        'rateSource', 'bcv', 'roundingProfile', 'commercial_v1',
        'allowPreviousAvailableDate', false, 'maxPreviousDays', 0);
    v_intent := jsonb_build_object('actor', p_actor_user_id,
        'expectedPolicyVersion', p_expected_policy_version,
        'reason', trim(p_reason), 'policy', v_canonical_policy);

    -- This row lock also matches the allocator's lock target but does not update
    -- shared_companies, leaving Company.version independent from policy changes.
    perform public.lock_active_company_for_monetary_policy(
        p_organization_id, v_tenant_id, p_company_id);
    insert into public.shared_company_monetary_policy_requests(
        organization_id, tenant_id, company_id, idempotency_key, intent
    ) values (p_organization_id, v_tenant_id, p_company_id, trim(p_idempotency_key), v_intent)
    on conflict (organization_id, company_id, idempotency_key) do nothing;
    select * into v_request from public.shared_company_monetary_policy_requests
    where organization_id = p_organization_id and company_id = p_company_id
        and idempotency_key = trim(p_idempotency_key)
    for update;
    if v_request.intent is distinct from v_intent then
        raise exception 'COMPANY_MONETARY_POLICY_IDEMPOTENCY_CONFLICT';
    end if;
    if v_request.result is not null then return v_request.result; end if;

    select * into v_current from public.shared_company_monetary_policies
    where organization_id = p_organization_id and company_id = p_company_id
    for update;
    if not found then
        if p_expected_policy_version <> 0 then
            raise exception 'COMPANY_MONETARY_POLICY_VERSION_CONFLICT';
        end if;
        v_next_version := 1;
        insert into public.shared_company_monetary_policies(
            organization_id, tenant_id, company_id, policy_version, operating_currency_code,
            operating_currency_minor_unit, reference_currency_codes, rate_source,
            rounding_profile, allow_previous_available_date, max_previous_days, configured_by
        ) values (
            p_organization_id, v_tenant_id, p_company_id, v_next_version, 'VES', 2, v_reference_currency_codes, 'bcv',
            'commercial_v1', false, 0, p_actor_user_id
        ) returning * into v_current;
        v_previous_policy := null;
    else
        if v_current.policy_version <> p_expected_policy_version then
            raise exception 'COMPANY_MONETARY_POLICY_VERSION_CONFLICT';
        end if;
        v_previous_policy := public.company_monetary_policy_snapshot(v_current);
        v_next_version := v_current.policy_version + 1;
        update public.shared_company_monetary_policies set
            policy_version = v_next_version, reference_currency_codes = v_reference_currency_codes,
            configured_at = now(), configured_by = p_actor_user_id
        where organization_id = p_organization_id and company_id = p_company_id
            and policy_version = p_expected_policy_version
        returning * into v_current;
        if not found then raise exception 'COMPANY_MONETARY_POLICY_VERSION_CONFLICT'; end if;
    end if;

    insert into public.shared_company_monetary_policy_revisions(
        organization_id, tenant_id, company_id, policy_version, operating_currency_code,
        operating_currency_minor_unit, reference_currency_codes, rate_source,
        rounding_profile, allow_previous_available_date, max_previous_days, configured_at,
        configured_by
    ) values (
        v_current.organization_id, v_current.tenant_id, v_current.company_id, v_current.policy_version,
        v_current.operating_currency_code, v_current.operating_currency_minor_unit,
        v_current.reference_currency_codes, v_current.rate_source, v_current.rounding_profile,
        v_current.allow_previous_available_date, v_current.max_previous_days,
        v_current.configured_at, v_current.configured_by
    );
    v_result := public.company_monetary_policy_snapshot(v_current);
    update public.shared_company_monetary_policy_requests set result = v_result
    where organization_id = p_organization_id and company_id = p_company_id
        and idempotency_key = trim(p_idempotency_key);
    insert into public.shared_company_monetary_policy_events(
        organization_id, tenant_id, company_id, actor_user_id, action, reason,
        previous_policy_version, policy_version, previous_policy, policy
    ) values (
        p_organization_id, v_tenant_id, p_company_id, p_actor_user_id, 'configured', trim(p_reason),
        nullif(v_next_version - 1, 0), v_next_version, v_previous_policy, v_result
    );
    return v_result;
end;
$$;

revoke all on function public.prevent_company_monetary_policy_evidence_mutation(),
    public.company_monetary_policy_snapshot(public.shared_company_monetary_policies),
    public.company_monetary_policy_revision_snapshot(public.shared_company_monetary_policy_revisions),
    public.lock_active_company_for_monetary_policy(uuid, uuid, text),
    public.assert_company_for_monetary_policy(uuid, uuid, text, boolean),
    public.company_monetary_reference_currencies_valid(text[]),
    public.get_native_company_monetary_policy(uuid, uuid, text, integer),
    public.configure_native_company_monetary_policy(uuid, uuid, text, integer, text, text, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.get_native_company_monetary_policy(uuid, uuid, text, integer),
    public.configure_native_company_monetary_policy(uuid, uuid, text, integer, text, text, jsonb)
to service_role;
