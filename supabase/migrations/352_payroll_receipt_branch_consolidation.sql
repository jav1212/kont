-- ADM-012: attribute future payroll receipts individually, never whole runs or legacy history.
-- The legacy writer remains valid and leaves receipts unattributed until an explicit full-run assignment.
alter table public.shared_payroll_runs
  add column branch_assignment_eligible boolean;

alter table public.shared_payroll_receipts
  add column branch_id uuid,
  add column branch_assigned_by uuid,
  add column branch_assigned_at timestamptz;

alter table public.shared_payroll_receipts
  add constraint shared_payroll_receipts_branch_scope_fk
  foreign key (branch_id, tenant_id, company_id)
  references public.shared_company_branches(id, tenant_id, company_id)
  on delete restrict;

create index shared_payroll_receipts_branch_scope_idx
  on public.shared_payroll_receipts(tenant_id, company_id, branch_id, run_id)
  where branch_id is not null;

create index shared_payroll_runs_confirmed_period_end_idx
  on public.shared_payroll_runs(tenant_id, company_id, period_end, id)
  where status = 'confirmed';

create or replace function public.guard_payroll_run_branch_eligibility()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.branch_assignment_eligible := true;
    return new;
  end if;
  if new.branch_assignment_eligible is distinct from old.branch_assignment_eligible then
    raise exception 'PAYROLL_BRANCH_ELIGIBILITY_IMMUTABLE';
  end if;
  if exists (
    select 1 from public.shared_payroll_receipts r
    where r.tenant_id = old.tenant_id and r.run_id = old.id and r.branch_id is not null
  ) and (
    new.tenant_id is distinct from old.tenant_id
    or new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end
    or new.exchange_rate is distinct from old.exchange_rate
  ) then raise exception 'PAYROLL_BRANCH_RUN_SNAPSHOT_IMMUTABLE'; end if;
  return new;
end $$;
revoke all on function public.guard_payroll_run_branch_eligibility() from public,anon,authenticated,service_role;
create trigger payroll_run_branch_eligibility_guard
before insert or update on public.shared_payroll_runs
for each row execute function public.guard_payroll_run_branch_eligibility();

create or replace function public.guard_payroll_run_branch_delete()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from public.shared_payroll_receipts r
    where r.tenant_id = old.tenant_id and r.run_id = old.id and r.branch_id is not null
  ) then raise exception 'PAYROLL_BRANCH_RUN_SNAPSHOT_IMMUTABLE'; end if;
  return old;
end $$;
revoke all on function public.guard_payroll_run_branch_delete() from public,anon,authenticated,service_role;
create trigger payroll_run_branch_delete_guard
before delete on public.shared_payroll_runs
for each row execute function public.guard_payroll_run_branch_delete();

