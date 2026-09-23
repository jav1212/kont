-- Fiscal documents are authoritative snapshots, separate from sales, purchasing,
-- rendering, and fiscal-device protocols (ADR 0021 and ADR 0024).  No legacy
-- document is converted here; this only establishes additive durable storage.

create table if not exists public.shared_fiscal_documents (
    -- Fiscal retention outlives operational tenant lifecycle actions.  A tenant
    -- cannot be deleted while it owns fiscal evidence; an archival policy must
    -- make that decision explicitly.
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    id text not null,
    organization_id uuid not null references public.organizations(id) on delete restrict,
    company_id text not null,
    source_kind text not null,
    source_id text not null,
    idempotency_key text not null,
    document_status text not null,
    document_snapshot jsonb not null,
    created_by uuid references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (tenant_id, id),
    foreign key (tenant_id, company_id) references public.shared_companies(tenant_id, id) on delete restrict,
    unique (tenant_id, company_id, source_kind, source_id),
    unique (tenant_id, company_id, idempotency_key),
    check (length(btrim(id)) > 0),
    check (length(btrim(source_kind)) > 0),
    check (length(btrim(source_id)) > 0),
    check (length(btrim(idempotency_key)) > 0),
    check (document_status in ('draft', 'issued', 'received')),
    check (jsonb_typeof(document_snapshot) = 'object')
);

create index if not exists shared_fiscal_documents_scope_created_idx
    on public.shared_fiscal_documents (tenant_id, organization_id, company_id, created_at desc, id desc);

create table if not exists public.shared_fiscal_issuance_commands (
    tenant_id uuid not null,
    id text not null,
    document_id text not null,
    provider text not null,
    idempotency_key text not null,
    command_state text not null,
    request_fingerprint text not null,
    provider_reference text,
    failure_code text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (tenant_id, id),
    foreign key (tenant_id, document_id) references public.shared_fiscal_documents(tenant_id, id) on delete restrict,
    unique (tenant_id, document_id, provider, idempotency_key),
    check (length(btrim(provider)) > 0),
    check (length(btrim(idempotency_key)) > 0),
    check (length(btrim(request_fingerprint)) > 0),
    check (command_state in ('pending', 'accepted', 'rejected', 'unknown'))
);

create index if not exists shared_fiscal_issuance_commands_document_idx
    on public.shared_fiscal_issuance_commands (tenant_id, document_id, created_at desc, id desc);

create table if not exists public.shared_fiscal_issuance_attempts (
    tenant_id uuid not null,
    id text not null,
    document_id text not null,
    command_id text not null,
    provider text not null,
    idempotency_key text not null,
    attempt_state text not null,
    request_fingerprint text not null,
    provider_reference text,
    failure_code text,
    occurred_at timestamptz not null,
    recorded_at timestamptz not null default now(),
    primary key (tenant_id, id),
    foreign key (tenant_id, document_id) references public.shared_fiscal_documents(tenant_id, id) on delete restrict,
    foreign key (tenant_id, command_id) references public.shared_fiscal_issuance_commands(tenant_id, id) on delete restrict,
    check (length(btrim(provider)) > 0),
    check (length(btrim(idempotency_key)) > 0),
    check (length(btrim(request_fingerprint)) > 0),
    check (attempt_state in ('pending', 'accepted', 'rejected', 'unknown'))
);

create index if not exists shared_fiscal_issuance_attempts_document_recorded_idx
    on public.shared_fiscal_issuance_attempts (tenant_id, document_id, recorded_at desc, id desc);

create table if not exists public.shared_fiscal_document_events (
    tenant_id uuid not null,
    id uuid not null default gen_random_uuid(),
    document_id text not null,
    event_type text not null,
    idempotency_key text not null,
    payload jsonb not null,
    occurred_at timestamptz not null,
    recorded_at timestamptz not null default now(),
    primary key (tenant_id, id),
    foreign key (tenant_id, document_id) references public.shared_fiscal_documents(tenant_id, id) on delete restrict,
    unique (tenant_id, document_id, event_type, idempotency_key),
    check (length(btrim(event_type)) > 0),
    check (length(btrim(idempotency_key)) > 0),
    check (jsonb_typeof(payload) = 'object')
);

