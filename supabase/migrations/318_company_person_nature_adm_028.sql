-- ADM-028: preserve civil-law person nature independently from tax status.
-- Existing rows remain NULL until an authorized user verifies the classification.

alter table public.shared_companies
  add column if not exists person_nature text;

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.shared_companies'::regclass
      and conname = 'shared_companies_person_nature_check'
  ) then
    alter table public.shared_companies
      add constraint shared_companies_person_nature_check
      check (person_nature is null or person_nature in ('natural', 'juridical'));
  end if;
end
$constraint$;

create or replace function public.company_administration_snapshot(p_company public.shared_companies)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'id', p_company.id,
    'organization_id', p_company.organization_id,
    'name', p_company.name,
    'trade_name', p_company.trade_name,
    'rif', p_company.rif,
    'country', p_company.country,
    'status', p_company.status,
    'operating_profile', p_company.operating_profile,
    'person_nature', p_company.person_nature,
    'version', p_company.version
  );
$$;

create or replace function public.create_native_company_with_person_nature(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_idempotency_key text,
  p_legal_name text,
  p_trade_name text,
  p_tax_id text,
  p_country text,
  p_operating_profile text,
  p_person_nature text
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
    or p_person_nature is null or p_person_nature not in ('natural', 'juridical')
  then raise exception 'COMPANY_INVALID'; end if;
  v_rif := public.company_administration_tax_id(p_tax_id);
  v_intent := jsonb_build_object(
    'actor', p_actor_user_id,
    'legalName', trim(p_legal_name),
    'tradeName', nullif(trim(p_trade_name), ''),
    'taxId', v_rif,
    'country', p_country,
    'operatingProfile', p_operating_profile,
    'personNature', p_person_nature
  );
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
      country, status, operating_profile, person_nature
    ) values (
      v_tenant_id, p_organization_id, gen_random_uuid()::text,
      v_tenant_id::text, trim(p_legal_name), nullif(trim(p_trade_name), ''), v_rif,
      p_country, 'active', p_operating_profile, p_person_nature
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

create or replace function public.set_native_company_person_nature(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_company_id text,
  p_expected_version integer,
  p_person_nature text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant_id uuid;
  v_company public.shared_companies%rowtype;
begin
  v_tenant_id := public.assert_company_administration_access(
    p_organization_id, p_actor_user_id, 'companies.update');
  if p_expected_version is null or p_expected_version < 1
    or p_person_nature is null or p_person_nature not in ('natural', 'juridical')
  then raise exception 'COMPANY_INVALID'; end if;

  select * into v_company from public.shared_companies
  where tenant_id = v_tenant_id and organization_id = p_organization_id and id = p_company_id
  for update;
  if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
  if v_company.status = 'archived' then raise exception 'COMPANY_TRANSITION_INVALID'; end if;
  if v_company.person_nature = p_person_nature then
    return public.company_administration_snapshot(v_company);
  end if;
  if v_company.version <> p_expected_version then raise exception 'COMPANY_VERSION_CONFLICT'; end if;

  update public.shared_companies set person_nature = p_person_nature
  where tenant_id = v_tenant_id and organization_id = p_organization_id and id = p_company_id
    and version = p_expected_version
  returning * into v_company;
  if not found then raise exception 'COMPANY_VERSION_CONFLICT'; end if;
  insert into public.shared_company_administration_events(
    organization_id, company_id, actor_user_id, action, previous_version, version
  ) values (p_organization_id, p_company_id, p_actor_user_id, 'updated',
    p_expected_version, v_company.version);
  return public.company_administration_snapshot(v_company);
end;
$$;

revoke all on function public.create_native_company_with_person_nature(uuid, uuid, text, text, text, text, text, text, text),
  public.set_native_company_person_nature(uuid, uuid, text, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_native_company_with_person_nature(uuid, uuid, text, text, text, text, text, text, text),
  public.set_native_company_person_nature(uuid, uuid, text, integer, text)
  to service_role;