create or replace function public.assert_native_payroll_branch_access(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
  p_tenant_id uuid, p_branch_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
begin
  if p_branch_id is null or not exists (
    select 1 from public.shared_company_branches b
    where b.id = p_branch_id and b.tenant_id = p_tenant_id
      and b.organization_id = p_organization_id and b.company_id = p_company_id
  ) then raise exception 'PAYROLL_BRANCH_ACCESS_DENIED'; end if;
  perform 1 from public.organization_memberships m
    join public.organization_roles r on r.id = m.role_id and r.organization_id = m.organization_id and r.status = 'active'
    join public.organization_role_permissions rp on rp.role_id = r.id and rp.permission_code = 'branches.select'
    where m.organization_id = p_organization_id and m.user_id = p_actor_user_id and m.status = 'active'
    for share of m, r, rp;
  if not found then raise exception 'PAYROLL_BRANCH_ACCESS_DENIED'; end if;
  if not public.company_branch_user_can_select_any(p_actor_user_id, p_organization_id) then
    perform 1 from public.shared_company_branch_memberships bm
      where bm.tenant_id = p_tenant_id and bm.organization_id = p_organization_id
        and bm.company_id = p_company_id and bm.branch_id = p_branch_id
        and bm.user_id = p_actor_user_id and bm.status = 'active' for share;
    if not found then raise exception 'PAYROLL_BRANCH_ACCESS_DENIED'; end if;
  end if;
  return p_branch_id;
end $$;
revoke all on function public.assert_native_payroll_branch_access(uuid,uuid,text,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.guard_payroll_receipt_branch_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid; v_org uuid; v_eligible boolean; v_status text;
begin
  if tg_op = 'INSERT' then
    if new.branch_id is not null or new.branch_assigned_by is not null or new.branch_assigned_at is not null then
      raise exception 'PAYROLL_BRANCH_ASSIGNMENT_RPC_REQUIRED';
    end if;
    return new;
  end if;
  if new.branch_id is not distinct from old.branch_id
    and new.branch_assigned_by is not distinct from old.branch_assigned_by
    and new.branch_assigned_at is not distinct from old.branch_assigned_at then return new; end if;
  if old.branch_id is not null or new.branch_id is null
    or current_setting('role', true) is distinct from 'service_role' then
    raise exception 'PAYROLL_BRANCH_ASSIGNMENT_RPC_REQUIRED';
  end if;
  v_actor := nullif(current_setting('kontave.payroll.branch_actor_user_id', true), '')::uuid;
  if v_actor is null or new.branch_assigned_by is distinct from v_actor
    or new.branch_assigned_at is null
    or current_setting('kontave.payroll.branch_id', true) is distinct from new.branch_id::text then
    raise exception 'PAYROLL_BRANCH_ASSIGNMENT_RPC_REQUIRED';
  end if;
  select c.organization_id into v_org from public.shared_companies c
    where c.tenant_id = new.tenant_id and c.id = new.company_id;
  select r.branch_assignment_eligible, r.status into v_eligible, v_status
    from public.shared_payroll_runs r
    where r.tenant_id = new.tenant_id and r.id = new.run_id
      and r.company_id = new.company_id;
  if v_org is null or v_eligible is not true or v_status <> 'confirmed' then
    raise exception 'PAYROLL_BRANCH_ASSIGNMENT_CONFLICT';
  end if;
  perform public.assert_native_payroll_branch_access(
    v_actor, v_org, new.company_id, new.tenant_id, new.branch_id);
  return new;
end $$;
revoke all on function public.guard_payroll_receipt_branch_assignment() from public,anon,authenticated,service_role;
create trigger payroll_receipt_branch_assignment_guard
before insert or update of branch_id, branch_assigned_by, branch_assigned_at
on public.shared_payroll_receipts
for each row execute function public.guard_payroll_receipt_branch_assignment();

create or replace function public.protect_attributed_payroll_receipt_snapshot()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.branch_id is not null then
    if tg_op = 'DELETE' then raise exception 'PAYROLL_BRANCH_RECEIPT_SNAPSHOT_IMMUTABLE'; end if;
    if new is distinct from old then raise exception 'PAYROLL_BRANCH_RECEIPT_SNAPSHOT_IMMUTABLE'; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.protect_attributed_payroll_receipt_snapshot() from public,anon,authenticated,service_role;
create trigger payroll_attributed_receipt_snapshot_guard
before update or delete on public.shared_payroll_receipts
for each row execute function public.protect_attributed_payroll_receipt_snapshot();

create or replace function public.assign_native_payroll_run_receipt_branches(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
  p_run_id text, p_assignments jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_run public.shared_payroll_runs%rowtype;
  v_receipt_count integer;
  v_assignment jsonb;
  v_receipt_id text;
  v_branch_id uuid;
  v_assigned_at timestamptz;
begin
  if p_run_id is null or length(trim(p_run_id)) < 1 or length(p_run_id) > 128
    or p_assignments is null or jsonb_typeof(p_assignments) <> 'array'
  then raise exception 'PAYROLL_BRANCH_ASSIGNMENT_INVALID'; end if;
  if jsonb_array_length(p_assignments) < 1 or jsonb_array_length(p_assignments) > 500 then
    raise exception 'PAYROLL_BRANCH_ASSIGNMENT_INVALID';
  end if;
  if exists (
      select 1 from jsonb_array_elements(p_assignments) a(item)
      where jsonb_typeof(a.item) <> 'object'
        or a.item - 'receiptId' - 'branchId' <> '{}'::jsonb
        or jsonb_typeof(a.item->'receiptId') <> 'string'
        or jsonb_typeof(a.item->'branchId') <> 'string'
        or length(trim(a.item->>'receiptId')) < 1
        or length(a.item->>'receiptId') > 128
        or (a.item->>'branchId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) or (select count(distinct a.item->>'receiptId') from jsonb_array_elements(p_assignments) a(item))
      <> jsonb_array_length(p_assignments)
  then raise exception 'PAYROLL_BRANCH_ASSIGNMENT_INVALID'; end if;

  begin
    v_tenant := public.assert_user_security_access(
      p_actor_user_id, p_organization_id, p_company_id, 'payroll.confirm');
  exception when others then
    if sqlerrm in ('ORGANIZATIONAL_USER_ACCESS_DENIED', 'ORGANIZATIONAL_USER_COMPANY_INVALID') then
      raise exception 'PAYROLL_BRANCH_ASSIGNMENT_ACCESS_DENIED';
    end if;
    raise;
  end;
  if v_tenant is null then raise exception 'PAYROLL_BRANCH_ASSIGNMENT_ACCESS_DENIED'; end if;
  select * into v_run from public.shared_payroll_runs r
    where r.tenant_id = v_tenant and r.company_id = p_company_id and r.id = p_run_id
    for update;
  if not found or v_run.status <> 'confirmed' or v_run.branch_assignment_eligible is not true then
    raise exception 'PAYROLL_BRANCH_ASSIGNMENT_CONFLICT';
  end if;
  select count(*) into v_receipt_count from public.shared_payroll_receipts r
    where r.tenant_id = v_tenant and r.run_id = p_run_id;
  if v_receipt_count <> jsonb_array_length(p_assignments) then
    raise exception 'PAYROLL_BRANCH_ASSIGNMENT_CONFLICT';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_assignments) a(item)
    where not exists (
      select 1 from public.shared_payroll_receipts r
      where r.tenant_id = v_tenant and r.company_id = p_company_id and r.run_id = p_run_id
        and r.id = a.item->>'receiptId'
    )
  ) then raise exception 'PAYROLL_BRANCH_ASSIGNMENT_CONFLICT'; end if;

  -- Validate every branch before the first write, then lock receipts in a stable order.
  for v_assignment in select a.item from jsonb_array_elements(p_assignments) a(item) loop
    perform public.assert_native_payroll_branch_access(
      p_actor_user_id, p_organization_id, p_company_id, v_tenant,
      (v_assignment->>'branchId')::uuid);
  end loop;
  perform 1 from public.shared_payroll_receipts r
    where r.tenant_id = v_tenant and r.company_id = p_company_id and r.run_id = p_run_id
    order by r.id for update;

  if exists (
    select 1 from public.shared_payroll_receipts r
    where r.tenant_id = v_tenant and r.company_id = p_company_id and r.run_id = p_run_id
      and r.branch_id is not null
  ) then
    if exists (
      select 1 from jsonb_array_elements(p_assignments) a(item)
      join public.shared_payroll_receipts r on r.tenant_id = v_tenant
        and r.company_id = p_company_id and r.run_id = p_run_id
        and r.id = a.item->>'receiptId'
      where r.branch_id is distinct from (a.item->>'branchId')::uuid
        or r.branch_assigned_by is distinct from p_actor_user_id
        or r.branch_assigned_at is null
    ) or exists (
      select 1 from public.shared_payroll_receipts r
      where r.tenant_id = v_tenant and r.company_id = p_company_id and r.run_id = p_run_id
        and r.branch_id is null
    ) or (select count(distinct r.branch_assigned_at)
      from public.shared_payroll_receipts r
      where r.tenant_id = v_tenant and r.company_id = p_company_id and r.run_id = p_run_id) <> 1
    then raise exception 'PAYROLL_BRANCH_ASSIGNMENT_CONFLICT'; end if;
    select min(r.branch_assigned_at) into v_assigned_at
      from public.shared_payroll_receipts r
      where r.tenant_id = v_tenant and r.company_id = p_company_id and r.run_id = p_run_id;
    return jsonb_build_object('runId',p_run_id,'assignedReceiptCount',v_receipt_count,'assignedAt',v_assigned_at);
  end if;

  v_assigned_at := clock_timestamp();
  perform set_config('kontave.payroll.branch_actor_user_id', p_actor_user_id::text, true);
  perform set_config('kontave.operation.actor_user_id', p_actor_user_id::text, true);
  perform set_config('kontave.operation.organization_id', p_organization_id::text, true);
  perform set_config('kontave.operation.tenant_id', v_tenant::text, true);
  perform set_config('kontave.operation.company_id', p_company_id, true);
  perform set_config('kontave.operation.device_id', '', true);
  for v_assignment in select a.item from jsonb_array_elements(p_assignments) a(item) loop
    v_receipt_id := v_assignment->>'receiptId';
    v_branch_id := (v_assignment->>'branchId')::uuid;
    perform set_config('kontave.payroll.branch_id', v_branch_id::text, true);
    perform set_config('kontave.operation.branch_id', v_branch_id::text, true);
    update public.shared_payroll_receipts r
      set branch_id = v_branch_id, branch_assigned_by = p_actor_user_id,
        branch_assigned_at = v_assigned_at
      where r.tenant_id = v_tenant and r.company_id = p_company_id
        and r.run_id = p_run_id and r.id = v_receipt_id;
  end loop;
  return jsonb_build_object('runId',p_run_id,'assignedReceiptCount',v_receipt_count,'assignedAt',v_assigned_at);
end $$;
revoke all on function public.assign_native_payroll_run_receipt_branches(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.assign_native_payroll_run_receipt_branches(uuid,uuid,text,text,jsonb) to service_role;

create or replace function public.get_native_payroll_branch_consolidation(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
  p_from date, p_to date, p_branch_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_branch_tenant uuid;
  v_select_any boolean;
  v_rows jsonb;
  v_attributed_count bigint;
  v_unattributed_count bigint;
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 365
    or coalesce(cardinality(p_branch_ids),0) > 100
    or (p_branch_ids is not null and (
      exists(select 1 from unnest(p_branch_ids) ids(branch_id) where branch_id is null)
      or cardinality(p_branch_ids) <> (select count(distinct ids.branch_id) from unnest(p_branch_ids) ids(branch_id))
    )) then raise exception 'PAYROLL_BRANCH_CONSOLIDATION_INVALID'; end if;
  begin
    v_tenant := public.assert_user_security_access(
      p_actor_user_id, p_organization_id, p_company_id, 'payroll.read');
  exception when others then
    if sqlerrm in ('ORGANIZATIONAL_USER_ACCESS_DENIED', 'ORGANIZATIONAL_USER_COMPANY_INVALID') then
      raise exception 'PAYROLL_BRANCH_CONSOLIDATION_ACCESS_DENIED';
    end if;
    raise;
  end;
  begin
    v_branch_tenant := public.assert_company_administration_access(
      p_organization_id, p_actor_user_id, 'branches.consolidate');
  exception when others then
    if sqlerrm in ('COMPANY_ACCESS_DENIED', 'COMPANY_ORGANIZATION_NOT_READY') then
      raise exception 'PAYROLL_BRANCH_CONSOLIDATION_ACCESS_DENIED';
    end if;
    raise;
  end;
  if v_tenant is null or v_tenant is distinct from v_branch_tenant then
    raise exception 'PAYROLL_BRANCH_CONSOLIDATION_ACCESS_DENIED';
  end if;
  v_select_any := public.company_branch_user_can_select_any(p_actor_user_id, p_organization_id);
  if p_branch_ids is not null and exists (
    select 1 from unnest(p_branch_ids) requested(branch_id)
    where not exists (
      select 1 from public.shared_company_branches b
      where b.id = requested.branch_id and b.tenant_id = v_tenant
        and b.organization_id = p_organization_id and b.company_id = p_company_id
        and (v_select_any or exists (
          select 1 from public.shared_company_branch_memberships bm
          where bm.tenant_id = b.tenant_id and bm.organization_id = b.organization_id
            and bm.company_id = b.company_id and bm.branch_id = b.id
            and bm.user_id = p_actor_user_id and bm.status = 'active'
        ))
    )
  ) then raise exception 'PAYROLL_BRANCH_CONSOLIDATION_ACCESS_DENIED'; end if;

  with accessible_branches as (
    select b.id, b.code, b.name from public.shared_company_branches b
    where b.tenant_id = v_tenant and b.organization_id = p_organization_id
      and b.company_id = p_company_id and (p_branch_ids is null or b.id = any(p_branch_ids))
      and (v_select_any or exists (
        select 1 from public.shared_company_branch_memberships bm
        where bm.tenant_id = b.tenant_id and bm.organization_id = b.organization_id
          and bm.company_id = b.company_id and bm.branch_id = b.id
          and bm.user_id = p_actor_user_id and bm.status = 'active'
      ))
  ), grouped as (
    select b.id branch_id,b.code branch_code,b.name branch_name,
      count(*)::bigint receipt_count,
      sum(rc.total_earnings)::text total_earnings,
      sum(rc.total_deductions)::text total_deductions,
      sum(rc.total_bonuses)::text total_bonuses,
      sum(rc.net_pay)::text net_pay
    from public.shared_payroll_runs run
    join public.shared_payroll_receipts rc
      on rc.tenant_id = run.tenant_id and rc.company_id = run.company_id and rc.run_id = run.id
    join accessible_branches b on b.id = rc.branch_id
    where run.tenant_id = v_tenant and run.company_id = p_company_id
      and run.status = 'confirmed' and run.period_end between p_from and p_to
    group by b.id,b.code,b.name
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'branchId',branch_id,'branchCode',branch_code,'branchName',branch_name,
    'receiptCount',receipt_count,'totalEarnings',total_earnings,
    'totalDeductions',total_deductions,'totalBonuses',total_bonuses,
    'netPay',net_pay,'functionalCurrency','VES'
  ) order by branch_code),'[]'::jsonb) into v_rows from grouped;

  select count(*) into v_attributed_count from public.shared_payroll_runs run
  join public.shared_payroll_receipts rc
    on rc.tenant_id = run.tenant_id and rc.company_id = run.company_id and rc.run_id = run.id
  join public.shared_company_branches b on b.id = rc.branch_id
    and b.tenant_id = v_tenant and b.organization_id = p_organization_id
    and b.company_id = p_company_id
  where run.tenant_id = v_tenant and run.company_id = p_company_id
    and run.status = 'confirmed' and run.period_end between p_from and p_to
    and (p_branch_ids is null or rc.branch_id = any(p_branch_ids))
    and (v_select_any or exists (
      select 1 from public.shared_company_branch_memberships bm
      where bm.tenant_id = b.tenant_id and bm.organization_id = b.organization_id
        and bm.company_id = b.company_id and bm.branch_id = b.id
        and bm.user_id = p_actor_user_id and bm.status = 'active'
    ));
  if v_select_any then
    select count(*) into v_unattributed_count from public.shared_payroll_runs run
    join public.shared_payroll_receipts rc
      on rc.tenant_id = run.tenant_id and rc.company_id = run.company_id and rc.run_id = run.id
    where run.tenant_id = v_tenant and run.company_id = p_company_id
      and run.status = 'confirmed' and run.period_end between p_from and p_to
      and rc.branch_id is null;
  end if;
  return jsonb_build_object(
    'period',jsonb_build_object('from',p_from,'to',p_to),'rows',v_rows,
    'coverage',jsonb_build_object(
      'attributedConfirmedReceiptCount',v_attributed_count,
      'unattributedConfirmedReceiptCount',case when v_select_any then v_unattributed_count else null end,
      'includesUnattributed',v_select_any
    ),'generatedAt',clock_timestamp()
  );
end $$;
revoke all on function public.get_native_payroll_branch_consolidation(uuid,uuid,text,date,date,uuid[]) from public,anon,authenticated;
grant execute on function public.get_native_payroll_branch_consolidation(uuid,uuid,text,date,date,uuid[]) to service_role;