create index if not exists shared_fiscal_document_events_document_recorded_idx
    on public.shared_fiscal_document_events (tenant_id, document_id, recorded_at desc, id desc);

-- Cross-table scope cannot be expressed by the document references alone.  The
-- trigger rejects a company that belongs to another tenant or organization.
create or replace function public.shared_fiscal_document_assert_company_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (
        select 1
        from public.shared_companies company
        where company.tenant_id = new.tenant_id
          and company.organization_id = new.organization_id
          and company.id = new.company_id
    ) then
        raise exception 'FISCAL_DOCUMENT_OUTSIDE_COMPANY';
    end if;
    return new;
end;
$$;

create or replace function public.shared_fiscal_document_enforce_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if old.document_status in ('issued', 'received') then
        raise exception 'FISCAL_DOCUMENT_IMMUTABLE';
    end if;
    if new.tenant_id is distinct from old.tenant_id
       or new.organization_id is distinct from old.organization_id
       or new.company_id is distinct from old.company_id
       or new.id is distinct from old.id
       or new.source_kind is distinct from old.source_kind
       or new.source_id is distinct from old.source_id
       or new.idempotency_key is distinct from old.idempotency_key then
        raise exception 'FISCAL_DOCUMENT_IDENTITY_IMMUTABLE';
    end if;
    if old.document_status = 'draft' and new.document_status not in ('draft', 'issued', 'received') then
        raise exception 'FISCAL_DOCUMENT_TRANSITION_INVALID';
    end if;
    return new;
end;
$$;

create or replace function public.shared_fiscal_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    raise exception 'FISCAL_AUDIT_APPEND_ONLY';
end;
$$;

create or replace function public.shared_fiscal_issuance_command_enforce_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.tenant_id is distinct from old.tenant_id
       or new.id is distinct from old.id
       or new.document_id is distinct from old.document_id
       or new.provider is distinct from old.provider
       or new.idempotency_key is distinct from old.idempotency_key
       or new.request_fingerprint is distinct from old.request_fingerprint then
        raise exception 'FISCAL_ISSUANCE_COMMAND_IDENTITY_IMMUTABLE';
    end if;
    if old.command_state = 'accepted' and new.command_state <> 'accepted'
       or old.command_state = 'rejected' and new.command_state <> 'rejected'
       or old.command_state = 'unknown' and new.command_state not in ('unknown', 'accepted', 'rejected')
       or old.command_state = 'pending' and new.command_state not in ('pending', 'unknown', 'accepted', 'rejected') then
        raise exception 'FISCAL_ISSUANCE_COMMAND_TRANSITION_INVALID';
    end if;
    return new;
end;
$$;

