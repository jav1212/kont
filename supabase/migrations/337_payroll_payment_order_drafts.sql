-- ADM-037: a payroll receipt can originate one traceable payment-order draft.
-- The link intentionally blocks deletion of either source or order; cancellation
-- remains available, but changes to the payroll-derived business values do not.

create table public.shared_payroll_payment_order_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  payroll_run_id text not null,
  payroll_receipt_id text not null,
  employee_id text not null,
  amount numeric(14,2) not null check (amount > 0),
  confirmed_at timestamptz not null,
  beneficiary text not null check (length(trim(beneficiary)) between 1 and 240),
  idempotency_key text not null check (length(trim(idempotency_key)) between 1 and 1024),
  payment_order_id text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, payroll_receipt_id),
  unique (tenant_id, company_id, idempotency_key),
  unique (tenant_id, payment_order_id),
  foreign key (tenant_id, company_id)
    references public.shared_companies(tenant_id, id) on delete restrict,
  foreign key (tenant_id, payroll_run_id)
    references public.shared_payroll_runs(tenant_id, id) on delete restrict,
  foreign key (tenant_id, payroll_receipt_id)
    references public.shared_payroll_receipts(tenant_id, id) on delete restrict,
  foreign key (tenant_id, payment_order_id)
    references public.shared_payment_orders(tenant_id, id) on delete restrict
);

create index shared_payroll_payment_order_drafts_run_idx
  on public.shared_payroll_payment_order_drafts(tenant_id, payroll_run_id);
create index shared_payroll_payment_order_drafts_company_created_idx
  on public.shared_payroll_payment_order_drafts(tenant_id, company_id, created_at desc);
create index shared_payroll_payment_order_drafts_organization_idx
  on public.shared_payroll_payment_order_drafts(organization_id);

alter table public.shared_payroll_payment_order_drafts enable row level security;
revoke all on public.shared_payroll_payment_order_drafts
  from public, anon, authenticated, service_role;

create or replace function public.prevent_payroll_payment_order_source_mutation()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1
      from public.shared_payroll_payment_order_drafts d
      where d.tenant_id = old.tenant_id
        and d.payment_order_id = old.id
    ) then
      raise exception 'PAYROLL_PAYMENT_ORDER_IMMUTABLE';
    end if;
    return old;
  end if;

  if exists (
    select 1
    from public.shared_payroll_payment_order_drafts d
    where d.tenant_id = old.tenant_id
      and d.payment_order_id = old.id
  ) then
    if new.beneficiary is distinct from old.beneficiary
      or new.concept is distinct from old.concept
      or new.amount is distinct from old.amount
      or new.currency is distinct from old.currency
      or new.due_date is distinct from old.due_date
    then
      raise exception 'PAYROLL_PAYMENT_ORDER_IMMUTABLE';
    end if;
  end if;
  return new;
end;
$$;

create trigger payroll_payment_order_source_mutation_guard
before update or delete on public.shared_payment_orders
for each row execute function public.prevent_payroll_payment_order_source_mutation();

create or replace function public.prevent_linked_payroll_run_snapshot_mutation()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if (new.status is distinct from old.status
      or new.confirmed_at is distinct from old.confirmed_at)
    and exists (
      select 1
      from public.shared_payroll_payment_order_drafts d
      where d.tenant_id = old.tenant_id
        and d.payroll_run_id = old.id
    )
  then
    raise exception 'PAYROLL_PAYMENT_ORDER_SOURCE_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger payroll_payment_order_run_snapshot_guard
before update on public.shared_payroll_runs
for each row execute function public.prevent_linked_payroll_run_snapshot_mutation();

create or replace function public.prevent_linked_payroll_receipt_snapshot_mutation()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if (new.run_id is distinct from old.run_id
      or new.company_id is distinct from old.company_id
      or new.employee_id is distinct from old.employee_id
      or new.net_pay is distinct from old.net_pay)
    and exists (
      select 1
      from public.shared_payroll_payment_order_drafts d
      where d.tenant_id = old.tenant_id
        and d.payroll_receipt_id = old.id
    )
  then
    raise exception 'PAYROLL_PAYMENT_ORDER_SOURCE_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger payroll_payment_order_receipt_snapshot_guard
before update on public.shared_payroll_receipts
for each row execute function public.prevent_linked_payroll_receipt_snapshot_mutation();

