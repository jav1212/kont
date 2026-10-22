-- ADM-035/ADM-036 reversible integration smoke for the authorized development DB.
-- It borrows a real balanced, confirmed run only for read/locking purposes and
-- rolls back every temporary rule, posting, reversal and guard probe.
begin;

do $smoke$
declare
  f record;
  v_rule_id text := 'native-payroll-smoke-rule-340';
  v_operation_key text := 'native-payroll-smoke-post-340';
  v_reversal_key text := 'native-payroll-smoke-reversal-340';
  v_snapshot jsonb;
  v_rule_set jsonb;
  v_plan jsonb;
  v_post jsonb;
  v_replay jsonb;
  v_reversal jsonb;
  v_reversal_plan jsonb;
  v_reversal_replay jsonb;
  v_before_entries bigint;
  v_before_lines bigint;
  v_before_logs bigint;
  v_after_entries bigint;
  v_after_lines bigint;
  v_after_logs bigint;
  v_receipt_id text;
  v_temp_run_id text := 'native-payroll-smoke-run-340';
  v_temp_entry_id text := 'native-payroll-smoke-entry-340';
begin
  select o.id as organization_id, m.user_id as actor_id, c.tenant_id,
    c.id as company_id, r.id as run_id, debit.id as debit_account_id,
    credit.id as credit_account_id
  into f
  from public.organizations o
  join public.organization_memberships m
    on m.organization_id=o.id and m.status='active'
  join public.organization_roles role
    on role.id=m.role_id and role.organization_id=o.id and role.status='active'
  join public.shared_companies c
    on c.organization_id=o.id and c.status='active'
  join public.shared_payroll_runs r
    on r.tenant_id=c.tenant_id and r.company_id=c.id and r.status='confirmed'
  join public.shared_payroll_receipts receipt
    on receipt.tenant_id=r.tenant_id and receipt.run_id=r.id and receipt.company_id=c.id
  cross join lateral (
    select a.id from public.shared_accounting_accounts a
    where a.tenant_id=c.tenant_id and a.company_id=c.id
      and a.is_active and not a.is_group
    order by a.id limit 1
  ) debit
  cross join lateral (
    select a.id from public.shared_accounting_accounts a
    where a.tenant_id=c.tenant_id and a.company_id=c.id
      and a.is_active and not a.is_group and a.id<>debit.id
    order by a.id limit 1
  ) credit
  where o.status='active'
    and exists (select 1 from public.organization_role_permissions p
      where p.role_id=role.id and p.permission_code='payroll.read')
    and exists (select 1 from public.organization_role_permissions p
      where p.role_id=role.id and p.permission_code='accounting.read')
    and exists (select 1 from public.organization_role_permissions p
      where p.role_id=role.id and p.permission_code='accounting.post')
    and exists (select 1 from public.shared_accounting_periods period
      where period.tenant_id=c.tenant_id and period.company_id=c.id
        and period.status='open' and r.period_end between period.start_date and period.end_date)
  group by o.id,m.user_id,c.tenant_id,c.id,r.id,debit.id,credit.id
  having sum(receipt.net_pay)+sum(receipt.total_deductions)
    =sum(receipt.total_earnings+receipt.total_bonuses)
  order by r.id
  limit 1;
  if not found then
    raise exception 'Native payroll accounting smoke requires an authorized balanced run, open period and two leaf accounts';
  end if;

  select count(*) into v_before_entries from public.shared_accounting_entries;
  select count(*) into v_before_lines from public.shared_accounting_entry_lines;
  select count(*) into v_before_logs from public.shared_accounting_integration_log;

  insert into public.shared_accounting_integration_rules(
    tenant_id,id,company_id,source,debit_account_id,credit_account_id,
    amount_field,description,is_active,created_at,updated_at
  ) values (
    f.tenant_id,v_rule_id,f.company_id,'payroll',f.debit_account_id,f.credit_account_id,
    'gross_earnings','Rollback-only ADM-035/036 smoke',true,clock_timestamp(),clock_timestamp()
  );
  v_snapshot:=public.get_native_payroll_accounting_snapshot(
    f.actor_id,f.organization_id,f.company_id,f.run_id);
  v_rule_set:=public.get_native_payroll_accounting_rule_set(
    f.actor_id,f.organization_id,f.company_id);
  v_plan:=jsonb_build_object(
    'tenantId',f.tenant_id::text,'organizationId',f.organization_id::text,
    'companyId',f.company_id,'source','payroll.run_confirmed','sourceId',f.run_id,
    'sourceVersion',1,'effectiveDate',v_snapshot->>'effectiveDate',
    'occurredAt',v_snapshot->>'confirmedAt',
    'operationKey','16:accounting-event|21:payroll.run_confirmed|'
      ||length(f.tenant_id::text)::text||':'||f.tenant_id::text||'|'
      ||length(f.organization_id::text)::text||':'||f.organization_id::text||'|'
      ||length(f.company_id)::text||':'||f.company_id||'|'
      ||length(f.run_id)::text||':'||f.run_id||'|1:1',
    'ruleSetVersion',v_rule_set->>'version','description','Payroll run '||f.run_id,
    'lines',(select jsonb_agg(y.line order by y.line->>'ruleId',
      case y.line->>'side' when 'debit' then 0 else 1 end,y.line->>'accountId')
      from jsonb_array_elements(v_rule_set->'rules') x
      cross join lateral (values
        (jsonb_build_object('accountId',x->>'debitAccountId','side','debit',
          'amount',(v_snapshot->>'grossEarnings')::numeric(14,2)::text,
          'ruleId',x->>'id','ruleVersion',x->>'version')),
        (jsonb_build_object('accountId',x->>'creditAccountId','side','credit',
          'amount',(v_snapshot->>'grossEarnings')::numeric(14,2)::text,
          'ruleId',x->>'id','ruleVersion',x->>'version'))
      ) y(line))
  );
  begin
    perform public.post_native_payroll_accounting_integration(
      gen_random_uuid(),f.organization_id,f.company_id,v_plan);
    raise exception 'Expected unauthorized actor denial';
  exception when others then
    if sqlerrm not like '%ORGANIZATIONAL_USER_ACCESS_DENIED%' then raise; end if;
  end;
  begin
    perform public.post_native_payroll_accounting_integration(
      f.actor_id,f.organization_id,f.company_id,
      jsonb_set(v_plan,'{ruleSetVersion}','"stale-rule-set"'::jsonb));
    raise exception 'Expected rule-set revision conflict';
  exception when others then
    if sqlerrm not like '%NATIVE_PAYROLL_ACCOUNTING_RULESET_CHANGED%' then raise; end if;
  end;
  begin
    update public.shared_accounting_periods set status='closed'
    where tenant_id=f.tenant_id and company_id=f.company_id and status='open'
      and (v_snapshot->>'effectiveDate')::date between start_date and end_date;
    perform public.post_native_payroll_accounting_integration(
      f.actor_id,f.organization_id,f.company_id,v_plan);
    raise exception 'Expected closed-period rejection';
  exception when others then
    if sqlerrm not like '%NATIVE_PAYROLL_ACCOUNTING_PERIOD_CLOSED%' then raise; end if;
  end;
  v_post:=public.post_native_payroll_accounting_integration(
    f.actor_id,f.organization_id,f.company_id,v_plan);
  v_replay:=public.post_native_payroll_accounting_integration(
    f.actor_id,f.organization_id,f.company_id,v_plan);
  if v_post->>'replayed'<>'false' or v_replay->>'replayed'<>'true'
    or v_post->>'journalEntryId' is distinct from v_replay->>'journalEntryId' then
    raise exception 'Native payroll posting replay contract failed';
  end if;
  update public.shared_accounting_integration_rules
  set updated_at=clock_timestamp()
  where tenant_id=f.tenant_id and id=v_rule_id;
  if (public.post_native_payroll_accounting_integration(
    f.actor_id,f.organization_id,f.company_id,v_plan))->>'replayed'<>'true' then
    raise exception 'Exact replay changed after a later rule revision';
  end if;
  begin
    perform public.post_native_payroll_accounting_integration(
      f.actor_id,f.organization_id,f.company_id,
      jsonb_set(v_plan,'{lines,0,amount}','"999.99"'::jsonb));
    raise exception 'Expected source idempotency conflict';
  exception when others then
    if sqlerrm not like '%NATIVE_PAYROLL_ACCOUNTING_IDEMPOTENCY_CONFLICT%' then raise; end if;
  end;
  begin
    update public.shared_payroll_runs set status=status
    where tenant_id=f.tenant_id and id=f.run_id;
    raise exception 'Expected source mutation guard';
  exception when others then
    if sqlerrm not like '%NATIVE_PAYROLL_ACCOUNTING_SOURCE_REQUIRES_REVERSAL%' then raise; end if;
  end;
  begin
    update public.shared_accounting_entries set description=description
    where tenant_id=f.tenant_id and id=v_post->>'journalEntryId';
    raise exception 'Expected journal mutation guard';
  exception when others then
    if sqlerrm not like '%NATIVE_PAYROLL_ACCOUNTING_JOURNAL_IMMUTABLE%' then raise; end if;
  end;
  insert into public.shared_payroll_runs(
    tenant_id,id,company_id,period_start,period_end,exchange_rate,status,confirmed_at,created_at
  ) select tenant_id,v_temp_run_id,company_id,period_start,period_end,exchange_rate,
    'draft',confirmed_at,clock_timestamp()
  from public.shared_payroll_runs where tenant_id=f.tenant_id and id=f.run_id;
  select id into v_receipt_id from public.shared_payroll_receipts
  where tenant_id=f.tenant_id and run_id=f.run_id order by id limit 1;
  begin
    update public.shared_payroll_receipts set run_id=v_temp_run_id
    where tenant_id=f.tenant_id and id=v_receipt_id;
    raise exception 'Expected receipt move guard';
  exception when others then
    if sqlerrm not like '%NATIVE_PAYROLL_ACCOUNTING_SOURCE_REQUIRES_REVERSAL%' then raise; end if;
  end;
  begin
    insert into public.shared_payroll_receipts(
      tenant_id,id,run_id,company_id,employee_id,employee_cedula,employee_nombre,employee_cargo,
      monthly_salary,total_earnings,total_deductions,total_bonuses,net_pay,calculation_data,created_at
    ) select tenant_id,'native-payroll-smoke-receipt-340',run_id,company_id,employee_id,
      employee_cedula,employee_nombre,employee_cargo,monthly_salary,total_earnings,
      total_deductions,total_bonuses,net_pay,calculation_data,clock_timestamp()
    from public.shared_payroll_receipts where tenant_id=f.tenant_id and id=v_receipt_id;
    raise exception 'Expected receipt insert guard';
  exception when others then
    if sqlerrm not like '%NATIVE_PAYROLL_ACCOUNTING_SOURCE_REQUIRES_REVERSAL%' then raise; end if;
  end;
  insert into public.shared_accounting_entries(
    tenant_id,id,company_id,period_id,entry_number,entry_date,description,status,source,source_ref,
    posted_at,created_at,updated_at
  ) select tenant_id,v_temp_entry_id,company_id,period_id,entry_number+1000000,entry_date,
    'Rollback-only unlinked journal','draft','manual',null,null,clock_timestamp(),clock_timestamp()
  from public.shared_accounting_entries
  where tenant_id=f.tenant_id and id=v_post->>'journalEntryId';
  begin
    update public.shared_accounting_entry_lines set entry_id=v_temp_entry_id
    where tenant_id=f.tenant_id and id=(
      select id from public.shared_accounting_entry_lines
      where tenant_id=f.tenant_id and entry_id=v_post->>'journalEntryId'
      order by id limit 1
    );
    raise exception 'Expected journal line move guard';
  exception when others then
    if sqlerrm not like '%NATIVE_PAYROLL_ACCOUNTING_JOURNAL_IMMUTABLE%' then raise; end if;
  end;
  begin
    insert into public.shared_accounting_entry_lines(
      tenant_id,id,entry_id,account_id,type,amount,description
    ) select tenant_id,'native-payroll-smoke-line-340',entry_id,account_id,type,amount,
      'Rollback-only linked line probe'
    from public.shared_accounting_entry_lines
    where tenant_id=f.tenant_id and id=(
      select id from public.shared_accounting_entry_lines
      where tenant_id=f.tenant_id and entry_id=v_post->>'journalEntryId' order by id limit 1
    );
    raise exception 'Expected journal line insert guard';
  exception when others then
    if sqlerrm not like '%NATIVE_PAYROLL_ACCOUNTING_JOURNAL_IMMUTABLE%' then raise; end if;
  end;
  delete from public.shared_accounting_entries
  where tenant_id=f.tenant_id and id=v_temp_entry_id;
  v_reversal_plan:=jsonb_build_object(
      'tenantId',f.tenant_id::text,'organizationId',f.organization_id::text,
      'companyId',f.company_id,'source','payroll.run_confirmed','sourceId',f.run_id,
      'sourceVersion',1,'operationKey',(v_plan->>'operationKey')||':reversal',
      'originalOperationKey',v_plan->>'operationKey','effectiveDate',v_snapshot->>'effectiveDate',
      'occurredAt',v_snapshot->>'confirmedAt','reason','Rollback-only reversal',
      'lines',(select jsonb_agg(jsonb_build_object('accountId',x->>'accountId',
        'side',case x->>'side' when 'debit' then 'credit' else 'debit' end,
        'amount',x->>'amount','ruleId',x->>'ruleId','ruleVersion',x->>'ruleVersion') order by ord)
        from jsonb_array_elements(v_plan->'lines') with ordinality e(x,ord)));
  v_reversal:=public.reverse_native_payroll_accounting_integration(
    f.actor_id,f.organization_id,f.company_id,v_reversal_plan);
  if v_reversal->>'replayed'<>'false' then raise exception 'Native payroll reversal was not created'; end if;
  v_reversal_replay:=public.reverse_native_payroll_accounting_integration(
    f.actor_id,f.organization_id,f.company_id,v_reversal_plan);
  if v_reversal_replay->>'replayed'<>'true' then
    raise exception 'Native payroll reversal replay contract failed';
  end if;
  update public.shared_payroll_runs set status=status
  where tenant_id=f.tenant_id and id=f.run_id;

  select count(*) into v_after_entries from public.shared_accounting_entries;
  select count(*) into v_after_lines from public.shared_accounting_entry_lines;
  select count(*) into v_after_logs from public.shared_accounting_integration_log;
  if v_after_entries<>v_before_entries+2 or v_after_lines<>v_before_lines+4
    or v_after_logs<>v_before_logs+2 then
    raise exception 'Native payroll accounting write cardinality mismatch';
  end if;
end;
$smoke$;

do $access$
begin
  if has_table_privilege('authenticated','public.shared_native_payroll_accounting_posts','select')
    or has_function_privilege('anon','public.get_native_payroll_accounting_rule_set(uuid,uuid,text)','execute')
    or has_function_privilege('authenticated','public.post_native_payroll_accounting_integration(uuid,uuid,text,jsonb)','execute')
    or not has_function_privilege('service_role','public.post_native_payroll_accounting_integration(uuid,uuid,text,jsonb)','execute')
  then raise exception 'Native payroll accounting ACL leaked'; end if;
end;
$access$;

rollback;

-- This private table is newly introduced by the migration. A successful
-- rollback leaves it empty in the current development baseline.
select count(*) as residual_native_payroll_accounting_smoke_rows
from public.shared_native_payroll_accounting_posts;
