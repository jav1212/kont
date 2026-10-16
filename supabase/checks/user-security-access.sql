-- Disposable database acceptance checks for migration 291. Run only against a
-- locally provisioned test database with fixtures for organizations, roles,
-- memberships, auth.users and shared_companies; never point this script at a
-- production project.
do $$
begin
  if not exists(select 1 from pg_proc where proname='assert_user_security_access') then
    raise exception 'migration 291 did not install assert_user_security_access';
  end if;
  if not exists(select 1 from pg_proc where proname='organization_scoped_grant_has') then
    raise exception 'migration 291 did not install scoped grant enforcement';
  end if;
  if exists(select 1 from information_schema.role_routine_grants where routine_schema='public' and routine_name in ('assert_user_security_access','organization_user_security_json') and grantee in ('anon','authenticated','PUBLIC')) then
    raise exception 'internal user-security functions have unsafe execute grants';
  end if;
end $$;