create or replace function public.create_payroll_payment_order_draft(
  p_actor_id uuid,
  p_organization_id uuid,
  p_company_id text,
  p_run_id text,
  p_receipt_id text,
  p_expected_employee_id text,
  p_expected_amount numeric,
  p_expected_confirmed_at timestamptz,
  p_beneficiary text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_tenant uuid;
  v_payment_tenant uuid;
  v_company public.shared_companies%rowtype;
  v_run public.shared_payroll_runs%rowtype;
  v_receipt public.shared_payroll_receipts%rowtype;
  v_existing public.shared_payroll_payment_order_drafts%rowtype;
  v_existing_key public.shared_payroll_payment_order_drafts%rowtype;
  v_order jsonb;
  v_order_id text;
  v_concept text;
begin
  if p_actor_id is null
    or p_organization_id is null
    or p_company_id is null
    or length(trim(p_company_id)) not between 1 and 128
    or p_run_id is null
    or length(trim(p_run_id)) not between 1 and 128
    or p_receipt_id is null
    or length(trim(p_receipt_id)) not between 1 and 128
    or p_expected_employee_id is null
    or length(trim(p_expected_employee_id)) not between 1 and 128
    or p_expected_amount is null
    or p_expected_amount <= 0
    or p_expected_amount in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    or p_expected_amount <> trunc(p_expected_amount, 2)
    or length(trunc(p_expected_amount)::text) > 12
    or p_expected_confirmed_at is null
    or p_beneficiary is null
    or length(trim(p_beneficiary)) not between 1 and 240
    or p_idempotency_key is null
    or length(trim(p_idempotency_key)) not between 1 and 1024
  then
    raise exception 'PAYROLL_PAYMENT_ORDER_VALIDATION_FAILED';
  end if;

  v_tenant := public.assert_user_security_access(
    p_actor_id, p_organization_id, p_company_id, 'payroll.read');
  v_payment_tenant := public.assert_user_security_access(
    p_actor_id, p_organization_id, p_company_id, 'payment_orders.create');
  if v_payment_tenant is distinct from v_tenant then
    raise exception 'PAYROLL_PAYMENT_ORDER_AUTHORIZATION_REVOKED';
  end if;

  select * into v_company
  from public.shared_companies
  where tenant_id = v_tenant
    and organization_id = p_organization_id
    and id = trim(p_company_id)
    and status = 'active'
  for share;
  if not found then
    raise exception 'PAYROLL_PAYMENT_ORDER_AUTHORIZATION_REVOKED';
  end if;

  -- Advisory locking serializes concurrent requests for this logical receipt.
  perform pg_advisory_xact_lock(
    hashtextextended(v_tenant::text || ':' || trim(p_receipt_id), 0));

  select * into v_existing
  from public.shared_payroll_payment_order_drafts
  where tenant_id = v_tenant and payroll_receipt_id = trim(p_receipt_id)
  for update;
  if found then
    if v_existing.organization_id is distinct from p_organization_id
      or v_existing.company_id is distinct from trim(p_company_id)
      or v_existing.payroll_run_id is distinct from trim(p_run_id)
      or v_existing.employee_id is distinct from trim(p_expected_employee_id)
      or v_existing.amount is distinct from p_expected_amount::numeric(14,2)
      or v_existing.confirmed_at is distinct from p_expected_confirmed_at
      or v_existing.beneficiary is distinct from trim(p_beneficiary)
      or v_existing.idempotency_key is distinct from trim(p_idempotency_key)
    then
      raise exception 'PAYROLL_PAYMENT_ORDER_IDEMPOTENCY_CONFLICT';
    end if;
    v_order := public.payment_order_json(
      v_tenant, p_organization_id, trim(p_company_id), v_existing.payment_order_id);
    if v_order is null then
      raise exception 'PAYROLL_PAYMENT_ORDER_TRACEABILITY_BROKEN';
    end if;
    if v_order->>'status' <> 'draft' then
      raise exception 'PAYROLL_PAYMENT_ORDER_CONFLICT';
    end if;
    return jsonb_build_object(
      'disposition', 'replayed',
      'order', v_order,
      'traceability', jsonb_build_object(
        'tenantId', v_existing.tenant_id,
        'organizationId', v_existing.organization_id,
        'companyId', v_existing.company_id,
        'payrollRunId', v_existing.payroll_run_id,
        'payrollReceiptId', v_existing.payroll_receipt_id,
        'employeeId', v_existing.employee_id,
        'amount', v_existing.amount::text,
        'currency', 'VES',
        -- A UTC ISO instant avoids treating equivalent lexical timestamps as conflicts.
        'payrollConfirmedAt', to_char(
          v_existing.confirmed_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ),
        'paymentOrderId', v_existing.payment_order_id,
        'idempotencyKey', v_existing.idempotency_key
      )
    );
  end if;

  select * into v_existing_key
  from public.shared_payroll_payment_order_drafts
  where tenant_id = v_tenant
    and company_id = trim(p_company_id)
    and idempotency_key = trim(p_idempotency_key)
  for update;
  if found then
    raise exception 'PAYROLL_PAYMENT_ORDER_IDEMPOTENCY_CONFLICT';
  end if;

  select * into v_run
  from public.shared_payroll_runs
  where tenant_id = v_tenant
    and id = trim(p_run_id)
    and company_id = trim(p_company_id)
  for share;
  if not found
    or v_run.status <> 'confirmed'
    or v_run.confirmed_at is distinct from p_expected_confirmed_at
  then
    raise exception 'PAYROLL_PAYMENT_ORDER_SOURCE_CHANGED';
  end if;

  select * into v_receipt
  from public.shared_payroll_receipts
  where tenant_id = v_tenant
    and id = trim(p_receipt_id)
    and run_id = v_run.id
    and company_id = trim(p_company_id)
  for share;
  if not found
    or v_receipt.employee_id is distinct from trim(p_expected_employee_id)
    or v_receipt.net_pay is distinct from p_expected_amount::numeric(14,2)
    or v_receipt.net_pay <= 0
  then
    raise exception 'PAYROLL_PAYMENT_ORDER_SOURCE_CHANGED';
  end if;

  v_order_id := 'payroll-' || encode(
    extensions.digest(v_tenant::text || ':' || v_receipt.id, 'sha256'), 'hex');
  v_concept := 'Nómina ' || v_run.id || ', recibo ' || v_receipt.id;
  if length(v_concept) > 1000 then
    raise exception 'PAYROLL_PAYMENT_ORDER_VALIDATION_FAILED';
  end if;
  if exists (
    select 1 from public.shared_payment_orders o
    where o.tenant_id = v_tenant and o.id = v_order_id
  ) then
    raise exception 'PAYROLL_PAYMENT_ORDER_SOURCE_CONFLICT';
  end if;

  v_order := public.create_payment_order(
    p_actor_id, p_organization_id, trim(p_company_id), v_order_id,
    trim(p_beneficiary), v_concept, v_receipt.net_pay, 'VES', null, null, null);

  insert into public.shared_payroll_payment_order_drafts(
    tenant_id, organization_id, company_id, payroll_run_id, payroll_receipt_id,
    employee_id, amount, confirmed_at, beneficiary, idempotency_key,
    payment_order_id, created_by
  ) values (
    v_tenant, p_organization_id, trim(p_company_id), v_run.id, v_receipt.id,
    v_receipt.employee_id, v_receipt.net_pay, v_run.confirmed_at, trim(p_beneficiary),
    trim(p_idempotency_key), v_order_id, p_actor_id
  );

  return jsonb_build_object(
    'disposition', 'created',
    'order', v_order,
    'traceability', jsonb_build_object(
      'tenantId', v_tenant,
      'organizationId', p_organization_id,
      'companyId', trim(p_company_id),
      'payrollRunId', v_run.id,
      'payrollReceiptId', v_receipt.id,
      'employeeId', v_receipt.employee_id,
      'amount', v_receipt.net_pay::text,
      'currency', 'VES',
      'payrollConfirmedAt', to_char(
        v_run.confirmed_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'paymentOrderId', v_order_id,
      'idempotencyKey', trim(p_idempotency_key)
    )
  );
end;
$$;

revoke all on function public.prevent_payroll_payment_order_source_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_linked_payroll_run_snapshot_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_linked_payroll_receipt_snapshot_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.create_payroll_payment_order_draft(
  uuid, uuid, text, text, text, text, numeric, timestamptz, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_payroll_payment_order_draft(
  uuid, uuid, text, text, text, text, numeric, timestamptz, text, text
) to service_role;
