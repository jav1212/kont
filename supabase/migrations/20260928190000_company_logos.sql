-- ADM-024: secure company-specific public branding assets.
-- Uploads and deletions are performed only by the trusted service-role adapter.
do $precondition$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='shared_companies' and column_name='logo_url'
    ) then raise exception 'COMPANY_LOGO_PREREQUISITE_MISSING'; end if;
    if exists (select 1 from storage.buckets where id='company-logos') then
        raise exception 'COMPANY_LOGO_BUCKET_ALREADY_EXISTS';
    end if;
end;
$precondition$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos', 'company-logos', true, 5242880, array['image/png','image/jpeg','image/webp']);

-- Company logos are intentionally public for document and customer-facing
-- presentation. This bucket has no anon/authenticated write policy.
create policy company_logos_public_read on storage.objects
for select to public using (bucket_id = 'company-logos');

create table public.shared_company_logo_events (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    tenant_id uuid not null,
    company_id text not null,
    actor_user_id uuid not null,
    previous_version integer not null check (previous_version > 0),
    company_version integer not null check (company_version > previous_version),
    previous_logo_url text,
    logo_url text,
    occurred_at timestamptz not null default now(),
    foreign key (tenant_id, company_id)
        references public.shared_companies(tenant_id, id) on delete restrict
);
create index shared_company_logo_events_scope_idx
    on public.shared_company_logo_events(organization_id, company_id, occurred_at desc);
alter table public.shared_company_logo_events enable row level security;
revoke all on public.shared_company_logo_events from public, anon, authenticated, service_role;

create or replace function public.prevent_company_logo_event_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
    raise exception 'COMPANY_LOGO_EVENT_IMMUTABLE';
end;
$$;
create trigger shared_company_logo_events_immutable
before update or delete on public.shared_company_logo_events
for each row execute function public.prevent_company_logo_event_mutation();

create or replace function public.company_administration_snapshot(p_company public.shared_companies)
returns jsonb language sql immutable set search_path = public as $$
    select jsonb_build_object(
        'id', p_company.id, 'organization_id', p_company.organization_id,
        'name', p_company.name, 'trade_name', p_company.trade_name,
        'rif', p_company.rif, 'country', p_company.country, 'status', p_company.status,
        'operating_profile', p_company.operating_profile, 'version', p_company.version,
        'logo_url', p_company.logo_url
    );
$$;

create or replace function public.update_native_company_logo(
    p_actor_user_id uuid,
    p_organization_id uuid,
    p_company_id text,
    p_expected_version integer,
    p_logo_url text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_tenant_id uuid;
    v_company public.shared_companies%rowtype;
    v_updated public.shared_companies%rowtype;
    v_object_prefix text;
    v_object_name text;
begin
    v_tenant_id := public.assert_company_administration_access(
        p_organization_id, p_actor_user_id, 'companies.update');
    if p_company_id is null or length(trim(p_company_id)) not between 1 and 128
        or p_expected_version is null or p_expected_version < 1
        or (p_logo_url is not null and length(p_logo_url) > 2048)
    then raise exception 'COMPANY_LOGO_INVALID'; end if;

    -- Object names use UTF-8 hex for the company segment so legacy IDs cannot
    -- escape their storage prefix or collide through URL path normalization.
    if p_logo_url is not null then
        v_object_prefix := '/storage/v1/object/public/company-logos/'
            || p_organization_id::text || '/'
            || encode(convert_to(p_company_id, 'UTF8'), 'hex') || '/';
        if position(v_object_prefix in p_logo_url) = 0 then
            raise exception 'COMPANY_LOGO_INVALID';
        end if;
        v_object_name := substring(p_logo_url from position(v_object_prefix in p_logo_url) + length(v_object_prefix));
        if p_logo_url not like 'https://%'
            or v_object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$'
        then raise exception 'COMPANY_LOGO_INVALID'; end if;
    end if;

    perform pg_advisory_xact_lock(hashtextextended('company-administration:' || p_organization_id::text, 0));
    select * into v_company from public.shared_companies
    where tenant_id = v_tenant_id and organization_id = p_organization_id and id = p_company_id
    for update;
    if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
    if v_company.version <> p_expected_version then raise exception 'COMPANY_VERSION_CONFLICT'; end if;
    if v_company.status = 'archived' then raise exception 'COMPANY_TRANSITION_INVALID'; end if;
    if v_company.logo_url is not distinct from p_logo_url then
        return public.company_administration_snapshot(v_company);
    end if;

    update public.shared_companies set logo_url = p_logo_url
    where tenant_id = v_tenant_id and organization_id = p_organization_id and id = p_company_id
        and version = p_expected_version
    returning * into v_updated;
    if not found then raise exception 'COMPANY_VERSION_CONFLICT'; end if;

    insert into public.shared_company_administration_events(
        organization_id, company_id, actor_user_id, action, previous_version, version
    ) values (p_organization_id, p_company_id, p_actor_user_id,
        'logo_updated', p_expected_version, v_updated.version);
    insert into public.shared_company_logo_events(
        organization_id, tenant_id, company_id, actor_user_id, previous_version,
        company_version, previous_logo_url, logo_url
    ) values (p_organization_id, v_tenant_id, p_company_id, p_actor_user_id,
        p_expected_version, v_updated.version, v_company.logo_url, p_logo_url);
    return public.company_administration_snapshot(v_updated);
end;
$$;

alter table public.shared_company_administration_events
    drop constraint shared_company_administration_events_action_check;
alter table public.shared_company_administration_events
    add constraint shared_company_administration_events_action_check
    check (action in ('created', 'updated', 'suspended', 'activated',
        'document_numbering_updated', 'logo_updated'));

revoke all on function public.prevent_company_logo_event_mutation(),
    public.update_native_company_logo(uuid, uuid, text, integer, text)
from public, anon, authenticated, service_role;
grant execute on function public.update_native_company_logo(uuid, uuid, text, integer, text)
to service_role;