-- These RPCs are the only persistence boundary for the initial service-role
-- adapter.  Writes own a transaction and atomically store facts plus audit;
-- reads validate the complete operational scope before returning snapshots.
create or replace function public.shared_fiscal_document_find(
    p_tenant_id uuid,
    p_organization_id uuid,
    p_company_id text,
    p_document_id text
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select to_jsonb(document_row)
    from public.shared_fiscal_documents document_row
    where document_row.tenant_id = p_tenant_id
      and document_row.organization_id = p_organization_id
      and document_row.company_id = p_company_id
      and document_row.id = p_document_id
$$;

create or replace function public.shared_fiscal_document_list(
    p_tenant_id uuid,
    p_organization_id uuid,
    p_company_id text,
    p_limit integer,
    p_cursor_created_at timestamptz,
    p_cursor_id text
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if p_limit is null or p_limit < 1 or p_limit > 100
       or ((p_cursor_created_at is null) <> (p_cursor_id is null)) then
        raise exception 'FISCAL_DOCUMENT_INVALID';
    end if;

    if not exists (
        select 1 from public.shared_companies company
        where company.tenant_id = p_tenant_id
          and company.organization_id = p_organization_id
          and company.id = p_company_id
    ) then
        raise exception 'FISCAL_DOCUMENT_OUTSIDE_COMPANY';
    end if;

    return (
        with page as materialized (
            select document_row.id, document_row.created_at, document_row.document_snapshot
            from public.shared_fiscal_documents document_row
            where document_row.tenant_id = p_tenant_id
              and document_row.organization_id = p_organization_id
              and document_row.company_id = p_company_id
              and (p_cursor_created_at is null
                   or (document_row.created_at, document_row.id) < (p_cursor_created_at, p_cursor_id))
            order by document_row.created_at desc, document_row.id desc
            limit p_limit + 1
        ), visible as materialized (
            select page.id, page.created_at, page.document_snapshot
            from page
            order by page.created_at desc, page.id desc
            limit p_limit
        ), page_state as (
            select (select count(*) > p_limit from page) as has_more
        )
        select jsonb_build_object(
            'items', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', visible.id,
                    'created_at', visible.created_at,
                    'document_snapshot', visible.document_snapshot
                ) order by visible.created_at desc, visible.id desc)
                from visible
            ), '[]'::jsonb),
            'nextCursor', case when page_state.has_more then (
                select jsonb_build_object('createdAt', oldest.created_at, 'id', oldest.id)
                from visible oldest
                order by oldest.created_at asc, oldest.id asc
                limit 1
            ) else null end
        )
        from page_state
    );
end;
$$;

create or replace function public.shared_fiscal_document_event_list(
    p_tenant_id uuid,
    p_organization_id uuid,
    p_company_id text,
    p_document_id text,
    p_limit integer,
    p_cursor_recorded_at timestamptz,
    p_cursor_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if p_limit is null or p_limit < 1 or p_limit > 100
       or ((p_cursor_recorded_at is null) <> (p_cursor_id is null)) then
        raise exception 'FISCAL_DOCUMENT_INVALID';
    end if;

    if not exists (
        select 1 from public.shared_fiscal_documents document_row
        where document_row.tenant_id = p_tenant_id
          and document_row.organization_id = p_organization_id
          and document_row.company_id = p_company_id
          and document_row.id = p_document_id
    ) then
        raise exception 'FISCAL_DOCUMENT_NOT_FOUND';
    end if;

    return (
        with page as materialized (
            select event_row.id, event_row.event_type, event_row.idempotency_key,
                   event_row.payload, event_row.occurred_at, event_row.recorded_at
            from public.shared_fiscal_document_events event_row
            where event_row.tenant_id = p_tenant_id
              and event_row.document_id = p_document_id
              and (p_cursor_recorded_at is null
                   or (event_row.recorded_at, event_row.id) < (p_cursor_recorded_at, p_cursor_id))
            order by event_row.recorded_at desc, event_row.id desc
            limit p_limit + 1
        ), visible as materialized (
            select page.* from page
            order by page.recorded_at desc, page.id desc
            limit p_limit
        ), page_state as (
            select (select count(*) > p_limit from page) as has_more
        )
        select jsonb_build_object(
            'items', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', visible.id,
                    'event_type', visible.event_type,
                    'idempotency_key', visible.idempotency_key,
                    'payload', visible.payload,
                    'occurred_at', visible.occurred_at,
                    'recorded_at', visible.recorded_at
                ) order by visible.recorded_at desc, visible.id desc)
                from visible
            ), '[]'::jsonb),
            'nextCursor', case when page_state.has_more then (
                select jsonb_build_object('recordedAt', oldest.recorded_at, 'id', oldest.id)
                from visible oldest
                order by oldest.recorded_at asc, oldest.id asc
                limit 1
            ) else null end
        ) from page_state
    );
end;
$$;

