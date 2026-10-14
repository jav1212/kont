-- ADM-025: reversible fiscal-profile RPC, permission, version and audit checks.
begin;
set local role service_role;

do $smoke$
declare
  fixture record;
  fixture_key text := 'adm025-' || replace(gen_random_uuid()::text,'-','');
  company jsonb;
  initial jsonb;
  configured jsonb;
  replay jsonb;
  cleared jsonb;
begin
  select o.id as organization_id,m.user_id as actor_user_id into fixture
  from public.organizations o
  join public.organization_memberships m on m.organization_id=o.id and m.status='active'
  join public.organization_roles r on r.id=m.role_id and r.organization_id=o.id and r.status='active'
  where o.status='active' and exists(select 1 from public.organization_role_permissions p
    where p.role_id=r.id and p.permission_code='companies.create')
    and exists(select 1 from public.organization_role_permissions p
    where p.role_id=r.id and p.permission_code='companies.read')
    and exists(select 1 from public.organization_role_permissions p
    where p.role_id=r.id and p.permission_code='companies.update')
  limit 1;
  if not found then raise exception 'No ADM-025 development fixture is available'; end if;

  company := public.create_native_company_with_person_nature(
    fixture.actor_user_id,fixture.organization_id,fixture_key,
    'ADM025 Smoke '||fixture_key,null,null,'VE','standard','juridical');
  initial := public.get_native_company_fiscal_profile(
    fixture.actor_user_id,fixture.organization_id,company->>'id');
  if initial->>'legalName' <> 'ADM025 Smoke '||fixture_key
    or initial->>'personNature' <> 'juridical'
    or initial->>'taxpayerType' <> 'ordinario'
    or initial->>'companyVersion' <> '1'
    or initial->>'fiscalAddress' is not null
  then raise exception 'Initial fiscal profile mismatch'; end if;

  configured := public.configure_native_company_fiscal_profile(
    fixture.actor_user_id,fixture.organization_id,company->>'id',1,
    fixture_key||'-set','Verified fiscal contact','Av. Ejemplo 123','especial');
  if configured->>'fiscalAddress' <> 'Av. Ejemplo 123'
    or configured->>'taxpayerType' <> 'especial'
    or configured->>'companyVersion' <> '2'
    or configured->>'taxId' is not null
  then raise exception 'Configured fiscal profile mismatch'; end if;
  if public.get_native_company_fiscal_profile(
    fixture.actor_user_id,fixture.organization_id,company->>'id') is distinct from configured
  then raise exception 'Fiscal profile read-after-write mismatch'; end if;

  replay := public.configure_native_company_fiscal_profile(
    fixture.actor_user_id,fixture.organization_id,company->>'id',1,
    fixture_key||'-set','Verified fiscal contact','Av. Ejemplo 123','especial');
  if replay is distinct from configured then raise exception 'Idempotent replay mismatch'; end if;

  begin
    perform public.configure_native_company_fiscal_profile(
      fixture.actor_user_id,fixture.organization_id,company->>'id',1,
      fixture_key||'-set','Verified fiscal contact','Different address','especial');
    raise exception 'Expected idempotency conflict';
  exception when others then
    if sqlerrm not like '%COMPANY_FISCAL_PROFILE_IDEMPOTENCY_CONFLICT%' then raise; end if;
  end;
  begin
    perform public.configure_native_company_fiscal_profile(
      fixture.actor_user_id,fixture.organization_id,company->>'id',1,
      fixture_key||'-stale','Stale attempt','Different address','ordinario');
    raise exception 'Expected version conflict';
  exception when others then
    if sqlerrm not like '%COMPANY_VERSION_CONFLICT%' then raise; end if;
  end;
  begin
    perform public.configure_native_company_fiscal_profile(
      fixture.actor_user_id,fixture.organization_id,company->>'id',2,
      fixture_key||'-invalid','Invalid address','','ordinario');
    raise exception 'Expected address rejection';
  exception when others then
    if sqlerrm not like '%COMPANY_FISCAL_PROFILE_INVALID%' then raise; end if;
  end;
  begin
    perform public.get_native_company_fiscal_profile(
      gen_random_uuid(),fixture.organization_id,company->>'id');
    raise exception 'Expected read denial';
  exception when others then
    if sqlerrm not like '%COMPANY_ACCESS_DENIED%' then raise; end if;
  end;
  cleared := public.configure_native_company_fiscal_profile(
    fixture.actor_user_id,fixture.organization_id,company->>'id',2,
    fixture_key||'-clear','Fiscal address removed',null,'ordinario');
  if cleared->>'fiscalAddress' is not null
    or cleared->>'taxpayerType'<>'ordinario'
    or cleared->>'companyVersion'<>'3'
  then raise exception 'Fiscal address clearing mismatch'; end if;
  perform set_config('kontave.adm025_company_id',company->>'id',true);
  perform set_config('kontave.adm025_org_id',fixture.organization_id::text,true);
end;
$smoke$;

reset role;
do $audit$
declare v_event public.shared_company_fiscal_profile_events%rowtype;
begin
  select * into v_event from public.shared_company_fiscal_profile_events
   where organization_id=current_setting('kontave.adm025_org_id')::uuid
     and company_id=current_setting('kontave.adm025_company_id') and version=2;
  if not found or v_event.previous_version<>1 or v_event.version<>2
    or v_event.previous_fiscal_address is not null
    or v_event.fiscal_address<>'Av. Ejemplo 123'
    or v_event.previous_taxpayer_type<>'ordinario'
    or v_event.taxpayer_type<>'especial'
    or (select count(*) from public.shared_company_fiscal_profile_events
      where company_id=v_event.company_id)<>2
    or not exists(select 1 from public.shared_company_fiscal_profile_events e
      where e.company_id=v_event.company_id and e.version=3
        and e.previous_fiscal_address='Av. Ejemplo 123'
        and e.fiscal_address is null and e.previous_taxpayer_type='especial'
        and e.taxpayer_type='ordinario')
  then raise exception 'Fiscal profile audit mismatch'; end if;
  begin
    update public.shared_company_fiscal_profile_events set reason='rewritten' where id=v_event.id;
    raise exception 'Expected immutable event';
  exception when others then
    if sqlerrm not like '%COMPANY_FISCAL_PROFILE_IMMUTABLE%' then raise; end if;
  end;
end;
$audit$;

rollback;
