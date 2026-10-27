-- Evaluate the authenticated user id once per statement in the retained
-- member-scoped read policies; this avoids a per-row auth.uid() evaluation.
do $$
declare
 v_table text;
 v_policy text;
begin
 foreach v_table in array array[
  'shared_accounting_charts',
  'shared_accounting_accounts',
  'shared_accounting_periods',
  'shared_accounting_entries',
  'shared_accounting_entry_lines',
  'shared_accounting_integration_rules',
  'shared_accounting_integration_log'
 ] loop
  v_policy := v_table || '_member_access';
  execute format('drop policy if exists %I on public.%I', v_policy, v_table);
  execute format(
   'create policy %I on public.%I for select to authenticated using (exists (select 1 from public.tenant_memberships m where m.tenant_id = %I.tenant_id and m.member_id = (select auth.uid()) and m.accepted_at is not null and m.revoked_at is null))',
   v_policy, v_table, v_table
  );
 end loop;
end;
$$;
