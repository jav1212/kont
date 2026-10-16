-- ADM-036: read-only checks against confirmed payroll runs.
begin;

do $smoke$
declare
  fixture record;
  result jsonb;
  expected_difference numeric;
  tested_balanced boolean := false;
  tested_unbalanced boolean := false;
begin
  for fixture in
    select o.id as organization_id, m.user_id as actor_id,
      c.id as company_id, c.tenant_id, r.id as run_id, r.period_end,
      r.confirmed_at, count(x.id)::integer as receipt_count,
      sum(x.total_earnings+x.total_bonuses) as gross,
      sum(x.total_deductions) as deductions,
      sum(x.net_pay) as net
    from public.organizations o
    join public.organization_memberships m
      on m.organization_id=o.id and m.status='active'
    join public.organization_roles role
      on role.id=m.role_id and role.organization_id=o.id and role.status='active'
    join public.shared_companies c
      on c.organization_id=o.id and c.status='active'
    join public.shared_payroll_runs r
      on r.tenant_id=c.tenant_id and r.company_id=c.id
        and r.status='confirmed'
    join public.shared_payroll_receipts x
      on x.tenant_id=r.tenant_id and x.run_id=r.id and x.company_id=c.id
    where o.status='active'
      and exists (select 1 from public.organization_role_permissions p
        where p.role_id=role.id and p.permission_code='payroll.read')
      and exists (select 1 from public.organization_role_permissions p
        where p.role_id=role.id and p.permission_code='accounting.read')
    group by o.id,m.user_id,c.id,c.tenant_id,r.id,r.period_end,r.confirmed_at
    order by abs(sum(x.net_pay)+sum(x.total_deductions)
      -sum(x.total_earnings+x.total_bonuses)) desc,r.id
  loop
    expected_difference := fixture.net+fixture.deductions-fixture.gross;
    if expected_difference=0 and tested_balanced then continue; end if;
    if expected_difference<>0 and tested_unbalanced then continue; end if;

    result := public.get_native_payroll_accounting_snapshot(
      fixture.actor_id,fixture.organization_id,fixture.company_id,fixture.run_id);
    if result->>'tenantId' <> fixture.tenant_id::text
      or result->>'organizationId' <> fixture.organization_id::text
      or result->>'companyId' <> fixture.company_id
      or result->>'runId' <> fixture.run_id
      or (result->>'sourceVersion')::integer <> 1
      or (result->>'effectiveDate')::date <> fixture.period_end
      or (result->>'confirmedAt')::timestamptz <> fixture.confirmed_at
      or (result->>'receiptCount')::integer <> fixture.receipt_count
      or (result->>'grossEarnings')::numeric <> fixture.gross
      or (result->>'employeeDeductions')::numeric <> fixture.deductions
      or (result->>'netPay')::numeric <> fixture.net
      or (result->>'roundingDifference')::numeric <> expected_difference
      or result->'employerContributions' <> 'null'::jsonb
    then
      raise exception 'Payroll accounting snapshot mismatch';
    end if;

    if expected_difference=0 then
      tested_balanced := true;
    else
      tested_unbalanced := true;
    end if;
    exit when tested_balanced and tested_unbalanced;
  end loop;
  if not tested_balanced or not tested_unbalanced then
    raise exception 'Balanced and unbalanced authorized payroll fixtures required';
  end if;

  begin
    perform public.get_native_payroll_accounting_snapshot(
      gen_random_uuid(),fixture.organization_id,fixture.company_id,fixture.run_id);
    raise exception 'Expected actor denial';
  exception when others then
    if sqlerrm not like '%ORGANIZATIONAL_USER_ACCESS_DENIED%' then raise; end if;
  end;
  begin
    perform public.get_native_payroll_accounting_snapshot(
      fixture.actor_id,fixture.organization_id,fixture.company_id,'missing-adm036-run');
    raise exception 'Expected missing run rejection';
  exception when others then
    if sqlerrm not like '%PAYROLL_ACCOUNTING_SNAPSHOT_NOT_CONFIRMED%' then raise; end if;
  end;
end;
$smoke$;

do $access$
begin
  if has_function_privilege('anon',
      'public.get_native_payroll_accounting_snapshot(uuid,uuid,text,text)','execute')
    or has_function_privilege('authenticated',
      'public.get_native_payroll_accounting_snapshot(uuid,uuid,text,text)','execute')
    or not has_function_privilege('service_role',
      'public.get_native_payroll_accounting_snapshot(uuid,uuid,text,text)','execute')
  then
    raise exception 'Payroll accounting snapshot access leaked';
  end if;
end;
$access$;

rollback;
