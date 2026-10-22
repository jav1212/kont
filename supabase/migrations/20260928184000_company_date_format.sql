-- ADM-023: company-owned date display conventions. This stores presentation
-- metadata only; business dates and historical documents remain ISO dates.
-- No companies are initialized or backfilled by this migration.

create or replace function public.company_date_order_supported(p_order text)
returns boolean
language sql immutable set search_path = public
as $$
    select coalesce(p_order in ('day_first', 'year_first', 'month_first'), false);
$$;

create table public.shared_company_date_formats (
    organization_id uuid not null references public.organizations(id) on delete restrict,
    tenant_id uuid not null,
    company_id text not null,
    format_version integer not null check (format_version > 0),
    date_order text not null check (public.company_date_order_supported(date_order)),
    configured_at timestamptz not null default now(),
    configured_by uuid not null,
    primary key (organization_id, company_id),
    unique (organization_id, company_id, tenant_id),
    foreign key (tenant_id, company_id)
        references public.shared_companies(tenant_id, id) on delete restrict
);

create table public.shared_company_date_format_revisions (
    organization_id uuid not null,
    tenant_id uuid not null,
    company_id text not null,
    format_version integer not null check (format_version > 0),
    date_order text not null check (public.company_date_order_supported(date_order)),
    reason text not null check (length(reason) between 1 and 500),
    occurred_at timestamptz not null,
    actor_user_id uuid not null,
    primary key (organization_id, company_id, format_version),
    foreign key (organization_id, company_id, tenant_id)
        references public.shared_company_date_formats(organization_id, company_id, tenant_id)
        on delete cascade
);

create table public.shared_company_date_format_idempotency (
    organization_id uuid not null references public.organizations(id) on delete restrict,
    tenant_id uuid not null,
    company_id text not null,
    actor_user_id uuid not null,
    idempotency_key text not null check (length(idempotency_key) between 1 and 128),
    intent jsonb not null,
    result jsonb,
    created_at timestamptz not null default now(),
    primary key (organization_id, company_id, actor_user_id, idempotency_key),
    foreign key (tenant_id, company_id)
        references public.shared_companies(tenant_id, id) on delete restrict
);

create table public.shared_company_date_format_events (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    tenant_id uuid not null,
    company_id text not null,
    actor_user_id uuid not null,
    action text not null check (action = 'date_format_configured'),
    reason text not null check (length(reason) between 1 and 500),
    previous_version integer,
    format_version integer not null check (format_version > 0),
    previous_date_order text check (previous_date_order is null or public.company_date_order_supported(previous_date_order)),
    date_order text not null check (public.company_date_order_supported(date_order)),
    occurred_at timestamptz not null default now(),
    foreign key (tenant_id, company_id)
        references public.shared_companies(tenant_id, id) on delete restrict
);

create index shared_company_date_formats_company_fk_idx
    on public.shared_company_date_formats(tenant_id, company_id);
create index shared_company_date_format_idempotency_company_fk_idx
    on public.shared_company_date_format_idempotency(tenant_id, company_id);
create index shared_company_date_format_events_scope_idx
    on public.shared_company_date_format_events(organization_id, company_id, occurred_at desc);
create index shared_company_date_format_events_company_fk_idx
    on public.shared_company_date_format_events(tenant_id, company_id);
create index shared_company_date_format_revisions_parent_idx
    on public.shared_company_date_format_revisions(organization_id, company_id, tenant_id);

alter table public.shared_company_date_formats enable row level security;
alter table public.shared_company_date_format_revisions enable row level security;
alter table public.shared_company_date_format_idempotency enable row level security;
alter table public.shared_company_date_format_events enable row level security;
revoke all on public.shared_company_date_formats,
    public.shared_company_date_format_revisions,
    public.shared_company_date_format_idempotency,
    public.shared_company_date_format_events
from public, anon, authenticated, service_role;

-- Current policy can change only through the authorized configuration RPC.
-- Revisions and audit events cannot be edited. Parent RESTRICT constraints
-- preserve them when a legacy client tries to delete a configured company.
create or replace function public.prevent_company_date_format_evidence_update()
returns trigger language plpgsql set search_path = public as $$
begin
    raise exception 'COMPANY_DATE_FORMAT_EVIDENCE_IMMUTABLE';
