-- ADM-004 / ADM-006: atomic, typed copies of company configuration.  This is
-- additive and intentionally does not migrate any existing company or sidecar.

create table public.shared_company_configuration_copy_requests (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    tenant_id uuid not null,
    actor_user_id uuid not null,
    operation text not null check (operation in ('copy_to_existing', 'create_from_existing')),
    idempotency_key text not null check (length(idempotency_key) between 1 and 128),
    intent jsonb not null,
    intent_sha256 text not null check (intent_sha256 ~ '^[0-9a-f]{64}$'),
    result jsonb,
    created_at timestamptz not null default now(),
    unique (organization_id, actor_user_id, operation, idempotency_key)
);
create table public.shared_company_configuration_copy_events (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    tenant_id uuid not null,
    actor_user_id uuid not null,
    source_company_id text not null,
    destination_company_id text not null,
    action text not null check (action in ('copied_to_existing', 'created_from_existing')),
    copied_sections jsonb not null,
    request_id uuid not null references public.shared_company_configuration_copy_requests(id) on delete restrict,
    occurred_at timestamptz not null default now()
);
create index shared_company_configuration_copy_events_request_idx on public.shared_company_configuration_copy_events(request_id);
create index shared_company_configuration_copy_events_organization_idx on public.shared_company_configuration_copy_events(organization_id, occurred_at desc);
alter table public.shared_company_configuration_copy_requests enable row level security;
alter table public.shared_company_configuration_copy_events enable row level security;
revoke all on public.shared_company_configuration_copy_requests, public.shared_company_configuration_copy_events from public, anon, authenticated, service_role;
create or replace function public.prevent_company_configuration_copy_event_update()
returns trigger language plpgsql set search_path=public as $$ begin raise exception 'COMPANY_CONFIGURATION_COPY_EVENT_IMMUTABLE'; end; $$;
create trigger shared_company_configuration_copy_events_immutable before update on public.shared_company_configuration_copy_events for each row execute function public.prevent_company_configuration_copy_event_update();

create or replace function public.company_configuration_copy_sections_valid(p_sections jsonb)
returns boolean language sql immutable set search_path=public as $$
  select case when jsonb_typeof(p_sections)='array' then coalesce(jsonb_array_length(p_sections)>0
    and not exists(select 1 from jsonb_array_elements_text(p_sections) s where s not in ('operating_profile','date_format','monetary_policy'))
    and jsonb_array_length(p_sections)=(select count(distinct s) from jsonb_array_elements_text(p_sections) s), false) else false end;
$$;

create or replace function public.company_configuration_copy_result(p_company public.shared_companies,p_sections jsonb)
returns jsonb language sql stable set search_path=public as $$
  select jsonb_build_object('company',public.company_administration_snapshot(p_company),'copied_sections',p_sections);
$$;

