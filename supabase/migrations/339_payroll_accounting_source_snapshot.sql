-- ADM-036: read an authoritative, confirmed payroll accounting snapshot.
-- This function only reads payroll facts. It never posts a journal or repairs
-- historic cent differences; callers must reject unreconciled amounts.

create function public.get_native_payroll_accounting_snapshot(
  p_actor_id uuid,
  p_organization_id uuid,
  p_company_id text,
  p_run_id text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_tenant uuid;
  v_accounting_tenant uuid;
  v_run public.shared_payroll_runs%rowtype;
  v_receipt_count integer;
  v_gross numeric;
  v_deductions numeric;
  v_net numeric;
begin
  if p_actor_id is null or p_organization_id is null
    or p_company_id is null or length(trim(p_company_id)) not between 1 and 128
    or p_run_id is null or length(trim(p_run_id)) not between 1 and 128
  then
    raise exception 'PAYROLL_ACCOUNTING_SNAPSHOT_INVALID';
  end if;

  v_tenant := public.assert_user_security_access(
    p_actor_id, p_organization_id, trim(p_company_id), 'payroll.read');
  v_accounting_tenant := public.assert_user_security_access(
    p_actor_id, p_organization_id, trim(p_company_id), 'accounting.read');
  if v_tenant is distinct from v_accounting_tenant then
    raise exception 'PAYROLL_ACCOUNTING_SNAPSHOT_ACCESS_DENIED';
  end if;

  if not exists (
    select 1 from public.shared_companies c
    where c.tenant_id=v_tenant and c.organization_id=p_organization_id
      and c.id=trim(p_company_id) and c.status='active'
  ) then
    raise exception 'PAYROLL_ACCOUNTING_SNAPSHOT_ACCESS_DENIED';
  end if;

  -- A row lock prevents a concurrent status change or FK-backed receipt insert
  -- while the already persisted receipt rows are locked and aggregated.
  select * into v_run
  from public.shared_payroll_runs r
  where r.tenant_id=v_tenant and r.company_id=trim(p_company_id)
    and r.id=trim(p_run_id)
  for update;
  if not found or v_run.status<>'confirmed' or v_run.confirmed_at is null then
    raise exception 'PAYROLL_ACCOUNTING_SNAPSHOT_NOT_CONFIRMED';
  end if;

  perform 1 from public.shared_payroll_receipts x
  where x.tenant_id=v_tenant and x.run_id=v_run.id
  for share;
  select count(*)::integer,
    coalesce(sum(x.total_earnings+x.total_bonuses),0),
    coalesce(sum(x.total_deductions),0),
    coalesce(sum(x.net_pay),0)
  into v_receipt_count,v_gross,v_deductions,v_net
  from public.shared_payroll_receipts x
  where x.tenant_id=v_tenant and x.run_id=v_run.id
    and x.company_id=trim(p_company_id);
  if v_receipt_count=0 then
    raise exception 'PAYROLL_ACCOUNTING_SNAPSHOT_EMPTY';
  end if;
  if exists (
    select 1 from public.shared_payroll_receipts x
    where x.tenant_id=v_tenant and x.run_id=v_run.id
      and (x.company_id<>trim(p_company_id) or x.total_earnings<0
        or x.total_bonuses<0 or x.total_deductions<0 or x.net_pay<0)
  ) then
    raise exception 'PAYROLL_ACCOUNTING_SNAPSHOT_INVALID';
  end if;

  return jsonb_build_object(
    'tenantId', v_tenant,
    'organizationId', p_organization_id,
    'companyId', v_run.company_id,
    'runId', v_run.id,
    -- Current Web confirmation inserts a new run ID for each generation.
    -- The later posting RPC must also compare confirmedAt and source totals.
    'sourceVersion', 1,
    'effectiveDate', to_char(v_run.period_end,'YYYY-MM-DD'),
    'confirmedAt', to_char(
      v_run.confirmed_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'receiptCount', v_receipt_count,
    'grossEarnings', v_gross::text,
    'employeeDeductions', v_deductions::text,
    'netPay', v_net::text,
    'roundingDifference', (v_net+v_deductions-v_gross)::text,
    'employerContributions', null
  );
end;
$$;

revoke all on function public.get_native_payroll_accounting_snapshot(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_native_payroll_accounting_snapshot(uuid,uuid,text,text)
  to service_role;