create or replace function public.shared_fiscal_document_persist_draft(
    p_tenant_id uuid,
    p_organization_id uuid,
    p_company_id text,
    p_source_kind text,
    p_source_id text,
    p_document_id text,
    p_document_snapshot jsonb,
    p_idempotency_key text,
    p_created_by uuid,
    p_occurred_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_document public.shared_fiscal_documents%rowtype;
    v_event public.shared_fiscal_document_events%rowtype;
begin
    if p_document_snapshot is null or jsonb_typeof(p_document_snapshot) <> 'object'
       or nullif(btrim(p_source_kind), '') is null
       or nullif(btrim(p_source_id), '') is null
       or nullif(btrim(p_document_id), '') is null
       or nullif(btrim(p_idempotency_key), '') is null
       or p_document_snapshot->>'id' is distinct from btrim(p_document_id)
       or p_document_snapshot->>'companyId' is distinct from p_company_id
       or p_document_snapshot->>'direction' is distinct from 'issued'
       or p_document_snapshot->>'status' is distinct from 'draft'
       or p_occurred_at is null then
        raise exception 'FISCAL_DOCUMENT_INVALID';
    end if;

    if not exists (
        select 1 from public.shared_companies company
        where company.tenant_id = p_tenant_id
          and company.organization_id = p_organization_id
          and company.id = p_company_id
    ) then
        raise exception 'FISCAL_DOCUMENT_OUTSIDE_COMPANY';
    end if;

    if p_created_by is not null and not exists (
        select 1 from public.organization_memberships membership
        where membership.organization_id = p_organization_id
          and membership.user_id = p_created_by
          and membership.status = 'active'
    ) then
        raise exception 'FISCAL_DOCUMENT_ACTOR_OUTSIDE_ORGANIZATION';
    end if;

    -- Concurrent retries of the same command must reach the exact-replay path
    -- instead of racing through the unique index and surfacing a generic error.
    perform pg_advisory_xact_lock(hashtextextended(
        p_tenant_id::text || ':' || p_company_id || ':fiscal-document:' || btrim(p_idempotency_key), 0
    ));

    select * into v_document
    from public.shared_fiscal_documents
    where tenant_id = p_tenant_id
      and company_id = p_company_id
      and idempotency_key = p_idempotency_key
    for update;

    if found then
        if v_document.organization_id = p_organization_id
           and v_document.source_kind = btrim(p_source_kind)
           and v_document.source_id = btrim(p_source_id)
           and v_document.id = btrim(p_document_id)
           and v_document.document_status = 'draft'
           and v_document.document_snapshot = p_document_snapshot
           and v_document.created_by is not distinct from p_created_by
           and v_document.created_at = p_occurred_at then
            return jsonb_build_object('document', to_jsonb(v_document), 'replayed', true);
        end if;
        raise exception 'FISCAL_DOCUMENT_IDEMPOTENCY_CONFLICT';
    end if;

    select * into v_document
    from public.shared_fiscal_documents
    where tenant_id = p_tenant_id
      and company_id = p_company_id
      and (id = btrim(p_document_id) or (source_kind = btrim(p_source_kind) and source_id = btrim(p_source_id)))
    for update;

    if found then
        raise exception 'FISCAL_DOCUMENT_SOURCE_CONFLICT';
    end if;

    insert into public.shared_fiscal_documents (
        tenant_id, id, organization_id, company_id, source_kind, source_id,
        idempotency_key, document_status, document_snapshot, created_by,
        created_at, updated_at
    ) values (
        p_tenant_id, btrim(p_document_id), p_organization_id, p_company_id,
        btrim(p_source_kind), btrim(p_source_id), btrim(p_idempotency_key),
        'draft', p_document_snapshot, p_created_by, p_occurred_at, p_occurred_at
    ) returning * into v_document;

    insert into public.shared_fiscal_document_events (
        tenant_id, document_id, event_type, idempotency_key, payload, occurred_at
    ) values (
        p_tenant_id, v_document.id, 'fiscal_document.prepared', btrim(p_idempotency_key),
        jsonb_build_object(
            'documentId', v_document.id,
            'organizationId', p_organization_id,
            'companyId', p_company_id,
            'source', jsonb_build_object('kind', v_document.source_kind, 'id', v_document.source_id)
        ), p_occurred_at
    ) returning * into v_event;

    return jsonb_build_object('document', to_jsonb(v_document), 'event', to_jsonb(v_event), 'replayed', false);
end;
$$;

create or replace function public.shared_fiscal_document_record_issuance_attempt(
    p_tenant_id uuid,
    p_organization_id uuid,
    p_company_id text,
    p_attempt_id text,
    p_document_id text,
    p_provider text,
    p_provider_idempotency_key text,
    p_attempt_state text,
    p_request_fingerprint text,
    p_provider_reference text,
    p_failure_code text,
    p_issued_document_snapshot jsonb,
    p_occurred_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_document public.shared_fiscal_documents%rowtype;
    v_command public.shared_fiscal_issuance_commands%rowtype;
    v_attempt public.shared_fiscal_issuance_attempts%rowtype;
    v_event public.shared_fiscal_document_events%rowtype;
    v_transitioned boolean := false;
begin
    if nullif(btrim(p_attempt_id), '') is null
       or nullif(btrim(p_document_id), '') is null
       or nullif(btrim(p_provider), '') is null
       or nullif(btrim(p_provider_idempotency_key), '') is null
       or nullif(btrim(p_request_fingerprint), '') is null
       or p_attempt_state is null
       or p_attempt_state not in ('pending', 'accepted', 'rejected', 'unknown')
       or p_occurred_at is null then
        raise exception 'FISCAL_ISSUANCE_ATTEMPT_INVALID';
    end if;
    if (p_attempt_state = 'accepted' and (p_issued_document_snapshot is null
        or jsonb_typeof(p_issued_document_snapshot) <> 'object'
        or p_issued_document_snapshot->>'status' is distinct from 'issued'
        or p_issued_document_snapshot->>'id' is distinct from btrim(p_document_id)
        or p_issued_document_snapshot->>'companyId' is distinct from p_company_id
        or nullif(p_issued_document_snapshot->>'number', '') is null
        or nullif(p_issued_document_snapshot->>'issuedAt', '') is null
        or nullif(p_issued_document_snapshot->>'issueDate', '') is null
        or jsonb_typeof(p_issued_document_snapshot->'issuanceEvidence') is distinct from 'object'
        or p_issued_document_snapshot->'issuanceEvidence'->>'provider' is distinct from btrim(p_provider)))
       or (p_attempt_state <> 'accepted' and p_issued_document_snapshot is not null) then
        raise exception 'FISCAL_ISSUANCE_SNAPSHOT_INVALID';
    end if;

    select * into v_document
    from public.shared_fiscal_documents
    where tenant_id = p_tenant_id
      and organization_id = p_organization_id
      and company_id = p_company_id
      and id = btrim(p_document_id)
    for update;

    if not found then
        raise exception 'FISCAL_DOCUMENT_NOT_FOUND';
    end if;

    -- A provider command survives every network retry.  Individual attempts use
    -- distinct IDs and remain append-only under this serialized command key.
    perform pg_advisory_xact_lock(hashtextextended(
        p_tenant_id::text || ':' || v_document.id || ':fiscal-command:' || btrim(p_provider) || ':' || btrim(p_provider_idempotency_key), 0
    ));

    select * into v_attempt
    from public.shared_fiscal_issuance_attempts
    where tenant_id = p_tenant_id and id = btrim(p_attempt_id);

    if found then
        if v_attempt.document_id = v_document.id
           and v_attempt.provider = btrim(p_provider)
           and v_attempt.idempotency_key = btrim(p_provider_idempotency_key)
           and v_attempt.attempt_state = p_attempt_state
           and v_attempt.request_fingerprint = btrim(p_request_fingerprint)
           and v_attempt.provider_reference is not distinct from nullif(btrim(p_provider_reference), '')
           and v_attempt.failure_code is not distinct from nullif(btrim(p_failure_code), '')
           and v_attempt.occurred_at = p_occurred_at
           and (p_attempt_state <> 'accepted' or (v_document.document_status = 'issued' and v_document.document_snapshot = p_issued_document_snapshot)) then
            return jsonb_build_object('document', to_jsonb(v_document), 'attempt', to_jsonb(v_attempt), 'replayed', true);
        end if;
        raise exception 'FISCAL_ISSUANCE_ATTEMPT_ID_CONFLICT';
    end if;

    select * into v_command
    from public.shared_fiscal_issuance_commands
    where tenant_id = p_tenant_id
      and document_id = v_document.id
      and provider = btrim(p_provider)
      and idempotency_key = btrim(p_provider_idempotency_key)
    for update;

    if not found then
        insert into public.shared_fiscal_issuance_commands (
            tenant_id, id, document_id, provider, idempotency_key, command_state,
            request_fingerprint, provider_reference, failure_code, created_at, updated_at
        ) values (
            p_tenant_id, gen_random_uuid()::text, v_document.id, btrim(p_provider),
            btrim(p_provider_idempotency_key), p_attempt_state, btrim(p_request_fingerprint),
            nullif(btrim(p_provider_reference), ''), nullif(btrim(p_failure_code), ''), p_occurred_at, p_occurred_at
        ) returning * into v_command;
        v_transitioned := true;
    elsif v_command.request_fingerprint <> btrim(p_request_fingerprint) then
        raise exception 'FISCAL_ISSUANCE_COMMAND_IDEMPOTENCY_CONFLICT';
    elsif v_command.command_state <> p_attempt_state then
        update public.shared_fiscal_issuance_commands
        set command_state = p_attempt_state,
            provider_reference = nullif(btrim(p_provider_reference), ''),
            failure_code = nullif(btrim(p_failure_code), ''),
            updated_at = p_occurred_at
        where tenant_id = p_tenant_id and id = v_command.id
        returning * into v_command;
        v_transitioned := true;
    end if;

    if not v_transitioned and v_command.command_state in ('accepted', 'rejected') then
        raise exception 'FISCAL_ISSUANCE_COMMAND_TERMINAL';
    end if;

    if p_attempt_state = 'accepted' then
        if v_document.document_status = 'draft' then
            update public.shared_fiscal_documents
            set document_status = 'issued', document_snapshot = p_issued_document_snapshot, updated_at = p_occurred_at
            where tenant_id = p_tenant_id and id = v_document.id
            returning * into v_document;
        elsif v_document.document_status <> 'issued' or v_document.document_snapshot <> p_issued_document_snapshot then
            raise exception 'FISCAL_DOCUMENT_ALREADY_FINALIZED';
        end if;
    end if;

    insert into public.shared_fiscal_issuance_attempts (
        tenant_id, id, document_id, command_id, provider, idempotency_key, attempt_state,
        request_fingerprint, provider_reference, failure_code, occurred_at
    ) values (
        p_tenant_id, btrim(p_attempt_id), v_document.id, v_command.id, btrim(p_provider),
        btrim(p_provider_idempotency_key), p_attempt_state, btrim(p_request_fingerprint),
        nullif(btrim(p_provider_reference), ''), nullif(btrim(p_failure_code), ''), p_occurred_at
    ) returning * into v_attempt;

    if v_transitioned then
        insert into public.shared_fiscal_document_events (
            tenant_id, document_id, event_type, idempotency_key, payload, occurred_at
        ) values (
            p_tenant_id, v_document.id, 'fiscal_document.issuance_' || p_attempt_state,
            v_command.id || ':' || btrim(p_attempt_id),
            jsonb_build_object('documentId', v_document.id, 'commandId', v_command.id,
                'attemptId', v_attempt.id, 'provider', v_command.provider, 'state', v_command.command_state),
            p_occurred_at
        ) returning * into v_event;
    end if;

    return jsonb_build_object('document', to_jsonb(v_document), 'command', to_jsonb(v_command),
        'attempt', to_jsonb(v_attempt), 'event', case when v_event.id is null then null else to_jsonb(v_event) end,
        'replayed', false);
end;
$$;

drop trigger if exists shared_fiscal_documents_assert_company_scope on public.shared_fiscal_documents;
create trigger shared_fiscal_documents_assert_company_scope
before insert or update of tenant_id, organization_id, company_id on public.shared_fiscal_documents
for each row execute function public.shared_fiscal_document_assert_company_scope();

drop trigger if exists shared_fiscal_documents_enforce_lifecycle on public.shared_fiscal_documents;
create trigger shared_fiscal_documents_enforce_lifecycle
before update on public.shared_fiscal_documents
for each row execute function public.shared_fiscal_document_enforce_lifecycle();

drop trigger if exists shared_fiscal_documents_no_delete on public.shared_fiscal_documents;
create trigger shared_fiscal_documents_no_delete
before delete on public.shared_fiscal_documents
for each row execute function public.shared_fiscal_append_only();

drop trigger if exists shared_fiscal_issuance_attempts_append_only on public.shared_fiscal_issuance_attempts;
create trigger shared_fiscal_issuance_attempts_append_only
before update or delete on public.shared_fiscal_issuance_attempts
for each row execute function public.shared_fiscal_append_only();

drop trigger if exists shared_fiscal_issuance_commands_enforce_lifecycle on public.shared_fiscal_issuance_commands;
create trigger shared_fiscal_issuance_commands_enforce_lifecycle
before update on public.shared_fiscal_issuance_commands
for each row execute function public.shared_fiscal_issuance_command_enforce_lifecycle();

drop trigger if exists shared_fiscal_document_events_append_only on public.shared_fiscal_document_events;
create trigger shared_fiscal_document_events_append_only
before update or delete on public.shared_fiscal_document_events
for each row execute function public.shared_fiscal_append_only();

alter table public.shared_fiscal_documents enable row level security;
alter table public.shared_fiscal_issuance_commands enable row level security;
alter table public.shared_fiscal_issuance_attempts enable row level security;
alter table public.shared_fiscal_document_events enable row level security;

-- Browser roles have no direct table access.  Service-role adapters use scoped
-- RPCs so callers cannot bypass transaction, idempotency, or scope checks.
revoke all on public.shared_fiscal_documents, public.shared_fiscal_issuance_commands, public.shared_fiscal_issuance_attempts, public.shared_fiscal_document_events from anon, authenticated, service_role;
revoke all on function public.shared_fiscal_document_assert_company_scope() from public, anon, authenticated;
revoke all on function public.shared_fiscal_document_enforce_lifecycle() from public, anon, authenticated;
revoke all on function public.shared_fiscal_append_only() from public, anon, authenticated;
revoke all on function public.shared_fiscal_document_find(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.shared_fiscal_document_list(uuid, uuid, text, integer, timestamptz, text) from public, anon, authenticated;
revoke all on function public.shared_fiscal_document_event_list(uuid, uuid, text, text, integer, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.shared_fiscal_issuance_command_enforce_lifecycle() from public, anon, authenticated;
revoke all on function public.shared_fiscal_document_persist_draft(uuid, uuid, text, text, text, text, jsonb, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.shared_fiscal_document_record_issuance_attempt(uuid, uuid, text, text, text, text, text, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.shared_fiscal_document_persist_draft(uuid, uuid, text, text, text, text, jsonb, text, uuid, timestamptz) to service_role;
grant execute on function public.shared_fiscal_document_record_issuance_attempt(uuid, uuid, text, text, text, text, text, text, text, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.shared_fiscal_document_find(uuid, uuid, text, text) to service_role;
grant execute on function public.shared_fiscal_document_list(uuid, uuid, text, integer, timestamptz, text) to service_role;
grant execute on function public.shared_fiscal_document_event_list(uuid, uuid, text, text, integer, timestamptz, uuid) to service_role;
