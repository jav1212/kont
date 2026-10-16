-- Run after migration 293 in a disposable or explicitly authorized database.
-- Verifies the server-owned boundary, CAS conflict signal, and durable evidence.
begin;
do $check$
#variable_conflict use_variable
declare
  organization_id uuid := '00000000-0000-4000-8000-000000000011';
  user_id uuid := '00000000-0000-4000-8000-000000000021';
  policy jsonb;
  state jsonb;
begin
  if has_table_privilege('authenticated', 'public.account_security_policies', 'select')
     or has_table_privilege('anon', 'public.account_security_states', 'update')
     or has_function_privilege('authenticated', 'public.account_security_read_state(uuid,uuid)', 'execute')
     or has_table_privilege('service_role', 'public.account_security_attempts', 'insert') then
    raise exception 'ACCOUNT_SECURITY_PUBLIC_ACCESS';
  end if;
  execute 'set local role service_role';
  policy := public.account_security_get_policy(organization_id);
  if (policy->>'version') <> '1' then raise exception 'ACCOUNT_SECURITY_POLICY_DEFAULT'; end if;
  state := public.account_security_read_state(organization_id, user_id);
  if public.account_security_compare_and_swap(organization_id, user_id, (state->>'version')::integer,
      (state->>'policy_version')::integer,
      (state->>'password_changed_at')::timestamptz, now(), array[now()], null, now(), 'invalid_credentials') is distinct from true then
    raise exception 'ACCOUNT_SECURITY_CAS_COMMIT';
  end if;
  if public.account_security_compare_and_swap(organization_id, user_id, (state->>'version')::integer,
      (state->>'policy_version')::integer,
      (state->>'password_changed_at')::timestamptz, now(), array[now()], null, now(), 'invalid_credentials') is distinct from false then
    raise exception 'ACCOUNT_SECURITY_CAS_CONFLICT';
  end if;
  execute 'reset role';
  if not exists (select 1 from public.account_security_attempts a
      where a.organization_id = organization_id and a.user_id = user_id and a.outcome = 'invalid_credentials') then
    raise exception 'ACCOUNT_SECURITY_EVIDENCE_MISSING';
  end if;
end $check$;
rollback;
