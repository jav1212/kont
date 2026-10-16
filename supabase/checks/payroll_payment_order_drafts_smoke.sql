-- ADM-037: reversible source validation, idempotency, permission and lifecycle checks.
begin;

do $smoke$
declare
  fixture record;
  v_key text := 'adm037-' || replace(gen_random_uuid()::text, '-', '');
  v_created jsonb;
  v_replay jsonb;
  v_cancelled jsonb;
begin
  select o.id as organization_id, m.user_id as actor_id, c.id as company_id,
    c.tenant_id, r.id as receipt_id, r.run_id, r.employee_id, r.net_pay,
    pr.confirmed_at
  into fixture
  from public.organizations o
  join public.organization_memberships m
    on m.organization_id = o.id and m.status = 'active'
  join public.organization_roles role
    on role.id = m.role_id and role.organization_id = o.id and role.status = 'active'
  join public.shared_companies c
    on c.organization_id = o.id and c.status = 'active'
  join public.shared_payroll_runs pr
    on pr.tenant_id = c.tenant_id and pr.company_id = c.id
      and pr.status = 'confirmed'
  join public.shared_payroll_receipts r
    on r.tenant_id = pr.tenant_id and r.run_id = pr.id and r.company_id = c.id
      and r.net_pay > 0
  where o.status = 'active'
    and exists (select 1 from public.organization_role_permissions p
      where p.role_id = role.id and p.permission_code = 'payroll.read')
    and exists (select 1 from public.organization_role_permissions p
      where p.role_id = role.id and p.permission_code = 'payment_orders.create')
    and exists (select 1 from public.organization_role_permissions p
      where p.role_id = role.id and p.permission_code = 'payment_orders.update')
    and exists (select 1 from public.organization_role_permissions p
      where p.role_id = role.id and p.permission_code = 'payment_orders.delete')
    and exists (select 1 from public.organization_role_permissions p
      where p.role_id = role.id and p.permission_code = 'payment_orders.void')
    and not exists (
      select 1 from public.shared_payroll_payment_order_drafts d
      where d.tenant_id = r.tenant_id and d.payroll_receipt_id = r.id
    )
  order by pr.confirmed_at, r.id
  limit 1;
  if not found then
    raise exception 'No ADM-037 development fixture is available';
  end if;

  begin
    perform public.create_payroll_payment_order_draft(
      gen_random_uuid(), fixture.organization_id, fixture.company_id,
      fixture.run_id, fixture.receipt_id, fixture.employee_id, fixture.net_pay,
      fixture.confirmed_at, 'ADM037 beneficiary', v_key || '-denied');
    raise exception 'Expected actor denial';
  exception when others then
    if sqlerrm not like '%ORGANIZATIONAL_USER_ACCESS_DENIED%' then raise; end if;
  end;

  begin
    perform public.create_payroll_payment_order_draft(
      fixture.actor_id, fixture.organization_id, fixture.company_id,
      fixture.run_id, fixture.receipt_id, fixture.employee_id, fixture.net_pay,
      fixture.confirmed_at + interval '1 second', 'ADM037 beneficiary', v_key || '-stale');
    raise exception 'Expected stale confirmation rejection';
  exception when others then
    if sqlerrm not like '%PAYROLL_PAYMENT_ORDER_SOURCE_CHANGED%' then raise; end if;
  end;

  v_created := public.create_payroll_payment_order_draft(
    fixture.actor_id, fixture.organization_id, fixture.company_id,
    fixture.run_id, fixture.receipt_id, fixture.employee_id,
    (fixture.net_pay::text || '00')::numeric,
    fixture.confirmed_at, 'ADM037 beneficiary', v_key);
  if v_created->>'disposition' <> 'created'
    or v_created->'order'->>'currency' <> 'VES'
    or (v_created->'order'->>'amount')::numeric <> fixture.net_pay
    or v_created->'traceability'->>'tenantId' <> fixture.tenant_id::text
    or v_created->'traceability'->>'organizationId' <> fixture.organization_id::text
    or v_created->'traceability'->>'companyId' <> fixture.company_id
    or v_created->'traceability'->>'payrollRunId' <> fixture.run_id
    or v_created->'traceability'->>'payrollReceiptId' <> fixture.receipt_id
    or v_created->'traceability'->>'employeeId' <> fixture.employee_id
    or (v_created->'traceability'->>'payrollConfirmedAt')::timestamptz <> fixture.confirmed_at
  then
    raise exception 'Payment order draft creation mismatch';
  end if;

  v_replay := public.create_payroll_payment_order_draft(
    fixture.actor_id, fixture.organization_id, fixture.company_id,
    fixture.run_id, fixture.receipt_id, fixture.employee_id, fixture.net_pay,
    fixture.confirmed_at, 'ADM037 beneficiary', v_key);
  if v_replay->>'disposition' <> 'replayed'
    or v_replay->'order' is distinct from v_created->'order'
    or v_replay->'traceability' is distinct from v_created->'traceability'
  then
    raise exception 'Payment order draft replay mismatch';
  end if;

  begin
    perform public.create_payroll_payment_order_draft(
      fixture.actor_id, fixture.organization_id, fixture.company_id,
      fixture.run_id, fixture.receipt_id, fixture.employee_id, fixture.net_pay + .01,
      fixture.confirmed_at, 'ADM037 beneficiary', v_key);
    raise exception 'Expected idempotency conflict';
  exception when others then
    if sqlerrm not like '%PAYROLL_PAYMENT_ORDER_IDEMPOTENCY_CONFLICT%' then raise; end if;
  end;

  begin
    update public.shared_payroll_runs
    set confirmed_at = confirmed_at + interval '1 second'
    where tenant_id = fixture.tenant_id and id = fixture.run_id;
    raise exception 'Expected linked payroll run guard';
  exception when others then
    if sqlerrm not like '%PAYROLL_PAYMENT_ORDER_SOURCE_IMMUTABLE%' then raise; end if;
  end;
  begin
    update public.shared_payroll_receipts
    set net_pay = net_pay + .01
    where tenant_id = fixture.tenant_id and id = fixture.receipt_id;
    raise exception 'Expected linked payroll receipt guard';
  exception when others then
    if sqlerrm not like '%PAYROLL_PAYMENT_ORDER_SOURCE_IMMUTABLE%' then raise; end if;
  end;

  begin
    perform public.update_payment_order(
      fixture.actor_id, fixture.organization_id, fixture.company_id,
      v_created->'order'->>'id', 1, 'Altered beneficiary');
    raise exception 'Expected immutable payment order guard';
  exception when others then
    if sqlerrm not like '%PAYROLL_PAYMENT_ORDER_IMMUTABLE%' then raise; end if;
  end;
  begin
    perform public.delete_payment_order(
      fixture.actor_id, fixture.organization_id, fixture.company_id,
      v_created->'order'->>'id', 1);
    raise exception 'Expected linked order deletion guard';
  exception when others then
    if sqlerrm not like '%PAYROLL_PAYMENT_ORDER_IMMUTABLE%' then raise; end if;
  end;

  v_cancelled := public.cancel_payment_order(
    fixture.actor_id, fixture.organization_id, fixture.company_id,
    v_created->'order'->>'id', 1);
  if v_cancelled->>'status' <> 'cancelled' then
    raise exception 'Payment order cancellation mismatch';
  end if;
  begin
    perform public.create_payroll_payment_order_draft(
      fixture.actor_id, fixture.organization_id, fixture.company_id,
      fixture.run_id, fixture.receipt_id, fixture.employee_id, fixture.net_pay,
      fixture.confirmed_at, 'ADM037 beneficiary', v_key);
    raise exception 'Expected cancelled payment order conflict';
  exception when others then
    if sqlerrm not like '%PAYROLL_PAYMENT_ORDER_CONFLICT%' then raise; end if;
  end;

  if not exists (
    select 1 from public.shared_payroll_payment_order_drafts d
    where d.tenant_id = fixture.tenant_id
      and d.payroll_receipt_id = fixture.receipt_id
      and d.amount = fixture.net_pay
      and d.confirmed_at = fixture.confirmed_at
      and d.payment_order_id = v_created->'order'->>'id'
  ) then
    raise exception 'Payment order draft traceability mismatch';
  end if;
end;
$smoke$;

do $access$
begin
  if has_table_privilege('anon', 'public.shared_payroll_payment_order_drafts', 'select')
    or has_table_privilege('authenticated', 'public.shared_payroll_payment_order_drafts', 'insert')
    or has_function_privilege(
      'authenticated',
      'public.create_payroll_payment_order_draft(uuid,uuid,text,text,text,text,numeric,timestamptz,text,text)',
      'execute'
    )
    or not has_function_privilege(
      'service_role',
      'public.create_payroll_payment_order_draft(uuid,uuid,text,text,text,text,numeric,timestamptz,text,text)',
      'execute'
    )
  then
    raise exception 'Payment order draft private access leaked';
  end if;
end;
$access$;

rollback;