end;
$$;
create trigger shared_company_date_format_revisions_immutable
before update on public.shared_company_date_format_revisions
for each row execute function public.prevent_company_date_format_evidence_update();
create trigger shared_company_date_format_events_immutable
before update on public.shared_company_date_format_events
for each row execute function public.prevent_company_date_format_evidence_update();

create or replace function public.assert_company_date_format_source(
    p_organization_id uuid, p_tenant_id uuid, p_company_id text, p_require_active boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
    v_status text;
begin
    select c.status into v_status
    from public.shared_companies c
    where c.tenant_id = p_tenant_id and c.organization_id = p_organization_id and c.id = p_company_id
    for share;
    if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
    if p_require_active and v_status <> 'active' then raise exception 'COMPANY_TRANSITION_INVALID'; end if;
end;
$$;

create or replace function public.company_date_format_snapshot(
    p_organization_id uuid, p_company_id text, p_format_version integer,
    p_date_order text, p_configured_at timestamptz, p_configured_by uuid
) returns jsonb language sql immutable set search_path = public as $$
    select jsonb_build_object(
        'organization_id', p_organization_id,
        'company_id', p_company_id,
        'format_version', p_format_version,
        'date_order', p_date_order,
        'configured_at', p_configured_at,
        'configured_by', p_configured_by
    );
$$;

create or replace function public.get_native_company_date_format(
    p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
    p_format_version integer default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_tenant_id uuid;
    v_format public.shared_company_date_formats%rowtype;
    v_revision public.shared_company_date_format_revisions%rowtype;
begin
    v_tenant_id := public.assert_company_administration_access(
        p_organization_id, p_actor_user_id, 'companies.read');
    if p_company_id is null or length(trim(p_company_id)) = 0
        or (p_format_version is not null and p_format_version < 1)
    then raise exception 'COMPANY_DATE_FORMAT_INVALID'; end if;
    perform public.assert_company_date_format_source(
        p_organization_id, v_tenant_id, p_company_id, false);
    if p_format_version is null then
        select * into v_format from public.shared_company_date_formats
        where organization_id = p_organization_id and company_id = p_company_id;
        if not found then return null; end if;
        return public.company_date_format_snapshot(
            v_format.organization_id, v_format.company_id, v_format.format_version,
            v_format.date_order, v_format.configured_at, v_format.configured_by);
    end if;
    select * into v_revision from public.shared_company_date_format_revisions
    where organization_id = p_organization_id and company_id = p_company_id
        and format_version = p_format_version;
    if not found then raise exception 'COMPANY_DATE_FORMAT_REVISION_NOT_FOUND'; end if;
    return public.company_date_format_snapshot(
        v_revision.organization_id, v_revision.company_id, v_revision.format_version,
        v_revision.date_order, v_revision.occurred_at, v_revision.actor_user_id);
end;
$$;

create or replace function public.configure_native_company_date_format(
    p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
    p_expected_format_version integer, p_idempotency_key text, p_reason text,
    p_date_order text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_tenant_id uuid;
    v_current public.shared_company_date_formats%rowtype;
    v_request public.shared_company_date_format_idempotency%rowtype;
    v_intent jsonb;
    v_previous_date_order text;
    v_next_version integer;
    v_result jsonb;
begin
    v_tenant_id := public.assert_company_administration_access(
        p_organization_id, p_actor_user_id, 'companies.update');
    if p_company_id is null or length(trim(p_company_id)) = 0
        or p_expected_format_version is null or p_expected_format_version < 0
        or p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 128
        or p_reason is null or length(trim(p_reason)) not between 1 and 500
        or public.company_date_order_supported(p_date_order) is distinct from true
    then raise exception 'COMPANY_DATE_FORMAT_INVALID'; end if;

    -- Reuse the company row lock to serialize with status changes and ensure
    -- the target is still active at commit; do not bump Company.version.
    perform 1 from public.shared_companies c
    where c.tenant_id = v_tenant_id and c.organization_id = p_organization_id
        and c.id = p_company_id and c.status = 'active'
    for update;
    if not found then
        if exists(select 1 from public.shared_companies c where c.tenant_id = v_tenant_id
            and c.organization_id = p_organization_id and c.id = p_company_id)
        then raise exception 'COMPANY_TRANSITION_INVALID'; end if;
        raise exception 'COMPANY_NOT_FOUND';
    end if;

    v_intent := jsonb_build_object(
        'actor', p_actor_user_id,
        'expectedFormatVersion', p_expected_format_version,
        'reason', trim(p_reason),
        'dateOrder', p_date_order
    );
    insert into public.shared_company_date_format_idempotency(
        organization_id, tenant_id, company_id, actor_user_id, idempotency_key, intent
    ) values (
        p_organization_id, v_tenant_id, p_company_id, p_actor_user_id,
        trim(p_idempotency_key), v_intent
    ) on conflict (organization_id, company_id, actor_user_id, idempotency_key) do nothing;
    select * into v_request from public.shared_company_date_format_idempotency
    where organization_id = p_organization_id and company_id = p_company_id
        and actor_user_id = p_actor_user_id and idempotency_key = trim(p_idempotency_key)
    for update;
    if v_request.intent is distinct from v_intent then
        raise exception 'COMPANY_DATE_FORMAT_IDEMPOTENCY_CONFLICT';
    end if;
    if v_request.result is not null then return v_request.result; end if;

    select * into v_current from public.shared_company_date_formats
    where organization_id = p_organization_id and company_id = p_company_id
    for update;
    if not found then
        if p_expected_format_version <> 0 then
            raise exception 'COMPANY_DATE_FORMAT_VERSION_CONFLICT';
        end if;
        v_next_version := 1;
        insert into public.shared_company_date_formats(
            organization_id, tenant_id, company_id, format_version, date_order, configured_by
        ) values (
            p_organization_id, v_tenant_id, p_company_id, v_next_version, p_date_order, p_actor_user_id
        ) returning * into v_current;
        v_previous_date_order := null;
    else
        if v_current.format_version <> p_expected_format_version then
            raise exception 'COMPANY_DATE_FORMAT_VERSION_CONFLICT';
        end if;
        v_next_version := v_current.format_version + 1;
        v_previous_date_order := v_current.date_order;
        update public.shared_company_date_formats set
            format_version = v_next_version, date_order = p_date_order,
            configured_at = now(), configured_by = p_actor_user_id
        where organization_id = p_organization_id and company_id = p_company_id
            and format_version = p_expected_format_version
        returning * into v_current;
        if not found then raise exception 'COMPANY_DATE_FORMAT_VERSION_CONFLICT'; end if;
    end if;

    insert into public.shared_company_date_format_revisions(
        organization_id, tenant_id, company_id, format_version, date_order,
        reason, occurred_at, actor_user_id
    ) values (
        p_organization_id, v_tenant_id, p_company_id, v_current.format_version,
        v_current.date_order, trim(p_reason), v_current.configured_at, p_actor_user_id
    );
    v_result := public.company_date_format_snapshot(
        v_current.organization_id, v_current.company_id, v_current.format_version,
        v_current.date_order, v_current.configured_at, v_current.configured_by);
    update public.shared_company_date_format_idempotency set result = v_result
    where organization_id = p_organization_id and company_id = p_company_id
        and actor_user_id = p_actor_user_id and idempotency_key = trim(p_idempotency_key);
    insert into public.shared_company_date_format_events(
        organization_id, tenant_id, company_id, actor_user_id, action, reason,
        previous_version, format_version, previous_date_order, date_order
    ) values (
        p_organization_id, v_tenant_id, p_company_id, p_actor_user_id,
        'date_format_configured', trim(p_reason), nullif(v_next_version - 1, 0),
        v_next_version, v_previous_date_order, p_date_order
    );
    return v_result;
end;
$$;

revoke all on function public.company_date_order_supported(text),
    public.prevent_company_date_format_evidence_update(),
    public.assert_company_date_format_source(uuid, uuid, text, boolean),
    public.company_date_format_snapshot(uuid, text, integer, text, timestamptz, uuid),
    public.get_native_company_date_format(uuid, uuid, text, integer),
    public.configure_native_company_date_format(uuid, uuid, text, integer, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function
    public.get_native_company_date_format(uuid, uuid, text, integer),
    public.configure_native_company_date_format(uuid, uuid, text, integer, text, text, text)
to service_role;
