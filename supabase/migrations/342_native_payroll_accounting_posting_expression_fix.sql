-- Posts a plan produced by the portable planner.  The plan schema is closed:
-- operationKey, tenantId, organizationId, companyId, source, sourceId,
-- sourceVersion, ruleSetVersion, effectiveDate, occurredAt, description and
-- lines [{accountId,side,amount,ruleId,ruleVersion}].  Extra client data is
-- ignored; every accepted field is compared with the locked source and rules.
create or replace function public.post_native_payroll_accounting_integration(
  p_actor_id uuid,
  p_organization_id uuid,
  p_company_id text,
  p_plan jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_post_tenant uuid;
  v_plan_company text := trim(p_company_id);
  v_source_ref text;
  v_operation_key text;
  v_snapshot jsonb;
  v_rule_set jsonb;
  v_expected_lines jsonb;
  v_actual_lines jsonb;
  v_fingerprint text;
  v_request_fingerprint text;
  v_existing public.shared_native_payroll_accounting_posts%rowtype;
  v_period public.shared_accounting_periods%rowtype;
  v_entry_id text;
  v_entry_number integer;
  v_debits numeric;
  v_credits numeric;
  v_line jsonb;
begin
  if p_plan is null or jsonb_typeof(p_plan)<>'object'
    or p_actor_id is null or p_organization_id is null
    or p_company_id is null or length(v_plan_company) not between 1 and 128
  then raise exception 'NATIVE_PAYROLL_ACCOUNTING_PLAN_INVALID'; end if;
  if p_plan->>'source' is distinct from 'payroll.run_confirmed'
    or coalesce((p_plan->>'sourceVersion')::integer,0)<>1
    or nullif(trim(p_plan->>'sourceId'),'') is null
    or length(trim(p_plan->>'sourceId'))>128
    or nullif(trim(p_plan->>'operationKey'),'') is null
    or length(trim(p_plan->>'operationKey'))>240
    or nullif(p_plan->>'ruleSetVersion','') is null
    or jsonb_typeof(p_plan->'lines')<>'array'
  then raise exception 'NATIVE_PAYROLL_ACCOUNTING_PLAN_INVALID'; end if;
  if exists (select 1 from jsonb_object_keys(p_plan) key where key not in (
    'operationKey','tenantId','organizationId','companyId','source','sourceId',
    'sourceVersion','ruleSetVersion','effectiveDate','occurredAt','description','lines'
  )) then raise exception 'NATIVE_PAYROLL_ACCOUNTING_PLAN_INVALID'; end if;
  if nullif(p_plan->>'effectiveDate','') is null
    or nullif(p_plan->>'occurredAt','') is null
    or length(coalesce(p_plan->>'description',''))>1000
  then raise exception 'NATIVE_PAYROLL_ACCOUNTING_PLAN_INVALID'; end if;
  v_source_ref := trim(p_plan->>'sourceId');
  v_operation_key := trim(p_plan->>'operationKey');
  v_tenant := public.assert_user_security_access(
    p_actor_id,p_organization_id,v_plan_company,'payroll.read');
  v_post_tenant := public.assert_user_security_access(
    p_actor_id,p_organization_id,v_plan_company,'accounting.post');
  perform public.assert_user_security_access(
    p_actor_id,p_organization_id,v_plan_company,'accounting.read');
  if v_post_tenant is distinct from v_tenant then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_ACCESS_DENIED';
  end if;
  if p_plan->>'tenantId' is distinct from v_tenant::text
    or p_plan->>'organizationId' is distinct from p_organization_id::text
    or p_plan->>'companyId' is distinct from v_plan_company
    or v_operation_key is distinct from (
      '16:accounting-event|21:payroll.run_confirmed|'
      || length(v_tenant::text)::text || ':' || v_tenant::text || '|'
      || length(p_organization_id::text)::text || ':' || p_organization_id::text || '|'
      || length(v_plan_company)::text || ':' || v_plan_company || '|'
      || length(v_source_ref)::text || ':' || v_source_ref || '|1:1'
    ) or p_plan->>'description' is distinct from 'Payroll run ' || v_source_ref then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_OPERATION_KEY_INVALID';
  end if;

  -- The snapshot takes the run and receipt locks before values are trusted.
  v_snapshot := public.get_native_payroll_accounting_snapshot(
    p_actor_id,p_organization_id,v_plan_company,v_source_ref);
  if (v_snapshot->>'sourceVersion')::integer<>1
    or v_snapshot->>'effectiveDate' is distinct from p_plan->>'effectiveDate'
    or (v_snapshot->>'confirmedAt')::timestamptz
       is distinct from (p_plan->>'occurredAt')::timestamptz
    or (v_snapshot->>'roundingDifference')::numeric<>0
  then raise exception 'NATIVE_PAYROLL_ACCOUNTING_SOURCE_CHANGED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_tenant::text || ':' || v_plan_company || ':' || v_source_ref,0));
  v_request_fingerprint := md5(p_plan::text);
  select * into v_existing from public.shared_native_payroll_accounting_posts p
  where p.tenant_id=v_tenant and p.company_id=v_plan_company
    and (p.operation_key=v_operation_key or (p.payroll_run_id=v_source_ref and p.source_version=1))
  for update;
  if found then
    if v_existing.operation_key=v_operation_key
      and v_existing.request_fingerprint=v_request_fingerprint
      and v_existing.payroll_run_id=v_source_ref then
      return jsonb_build_object('operationKey',v_operation_key,
        'journalEntryId',v_existing.journal_entry_id,'replayed',true);
    end if;
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_IDEMPOTENCY_CONFLICT';
  end if;
  -- The parent lock blocks FK-backed rule/account inserts. Lock inactive rules
  -- too, so activation cannot create a phantom mapping during this posting.
  perform 1 from public.shared_companies c
    where c.tenant_id=v_tenant and c.organization_id=p_organization_id
      and c.id=v_plan_company and c.status='active' for update;
  if not found then raise exception 'NATIVE_PAYROLL_ACCOUNTING_ACCESS_DENIED'; end if;
  -- Lock rows which determine the posting before materializing their revision.
  perform 1 from public.shared_accounting_integration_rules r
    where r.tenant_id=v_tenant and r.company_id=v_plan_company
      and r.source='payroll' for update;
  perform 1 from public.shared_accounting_accounts a
    where a.tenant_id=v_tenant and a.company_id=v_plan_company for share;
  v_rule_set := public.get_native_payroll_accounting_rule_set(
    p_actor_id,p_organization_id,v_plan_company);
  if p_plan->>'ruleSetVersion' is distinct from v_rule_set->>'version'
  then raise exception 'NATIVE_PAYROLL_ACCOUNTING_RULESET_CHANGED'; end if;

  select coalesce(jsonb_agg(x.line order by x.line->>'ruleId',
    case x.line->>'side' when 'debit' then 0 else 1 end,x.line->>'accountId'), '[]'::jsonb)
  into v_expected_lines
  from jsonb_array_elements(v_rule_set->'rules') r
  cross join lateral (values
    (jsonb_build_object('accountId',r->>'debitAccountId','side','debit',
      'amount',(case r->>'amountField' when 'gross_earnings' then v_snapshot->>'grossEarnings'
        when 'employee_deductions' then v_snapshot->>'employeeDeductions' else v_snapshot->>'netPay' end)::numeric(14,2)::text,
      'ruleId',r->>'id','ruleVersion',r->>'version')),
    (jsonb_build_object('accountId',r->>'creditAccountId','side','credit',
      'amount',(case r->>'amountField' when 'gross_earnings' then v_snapshot->>'grossEarnings'
        when 'employee_deductions' then v_snapshot->>'employeeDeductions' else v_snapshot->>'netPay' end)::numeric(14,2)::text,
      'ruleId',r->>'id','ruleVersion',r->>'version'))
  ) x(line)
  where (case r->>'amountField' when 'gross_earnings' then v_snapshot->>'grossEarnings'
    when 'employee_deductions' then v_snapshot->>'employeeDeductions'
    else v_snapshot->>'netPay' end)::numeric<>0;

  if jsonb_array_length(v_expected_lines)=0 then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_ZERO_AMOUNT_RULE';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'accountId',x->>'accountId','side',x->>'side','amount',x->>'amount',
    'ruleId',x->>'ruleId','ruleVersion',x->>'ruleVersion'
  ) order by x->>'ruleId',case x->>'side' when 'debit' then 0 else 1 end,x->>'accountId'),'[]'::jsonb)
  into v_actual_lines from jsonb_array_elements(p_plan->'lines') x;
  if v_actual_lines is distinct from v_expected_lines
    or p_plan->'lines' is distinct from v_expected_lines then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_PLAN_VALUES_UNTRUSTED';
  end if;

  select coalesce(sum((x->>'amount')::numeric) filter(where x->>'side'='debit'),0),
    coalesce(sum((x->>'amount')::numeric) filter(where x->>'side'='credit'),0)
  into v_debits,v_credits from jsonb_array_elements(v_expected_lines) x;
  if v_debits<>v_credits then raise exception 'NATIVE_PAYROLL_ACCOUNTING_UNBALANCED'; end if;

  v_fingerprint := md5(jsonb_build_object(
    'source',p_plan->>'source','sourceId',v_source_ref,
    'sourceVersion',1,'effectiveDate',v_snapshot->>'effectiveDate',
    'occurredAt',v_snapshot->>'confirmedAt','ruleSetVersion',v_rule_set->>'version',
    'lines',v_expected_lines
  )::text);
  select * into v_period from public.shared_accounting_periods p
  where p.tenant_id=v_tenant and p.company_id=v_plan_company and p.status='open'
    and (v_snapshot->>'effectiveDate')::date between p.start_date and p.end_date
  order by p.start_date,p.id limit 1 for update;
  if not found then raise exception 'NATIVE_PAYROLL_ACCOUNTING_PERIOD_CLOSED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_tenant::text || ':' || v_plan_company || ':' || v_period.id,0));
  select coalesce(max(e.entry_number),0)+1 into v_entry_number
  from public.shared_accounting_entries e
  where e.tenant_id=v_tenant and e.company_id=v_plan_company and e.period_id=v_period.id;
  v_entry_id := 'native-payroll-' || encode(extensions.digest(
    v_tenant::text || ':' || v_source_ref || ':1','sha256'),'hex');
  if exists (select 1 from public.shared_accounting_entries e
             where e.tenant_id=v_tenant and e.id=v_entry_id) then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_ENTRY_COLLISION';
  end if;
  insert into public.shared_accounting_entries(
    tenant_id,id,company_id,period_id,entry_number,entry_date,description,
    status,source,source_ref,posted_at,created_at,updated_at
  ) values (
    v_tenant,v_entry_id,v_plan_company,v_period.id,v_entry_number,
    (v_snapshot->>'effectiveDate')::date,p_plan->>'description',
    'posted','payroll',v_source_ref,clock_timestamp(),clock_timestamp(),clock_timestamp());
  for v_line in select value from jsonb_array_elements(v_expected_lines) loop
    insert into public.shared_accounting_entry_lines(
      tenant_id,id,entry_id,account_id,type,amount,description
    ) values (v_tenant,gen_random_uuid()::text,v_entry_id,v_line->>'accountId',
      v_line->>'side',(v_line->>'amount')::numeric,'Payroll rule ' || (v_line->>'ruleId'));
  end loop;
  insert into public.shared_accounting_integration_log(
    tenant_id,id,company_id,source,source_ref,entry_id,status,error_message,created_at
  ) values (v_tenant,gen_random_uuid()::text,v_plan_company,'payroll',v_source_ref,
    v_entry_id,'success',null,clock_timestamp());
  insert into public.shared_native_payroll_accounting_posts(
    tenant_id,organization_id,company_id,payroll_run_id,source_version,
    source_confirmed_at,operation_key,fingerprint,request_fingerprint,plan,journal_entry_id,created_by
  ) values (v_tenant,p_organization_id,v_plan_company,v_source_ref,1,
    (v_snapshot->>'confirmedAt')::timestamptz,v_operation_key,v_fingerprint,v_request_fingerprint,p_plan,
    v_entry_id,p_actor_id);
  return jsonb_build_object('operationKey',v_operation_key,
    'journalEntryId',v_entry_id,'replayed',false);
