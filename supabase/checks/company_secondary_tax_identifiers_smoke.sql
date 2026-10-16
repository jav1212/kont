-- Reversible ADM-027 RPC check. Run only in development.
-- A random scheme keeps this fixture isolated; no identifier values are returned.
begin;
set local role service_role;

do $smoke$
declare
  fixture record;
  test_scheme text := 'kontave-smoke-' || replace(gen_random_uuid()::text, '-', '');
  first_result jsonb;
  retry_result jsonb;
  listed jsonb;
begin
  select c.organization_id, c.id as company_id, m.user_id as actor_user_id
    into fixture
    from public.shared_companies c
    join public.organization_memberships m on m.organization_id=c.organization_id and m.status='active'
    join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.status='active'
    join public.organization_role_permissions readp on readp.role_id=r.id and readp.permission_code='companies.read'
    join public.organization_role_permissions updatep on updatep.role_id=r.id and updatep.permission_code='companies.update'
   where c.organization_id is not null and c.status='active'
   limit 1;
  if not found then raise exception 'No authorized development fixture is available'; end if;

  first_result := public.set_native_company_secondary_tax_identifier(
    fixture.actor_user_id,fixture.organization_id,fixture.company_id,'VE',test_scheme,'TEST-001',0
  );
  if first_result->>'version' <> '1' then raise exception 'Identifier create check failed'; end if;

  retry_result := public.set_native_company_secondary_tax_identifier(
    fixture.actor_user_id,fixture.organization_id,fixture.company_id,'VE',test_scheme,'TEST-001',0
  );
  if retry_result->>'version' <> '1' then raise exception 'Idempotent retry check failed'; end if;

  begin
    perform public.set_native_company_secondary_tax_identifier(
      fixture.actor_user_id,fixture.organization_id,fixture.company_id,'VE',test_scheme,'OTHER',0
    );
    raise exception 'Expected stale identifier revision to be rejected';
  exception when others then
    if sqlerrm not like '%COMPANY_SECONDARY_TAX_IDENTIFIER_VERSION_CONFLICT%' then raise; end if;
  end;

  listed := public.get_native_company_secondary_tax_identifiers(
    fixture.actor_user_id,fixture.organization_id,fixture.company_id
  );
  if not exists(select 1 from jsonb_array_elements(listed) as entries(value) where entries.value->>'scheme'=test_scheme and entries.value->>'identifier_value'='TEST-001') then
    raise exception 'Identifier read check failed';
  end if;

  if not public.remove_native_company_secondary_tax_identifier(
    fixture.actor_user_id,fixture.organization_id,fixture.company_id,'VE',test_scheme,1
  ) then raise exception 'Identifier removal check failed'; end if;
  if not public.remove_native_company_secondary_tax_identifier(
    fixture.actor_user_id,fixture.organization_id,fixture.company_id,'VE',test_scheme,1
  ) then raise exception 'Idempotent removal check failed'; end if;

  first_result := public.set_native_company_secondary_tax_identifier(
    fixture.actor_user_id,fixture.organization_id,fixture.company_id,'VE',test_scheme,'TEST-002',0
  );
  if first_result->>'version' <> '3' then raise exception 'Identifier reactivation check failed'; end if;
  listed := public.get_native_company_secondary_tax_identifiers(
    fixture.actor_user_id,fixture.organization_id,fixture.company_id
  );
  if not exists(select 1 from jsonb_array_elements(listed) as entries(value) where entries.value->>'scheme'=test_scheme and entries.value->>'identifier_value'='TEST-002') then
    raise exception 'Reactivated identifier read check failed';
  end if;
  perform set_config('kontave.adm027_company_id',fixture.company_id,true);
  perform set_config('kontave.adm027_test_scheme',test_scheme,true);
end
$smoke$;

reset role;

do $audit_check$
declare event_count integer;
begin
  select count(*) into event_count
    from public.shared_company_secondary_tax_identifier_events
   where company_id=current_setting('kontave.adm027_company_id')
     and scheme=current_setting('kontave.adm027_test_scheme');
  if event_count <> 3 then raise exception 'Identifier audit event count check failed'; end if;
end
$audit_check$;

rollback;
