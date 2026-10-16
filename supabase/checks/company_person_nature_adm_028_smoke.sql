-- Reversible ADM-028 creation, versioning, audit and idempotency check.
begin;
set local role service_role;

do $smoke$
declare
  fixture record;
  request_key text := 'adm028-smoke-' || replace(gen_random_uuid()::text, '-', '');
  first_result jsonb;
  replay_result jsonb;
  updated_result jsonb;
  stale_result jsonb;
begin
  select o.id as organization_id, m.user_id as actor_user_id
    into fixture
    from public.organizations o
    join public.organization_memberships m on m.organization_id = o.id and m.status = 'active'
    join public.organization_roles r on r.id = m.role_id and r.organization_id = m.organization_id and r.status = 'active'
    join public.organization_role_permissions createp on createp.role_id = r.id and createp.permission_code = 'companies.create'
    join public.organization_role_permissions updatep on updatep.role_id = r.id and updatep.permission_code = 'companies.update'
   where o.status = 'active'
   limit 1;
  if not found then raise exception 'No authorized development fixture is available'; end if;

  first_result := public.create_native_company_with_person_nature(
    fixture.actor_user_id, fixture.organization_id, request_key,
    'ADM028 Smoke ' || request_key, null, null, 'VE', 'standard', 'natural'
  );
  if first_result->>'person_nature' <> 'natural' or first_result->>'version' <> '1' then
    raise exception 'Explicit person-nature creation check failed';
  end if;
  replay_result := public.create_native_company_with_person_nature(
    fixture.actor_user_id, fixture.organization_id, request_key,
    'ADM028 Smoke ' || request_key, null, null, 'VE', 'standard', 'natural'
  );
  if replay_result is distinct from first_result then raise exception 'Creation idempotency check failed'; end if;

  updated_result := public.set_native_company_person_nature(
    fixture.actor_user_id, fixture.organization_id, first_result->>'id', 1, 'juridical'
  );
  if updated_result->>'person_nature' <> 'juridical' or updated_result->>'version' <> '2' then
    raise exception 'Person-nature update check failed';
  end if;
  stale_result := public.set_native_company_person_nature(
    fixture.actor_user_id, fixture.organization_id, first_result->>'id', 1, 'juridical'
  );
  if stale_result is distinct from updated_result then raise exception 'Idempotent nature retry check failed'; end if;

  begin
    perform public.set_native_company_person_nature(
      fixture.actor_user_id, fixture.organization_id, first_result->>'id', 1, 'natural'
    );
    raise exception 'Expected a stale nature change to be rejected';
  exception when others then
    if sqlerrm not like '%COMPANY_VERSION_CONFLICT%' then raise; end if;
  end;

  perform set_config('kontave.adm028_company_id', first_result->>'id', true);
end
$smoke$;

reset role;

do $audit_check$
declare event_count integer;
begin
  select count(*) into event_count from public.shared_company_administration_events
  where company_id = current_setting('kontave.adm028_company_id');
  if event_count <> 2 then raise exception 'Person-nature audit check failed'; end if;
end
$audit_check$;

rollback;