end;
$$;

-- Reversal is a second posted journal with the original debit/credit sides
-- swapped.  It never deletes historical accounting evidence.
create or replace function public.reverse_native_payroll_accounting_integration(
  p_actor_id uuid,
  p_organization_id uuid,
  p_company_id text,
  p_plan jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_company text := trim(p_company_id);
  v_source_ref text;
  v_operation_key text;
  v_original_operation_key text;
  v_effective_date date;
  v_fingerprint text;
  v_post public.shared_native_payroll_accounting_posts%rowtype;
  v_period public.shared_accounting_periods%rowtype;
  v_entry_id text;
  v_entry_number integer;
  v_expected_lines jsonb;
  v_actual_lines jsonb;
  v_line jsonb;
begin
  if p_plan is null or jsonb_typeof(p_plan)<>'object' or p_actor_id is null
    or p_organization_id is null or p_company_id is null
    or p_plan->>'source' is distinct from 'payroll.run_confirmed'
    or nullif(trim(p_plan->>'sourceId'),'') is null
    or length(trim(p_plan->>'sourceId'))>128
    or nullif(trim(p_plan->>'operationKey'),'') is null
    or nullif(trim(p_plan->>'originalOperationKey'),'') is null
    or coalesce((p_plan->>'sourceVersion')::integer,0)<>1
    or nullif(p_plan->>'effectiveDate','') is null
    or nullif(p_plan->>'occurredAt','') is null
    or nullif(trim(p_plan->>'reason'),'') is null
    or length(trim(p_plan->>'reason'))>500
    or jsonb_typeof(p_plan->'lines')<>'array'
  then raise exception 'NATIVE_PAYROLL_ACCOUNTING_REVERSAL_INVALID'; end if;
  if exists (select 1 from jsonb_object_keys(p_plan) key where key not in (
    'operationKey','originalOperationKey','tenantId','organizationId','companyId',
    'source','sourceId','sourceVersion','effectiveDate','occurredAt','reason','lines'
  )) then raise exception 'NATIVE_PAYROLL_ACCOUNTING_REVERSAL_INVALID'; end if;
  v_source_ref:=trim(p_plan->>'sourceId'); v_operation_key:=trim(p_plan->>'operationKey');
  v_original_operation_key:=trim(p_plan->>'originalOperationKey');
  v_effective_date:=(p_plan->>'effectiveDate')::date;
  perform (p_plan->>'occurredAt')::timestamptz;
  if length(v_operation_key)>240 then raise exception 'NATIVE_PAYROLL_ACCOUNTING_REVERSAL_INVALID'; end if;
  v_tenant:=public.assert_user_security_access(p_actor_id,p_organization_id,v_company,'payroll.read');
  if public.assert_user_security_access(p_actor_id,p_organization_id,v_company,'accounting.post') is distinct from v_tenant then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_ACCESS_DENIED'; end if;
  if p_plan->>'tenantId' is distinct from v_tenant::text
    or p_plan->>'organizationId' is distinct from p_organization_id::text
    or p_plan->>'companyId' is distinct from v_company then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_REVERSAL_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||v_company||':'||v_source_ref,0));
  select * into v_post from public.shared_native_payroll_accounting_posts p
  where p.tenant_id=v_tenant and p.company_id=v_company and p.payroll_run_id=v_source_ref
  for update;
  if not found then raise exception 'NATIVE_PAYROLL_ACCOUNTING_POST_NOT_FOUND'; end if;
  if v_post.operation_key is distinct from v_original_operation_key
    or v_operation_key is distinct from v_original_operation_key || ':reversal' then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_REVERSAL_INVALID'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'accountId',x.value->>'accountId',
    'side',case x.value->>'side' when 'debit' then 'credit' else 'debit' end,
    'amount',x.value->>'amount','ruleId',x.value->>'ruleId',
    'ruleVersion',x.value->>'ruleVersion'
  ) order by x.ordinality),'[]'::jsonb)
  into v_expected_lines
  from jsonb_array_elements(v_post.plan->'lines') with ordinality x(value,ordinality);
  select coalesce(jsonb_agg(jsonb_build_object(
    'accountId',x.value->>'accountId','side',x.value->>'side',
    'amount',x.value->>'amount','ruleId',x.value->>'ruleId',
    'ruleVersion',x.value->>'ruleVersion'
  ) order by x.ordinality),'[]'::jsonb)
  into v_actual_lines
  from jsonb_array_elements(p_plan->'lines') with ordinality x(value,ordinality);
  if p_plan->'lines' is distinct from v_expected_lines
    or v_actual_lines is distinct from v_expected_lines then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_REVERSAL_PLAN_UNTRUSTED'; end if;
  v_fingerprint:=md5(p_plan::text);
  if v_post.reversal_operation_key is not null then
    if v_post.reversal_operation_key=v_operation_key
      and v_post.reversal_fingerprint=v_fingerprint then
      return jsonb_build_object('operationKey',v_operation_key,
        'journalEntryId',v_post.reversal_entry_id,'replayed',true);
    end if;
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_REVERSAL_CONFLICT';
  end if;
  select * into v_period from public.shared_accounting_periods p
  where p.tenant_id=v_tenant and p.company_id=v_company and p.status='open'
    and v_effective_date between p.start_date and p.end_date
  order by p.start_date,p.id limit 1 for update;
  if not found then raise exception 'NATIVE_PAYROLL_ACCOUNTING_PERIOD_CLOSED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||v_company||':'||v_period.id,0));
  select coalesce(max(entry_number),0)+1 into v_entry_number
  from public.shared_accounting_entries
  where tenant_id=v_tenant and company_id=v_company and period_id=v_period.id;
  v_entry_id:='native-payroll-reversal-'||encode(extensions.digest(
    v_tenant::text||':'||v_source_ref||':'||v_operation_key,'sha256'),'hex');
  insert into public.shared_accounting_entries(
    tenant_id,id,company_id,period_id,entry_number,entry_date,description,status,
    source,source_ref,posted_at,created_at,updated_at
  ) values (v_tenant,v_entry_id,v_company,v_period.id,v_entry_number,v_effective_date,
    p_plan->>'reason','posted','payroll',v_source_ref,
    clock_timestamp(),clock_timestamp(),clock_timestamp());
  for v_line in select value from jsonb_array_elements(v_expected_lines) loop
    insert into public.shared_accounting_entry_lines(
      tenant_id,id,entry_id,account_id,type,amount,description
    ) values (v_tenant,gen_random_uuid()::text,v_entry_id,v_line->>'accountId',
      v_line->>'side',(v_line->>'amount')::numeric,'Reversal rule ' || (v_line->>'ruleId'));
  end loop;
  insert into public.shared_accounting_integration_log(
    tenant_id,id,company_id,source,source_ref,entry_id,status,error_message,created_at
  ) values(v_tenant,gen_random_uuid()::text,v_company,'payroll',v_source_ref,
    v_entry_id,'success','reversal',clock_timestamp());
  update public.shared_native_payroll_accounting_posts set
    reversal_operation_key=v_operation_key,reversal_fingerprint=v_fingerprint,
    reversal_entry_id=v_entry_id,reversed_at=clock_timestamp(),updated_at=clock_timestamp()
  where tenant_id=v_tenant and payroll_run_id=v_source_ref and source_version=1;
  return jsonb_build_object('operationKey',v_operation_key,
    'journalEntryId',v_entry_id,'replayed',false);
end;
$$;

revoke all on function public.native_payroll_accounting_rules_json(uuid,text),
  public.get_native_payroll_accounting_rule_set(uuid,uuid,text),
  public.prevent_native_payroll_accounting_source_mutation(),
  public.prevent_native_payroll_accounting_journal_mutation(),
  public.post_native_payroll_accounting_integration(uuid,uuid,text,jsonb),
  public.reverse_native_payroll_accounting_integration(uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.get_native_payroll_accounting_rule_set(uuid,uuid,text),
  public.post_native_payroll_accounting_integration(uuid,uuid,text,jsonb),
  public.reverse_native_payroll_accounting_integration(uuid,uuid,text,jsonb)
  to service_role;