create or replace function public.copy_native_company_configuration(
  p_actor_user_id uuid,p_organization_id uuid,p_source_company_id text,p_expected_source_company_version integer,
  p_destination_company_id text,p_expected_destination_company_version integer,
  p_expected_source_date_format_version integer,p_expected_source_monetary_policy_version integer,
  p_expected_destination_date_format_version integer,p_expected_destination_monetary_policy_version integer,
  p_idempotency_key text,p_sections jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_destination_tenant uuid; v_source public.shared_companies%rowtype; v_destination public.shared_companies%rowtype;
  v_source_date public.shared_company_date_formats%rowtype; v_source_policy public.shared_company_monetary_policies%rowtype;
  v_request public.shared_company_configuration_copy_requests%rowtype; v_intent jsonb; v_hash text; v_result jsonb; v_key text;
begin
  v_tenant:=public.assert_user_security_access(p_actor_user_id,p_organization_id,p_source_company_id,'companies.read');
  v_destination_tenant:=public.assert_user_security_access(p_actor_user_id,p_organization_id,p_destination_company_id,'companies.update');
  if v_tenant is distinct from v_destination_tenant then raise exception 'COMPANY_CONFIGURATION_COPY_INVALID'; end if;
  if p_source_company_id is null or p_destination_company_id is null or trim(p_source_company_id)=trim(p_destination_company_id)
    or p_expected_source_company_version is null or p_expected_source_company_version<1 or p_expected_destination_company_version is null or p_expected_destination_company_version<1
    or p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 128 or public.company_configuration_copy_sections_valid(p_sections) is distinct from true
  then raise exception 'COMPANY_CONFIGURATION_COPY_INVALID'; end if;
  if (p_sections ? 'date_format') and (p_expected_source_date_format_version is null or p_expected_source_date_format_version<1 or p_expected_destination_date_format_version is null or p_expected_destination_date_format_version<0)
    or ((p_sections ? 'date_format') is false) and (p_expected_source_date_format_version is not null or p_expected_destination_date_format_version is not null)
    or (p_sections ? 'monetary_policy') and (p_expected_source_monetary_policy_version is null or p_expected_source_monetary_policy_version<1 or p_expected_destination_monetary_policy_version is null or p_expected_destination_monetary_policy_version<0)
    or ((p_sections ? 'monetary_policy') is false) and (p_expected_source_monetary_policy_version is not null or p_expected_destination_monetary_policy_version is not null)
  then raise exception 'COMPANY_CONFIGURATION_COPY_INVALID'; end if;
  v_intent:=jsonb_build_object('sourceCompanyId',trim(p_source_company_id),'sourceCompanyVersion',p_expected_source_company_version,'destinationCompanyId',trim(p_destination_company_id),'destinationCompanyVersion',p_expected_destination_company_version,'sourceDateFormatVersion',p_expected_source_date_format_version,'sourceMonetaryPolicyVersion',p_expected_source_monetary_policy_version,'destinationDateFormatVersion',p_expected_destination_date_format_version,'destinationMonetaryPolicyVersion',p_expected_destination_monetary_policy_version,'sections',p_sections);
  v_hash:=encode(extensions.digest(v_intent::text,'sha256'),'hex');
  insert into public.shared_company_configuration_copy_requests(organization_id,tenant_id,actor_user_id,operation,idempotency_key,intent,intent_sha256)
    values(p_organization_id,v_tenant,p_actor_user_id,'copy_to_existing',trim(p_idempotency_key),v_intent,v_hash) on conflict do nothing;
  select * into v_request from public.shared_company_configuration_copy_requests where organization_id=p_organization_id and actor_user_id=p_actor_user_id and operation='copy_to_existing' and idempotency_key=trim(p_idempotency_key) for update;
  if v_request.intent_sha256<>v_hash or v_request.intent is distinct from v_intent then raise exception 'COMPANY_CONFIGURATION_COPY_IDEMPOTENCY_CONFLICT'; end if;
  if v_request.result is not null then return v_request.result; end if;
  -- Ordered row locks prevent two inverse copies from deadlocking.
  perform 1 from public.shared_companies c where c.organization_id=p_organization_id and c.tenant_id=v_tenant and c.id in (trim(p_source_company_id),trim(p_destination_company_id)) order by c.id for update;
  select * into v_source from public.shared_companies where organization_id=p_organization_id and tenant_id=v_tenant and id=trim(p_source_company_id);
  select * into v_destination from public.shared_companies where organization_id=p_organization_id and tenant_id=v_tenant and id=trim(p_destination_company_id);
  if not found or v_source.id is null or v_destination.id is null or v_source.status<>'active' or v_destination.status<>'active' then raise exception 'COMPANY_NOT_FOUND'; end if;
  if v_source.version<>p_expected_source_company_version or v_destination.version<>p_expected_destination_company_version then raise exception 'COMPANY_CONFIGURATION_COPY_VERSION_CONFLICT'; end if;
  if p_sections ? 'date_format' then
    select * into v_source_date from public.shared_company_date_formats where organization_id=p_organization_id and tenant_id=v_tenant and company_id=v_source.id for share;
    if not found then raise exception 'COMPANY_CONFIGURATION_SOURCE_SETTINGS_ABSENT'; end if;
    if v_source_date.format_version<>p_expected_source_date_format_version then raise exception 'COMPANY_CONFIGURATION_COPY_VERSION_CONFLICT'; end if;
  end if;
  if p_sections ? 'monetary_policy' then
    select * into v_source_policy from public.shared_company_monetary_policies where organization_id=p_organization_id and tenant_id=v_tenant and company_id=v_source.id for share;
    if not found then raise exception 'COMPANY_CONFIGURATION_SOURCE_SETTINGS_ABSENT'; end if;
    if v_source_policy.policy_version<>p_expected_source_monetary_policy_version then raise exception 'COMPANY_CONFIGURATION_COPY_VERSION_CONFLICT'; end if;
  end if;
  v_key:='company-copy:'||v_request.id::text;
  if p_sections ? 'operating_profile' then
    update public.shared_companies set operating_profile=v_source.operating_profile where organization_id=p_organization_id and tenant_id=v_tenant and id=v_destination.id and version=p_expected_destination_company_version returning * into v_destination;
    if not found then raise exception 'COMPANY_CONFIGURATION_COPY_VERSION_CONFLICT'; end if;
  end if;
  if p_sections ? 'date_format' then perform public.configure_native_company_date_format(p_actor_user_id,p_organization_id,v_destination.id,p_expected_destination_date_format_version,v_key||':date','Copied from company '||v_source.id,v_source_date.date_order); end if;
  if p_sections ? 'monetary_policy' then perform public.configure_native_company_monetary_policy(p_actor_user_id,p_organization_id,v_destination.id,p_expected_destination_monetary_policy_version,v_key||':policy','Copied from company '||v_source.id,jsonb_build_object('operatingCurrency',jsonb_build_object('code','VES','minorUnit',2),'referenceCurrencyCodes',to_jsonb(v_source_policy.reference_currency_codes),'rateSource','bcv','roundingProfile','commercial_v1','allowPreviousAvailableDate',false,'maxPreviousDays',0)); end if;
  select * into v_destination from public.shared_companies where organization_id=p_organization_id and tenant_id=v_tenant and id=v_destination.id;
  v_result:=public.company_configuration_copy_result(v_destination,p_sections);
  update public.shared_company_configuration_copy_requests set result=v_result where id=v_request.id;
  insert into public.shared_company_configuration_copy_events(organization_id,tenant_id,actor_user_id,source_company_id,destination_company_id,action,copied_sections,request_id) values(p_organization_id,v_tenant,p_actor_user_id,v_source.id,v_destination.id,'copied_to_existing',p_sections,v_request.id);
  return v_result;
end;
$$;

create or replace function public.create_native_company_from_existing(
  p_actor_user_id uuid,p_organization_id uuid,p_source_company_id text,p_expected_source_company_version integer,
  p_expected_source_date_format_version integer,p_expected_source_monetary_policy_version integer,p_idempotency_key text,p_sections jsonb,p_target jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_source public.shared_companies%rowtype; v_created public.shared_companies%rowtype; v_source_date public.shared_company_date_formats%rowtype; v_source_policy public.shared_company_monetary_policies%rowtype;
  v_request public.shared_company_configuration_copy_requests%rowtype; v_intent jsonb; v_hash text; v_created_json jsonb; v_result jsonb; v_profile text; v_key text;
begin
  v_tenant:=public.assert_user_security_access(p_actor_user_id,p_organization_id,p_source_company_id,'companies.read');
  perform public.assert_user_security_access(p_actor_user_id,p_organization_id,null,'companies.create');
  if p_source_company_id is null or p_expected_source_company_version is null or p_expected_source_company_version<1 or p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 128 or public.company_configuration_copy_sections_valid(p_sections) is distinct from true or p_target is null or jsonb_typeof(p_target)<>'object' or exists(select 1 from jsonb_object_keys(p_target) k where k not in ('legalName','tradeName','taxId','country','personNature')) or not (p_target ?& array['legalName','tradeName','taxId','country','personNature']) or jsonb_typeof(p_target->'legalName')<>'string' or jsonb_typeof(p_target->'country')<>'string' or jsonb_typeof(p_target->'personNature')<>'string' or jsonb_typeof(p_target->'tradeName') not in ('string','null') or jsonb_typeof(p_target->'taxId') not in ('string','null') then raise exception 'COMPANY_CONFIGURATION_COPY_INVALID'; end if;
  if (p_sections ? 'date_format') and (p_expected_source_date_format_version is null or p_expected_source_date_format_version<1) or ((p_sections ? 'date_format') is false) and p_expected_source_date_format_version is not null or (p_sections ? 'monetary_policy') and (p_expected_source_monetary_policy_version is null or p_expected_source_monetary_policy_version<1) or ((p_sections ? 'monetary_policy') is false) and p_expected_source_monetary_policy_version is not null then raise exception 'COMPANY_CONFIGURATION_COPY_INVALID'; end if;
  v_intent:=jsonb_build_object('sourceCompanyId',trim(p_source_company_id),'sourceCompanyVersion',p_expected_source_company_version,'sourceDateFormatVersion',p_expected_source_date_format_version,'sourceMonetaryPolicyVersion',p_expected_source_monetary_policy_version,'sections',p_sections,'target',p_target);
  v_hash:=encode(extensions.digest(v_intent::text,'sha256'),'hex');
  insert into public.shared_company_configuration_copy_requests(organization_id,tenant_id,actor_user_id,operation,idempotency_key,intent,intent_sha256) values(p_organization_id,v_tenant,p_actor_user_id,'create_from_existing',trim(p_idempotency_key),v_intent,v_hash) on conflict do nothing;
  select * into v_request from public.shared_company_configuration_copy_requests where organization_id=p_organization_id and actor_user_id=p_actor_user_id and operation='create_from_existing' and idempotency_key=trim(p_idempotency_key) for update;
  if v_request.intent_sha256<>v_hash or v_request.intent is distinct from v_intent then raise exception 'COMPANY_CONFIGURATION_COPY_IDEMPOTENCY_CONFLICT'; end if;
  if v_request.result is not null then return v_request.result; end if;
  select * into v_source from public.shared_companies where organization_id=p_organization_id and tenant_id=v_tenant and id=trim(p_source_company_id) for update;
  if not found or v_source.status<>'active' then raise exception 'COMPANY_NOT_FOUND'; end if;
  if v_source.version<>p_expected_source_company_version then raise exception 'COMPANY_CONFIGURATION_COPY_VERSION_CONFLICT'; end if;
  if p_sections ? 'date_format' then select * into v_source_date from public.shared_company_date_formats where organization_id=p_organization_id and tenant_id=v_tenant and company_id=v_source.id for share; if not found then raise exception 'COMPANY_CONFIGURATION_SOURCE_SETTINGS_ABSENT'; end if; if v_source_date.format_version<>p_expected_source_date_format_version then raise exception 'COMPANY_CONFIGURATION_COPY_VERSION_CONFLICT'; end if; end if;
  if p_sections ? 'monetary_policy' then select * into v_source_policy from public.shared_company_monetary_policies where organization_id=p_organization_id and tenant_id=v_tenant and company_id=v_source.id for share; if not found then raise exception 'COMPANY_CONFIGURATION_SOURCE_SETTINGS_ABSENT'; end if; if v_source_policy.policy_version<>p_expected_source_monetary_policy_version then raise exception 'COMPANY_CONFIGURATION_COPY_VERSION_CONFLICT'; end if; end if;
  v_profile:=case when p_sections ? 'operating_profile' then v_source.operating_profile else 'standard' end;
  v_created_json:=public.create_native_company_with_person_nature(p_actor_user_id,p_organization_id,'copy-create:'||encode(extensions.digest(v_request.id::text,'sha256'),'hex'),p_target->>'legalName',p_target->>'tradeName',p_target->>'taxId',p_target->>'country',v_profile,p_target->>'personNature');
  select * into v_created from public.shared_companies where organization_id=p_organization_id and tenant_id=v_tenant and id=v_created_json->>'id' for update;
  v_key:='company-copy:'||v_request.id::text;
  if p_sections ? 'date_format' then perform public.configure_native_company_date_format(p_actor_user_id,p_organization_id,v_created.id,0,v_key||':date','Copied from company '||v_source.id,v_source_date.date_order); end if;
  if p_sections ? 'monetary_policy' then perform public.configure_native_company_monetary_policy(p_actor_user_id,p_organization_id,v_created.id,0,v_key||':policy','Copied from company '||v_source.id,jsonb_build_object('operatingCurrency',jsonb_build_object('code','VES','minorUnit',2),'referenceCurrencyCodes',to_jsonb(v_source_policy.reference_currency_codes),'rateSource','bcv','roundingProfile','commercial_v1','allowPreviousAvailableDate',false,'maxPreviousDays',0)); end if;
  v_result:=public.company_configuration_copy_result(v_created,p_sections);
  update public.shared_company_configuration_copy_requests set result=v_result where id=v_request.id;
  insert into public.shared_company_configuration_copy_events(organization_id,tenant_id,actor_user_id,source_company_id,destination_company_id,action,copied_sections,request_id) values(p_organization_id,v_tenant,p_actor_user_id,v_source.id,v_created.id,'created_from_existing',p_sections,v_request.id);
  return v_result;
end;
$$;

revoke all on function public.prevent_company_configuration_copy_event_update(),public.company_configuration_copy_sections_valid(jsonb),public.company_configuration_copy_result(public.shared_companies,jsonb),public.copy_native_company_configuration(uuid,uuid,text,integer,text,integer,integer,integer,integer,integer,text,jsonb),public.create_native_company_from_existing(uuid,uuid,text,integer,integer,integer,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.copy_native_company_configuration(uuid,uuid,text,integer,text,integer,integer,integer,integer,integer,text,jsonb),public.create_native_company_from_existing(uuid,uuid,text,integer,integer,integer,text,jsonb,jsonb) to service_role;
