-- ADM-012: explicitly review an independent historical movement before assigning
-- a branch. This adds reporting provenance; it does not post or allocate stock.
alter table public.shared_inventory_manual_branch_movements
  add column attribution_origin text not null default 'new_adjustment'
    check (attribution_origin in ('new_adjustment', 'historical_review')),
  add column review_reason text,
  add column movement_fingerprint text,
  add column snapshot_unit text,
  add constraint shared_inventory_manual_branch_review_metadata_check
    check (attribution_origin <> 'historical_review' or
      (review_reason is not null and movement_fingerprint is not null
       and snapshot_unit is not null
       and length(btrim(review_reason)) between 10 and 500
       and review_reason !~ '[[:cntrl:]]'
       and movement_fingerprint ~ '^[0-9a-f]{64}$'
       and length(btrim(snapshot_unit)) between 1 and 64));

create table public.shared_inventory_historical_branch_requests (
  tenant_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  actor_user_id uuid not null,
  idempotency_key text not null check (length(idempotency_key) between 1 and 128),
  intent jsonb not null,
  result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, actor_user_id, company_id, idempotency_key),
  foreign key (tenant_id, company_id)
    references public.shared_companies(tenant_id, id) on delete restrict
);
create index shared_inventory_historical_branch_requests_company_idx
  on public.shared_inventory_historical_branch_requests(tenant_id, company_id);
alter table public.shared_inventory_historical_branch_requests enable row level security;
revoke all on public.shared_inventory_historical_branch_requests
  from public, anon, authenticated, service_role;

create function public.native_inventory_historical_movement_fingerprint(
  p_movement public.shared_inventory_movements, p_unit text
) returns text language sql stable set search_path = public as $$
  select encode(extensions.digest(jsonb_build_object(
    'tenantId', p_movement.tenant_id, 'id', p_movement.id,
    'companyId', p_movement.company_id, 'productId', p_movement.product_id,
    'type', p_movement.type, 'date', p_movement.date,
    'quantity', p_movement.quantity, 'unitCostVes', p_movement.unit_cost,
    'totalCostVes', p_movement.total_cost, 'currency', p_movement.currency,
    'purchaseInvoiceId', p_movement.purchase_invoice_id,
    'salesInvoiceId', p_movement.sales_invoice_id,
    'reference', p_movement.reference, 'unit', p_unit
  )::text, 'sha256'), 'hex');
$$;
revoke all on function public.native_inventory_historical_movement_fingerprint(
  public.shared_inventory_movements, text) from public, anon, authenticated, service_role;

create function public.get_native_inventory_historical_movement_attribution_candidate(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text, p_movement_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid; v_branch_tenant uuid;
  v_movement public.shared_inventory_movements%rowtype; v_candidate record;
  v_unit text; v_branch_id uuid;
begin
  if p_actor_user_id is null or p_organization_id is null
    or p_company_id is null or length(btrim(p_company_id)) not between 1 and 128
    or p_movement_id is null or length(btrim(p_movement_id)) not between 1 and 128 then
    raise exception 'INVENTORY_BRANCH_ATTRIBUTION_INVALID';
  end if;
  begin
    v_tenant := public.assert_user_security_access(
      p_actor_user_id, p_organization_id, p_company_id, 'inventory.read');
    v_branch_tenant := public.assert_company_administration_access(
      p_organization_id, p_actor_user_id, 'branches.select_any');
  exception when others then
    if sqlerrm in ('ORGANIZATIONAL_USER_ACCESS_DENIED', 'ORGANIZATIONAL_USER_COMPANY_INVALID',
      'COMPANY_ACCESS_DENIED', 'COMPANY_ORGANIZATION_NOT_READY') then
      raise exception 'INVENTORY_BRANCH_ATTRIBUTION_ACCESS_DENIED';
    end if;
    raise;
  end;
  if v_tenant is null or v_tenant is distinct from v_branch_tenant
    or not public.company_branch_user_can_select_any(p_actor_user_id, p_organization_id) then
    raise exception 'INVENTORY_BRANCH_ATTRIBUTION_ACCESS_DENIED';
  end if;
  select m, p.measure_unit into v_candidate
  from public.shared_inventory_movements m
  join public.shared_inventory_products p on p.tenant_id=m.tenant_id
    and p.company_id=m.company_id and p.id=m.product_id
  join public.shared_companies c on c.tenant_id=m.tenant_id and c.id=m.company_id
  where m.tenant_id=v_tenant and m.company_id=p_company_id and m.id=p_movement_id
    and c.organization_id=p_organization_id and c.status='active'
    and m.purchase_invoice_id is null and m.sales_invoice_id is null;
  if not found then raise exception 'INVENTORY_BRANCH_ATTRIBUTION_MOVEMENT_UNAVAILABLE'; end if;
  v_movement := v_candidate.m;
  v_unit := v_candidate.measure_unit;
  select branch_id into v_branch_id
  from public.shared_inventory_manual_branch_movements
  where tenant_id=v_tenant and company_id=p_company_id and movement_id=p_movement_id;
  return jsonb_build_object(
    'movementId',v_movement.id,'companyId',v_movement.company_id,
    'productId',v_movement.product_id,'type',v_movement.type,
    'date',v_movement.date,'quantity',v_movement.quantity::text,
    'unit',v_unit,'unitCostVes',v_movement.unit_cost::text,
    'totalCostVes',v_movement.total_cost::text,'reference',v_movement.reference,
    'fingerprint',public.native_inventory_historical_movement_fingerprint(v_movement,v_unit),
    'attributedBranchId',v_branch_id);
end $$;
revoke all on function public.get_native_inventory_historical_movement_attribution_candidate(
  uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.get_native_inventory_historical_movement_attribution_candidate(
  uuid,uuid,text,text) to service_role;

create function public.attribute_native_inventory_historical_movement(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
  p_movement_id text, p_branch_id uuid, p_expected_movement_fingerprint text,
  p_reason text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid; v_branch_tenant uuid; v_reason text; v_key text;
  v_movement public.shared_inventory_movements%rowtype; v_candidate record;
  v_request public.shared_inventory_historical_branch_requests%rowtype;
  v_unit text; v_fingerprint text; v_intent jsonb; v_result jsonb;
  v_attributed_at timestamptz;
begin
  v_reason := btrim(p_reason);
  v_key := btrim(p_idempotency_key);
  if p_actor_user_id is null or p_organization_id is null
    or p_company_id is null or length(btrim(p_company_id)) not between 1 and 128
    or p_movement_id is null or length(btrim(p_movement_id)) not between 1 and 128
    or p_branch_id is null or p_expected_movement_fingerprint is null
    or p_expected_movement_fingerprint !~ '^[0-9a-f]{64}$'
    or v_reason is null or length(v_reason) not between 10 and 500
    or v_reason ~ '[[:cntrl:]]'
    or v_key is null or length(v_key) not between 1 and 128 then
    raise exception 'INVENTORY_BRANCH_ATTRIBUTION_INVALID';
  end if;
  begin
    v_tenant := public.assert_user_security_access(
      p_actor_user_id, p_organization_id, p_company_id, 'inventory.update');
    v_branch_tenant := public.assert_company_administration_access(
      p_organization_id, p_actor_user_id, 'branches.select_any');
  exception when others then
    if sqlerrm in ('ORGANIZATIONAL_USER_ACCESS_DENIED', 'ORGANIZATIONAL_USER_COMPANY_INVALID',
      'COMPANY_ACCESS_DENIED', 'COMPANY_ORGANIZATION_NOT_READY') then
      raise exception 'INVENTORY_BRANCH_ATTRIBUTION_ACCESS_DENIED';
    end if;
    raise;
  end;
  if v_tenant is null or v_tenant is distinct from v_branch_tenant
    or not public.company_branch_user_can_select_any(p_actor_user_id,p_organization_id) then
    raise exception 'INVENTORY_BRANCH_ATTRIBUTION_ACCESS_DENIED';
  end if;
  perform 1 from public.shared_company_branches b
  where b.id=p_branch_id and b.tenant_id=v_tenant
    and b.organization_id=p_organization_id and b.company_id=p_company_id for share;
  if not found then raise exception 'INVENTORY_BRANCH_ATTRIBUTION_ACCESS_DENIED'; end if;

  v_intent := jsonb_build_object('movementId',p_movement_id,'branchId',p_branch_id,
    'fingerprint',p_expected_movement_fingerprint,'reason',v_reason);
  insert into public.shared_inventory_historical_branch_requests(
    tenant_id,organization_id,company_id,actor_user_id,idempotency_key,intent)
  values(v_tenant,p_organization_id,p_company_id,p_actor_user_id,v_key,v_intent)
  on conflict do nothing;
  select * into v_request from public.shared_inventory_historical_branch_requests
  where organization_id=p_organization_id and actor_user_id=p_actor_user_id
    and company_id=p_company_id and idempotency_key=v_key for update;
  if v_request.intent is distinct from v_intent then
    raise exception 'INVENTORY_BRANCH_ATTRIBUTION_IDEMPOTENCY_CONFLICT';
  end if;
  if v_request.result is not null then return v_request.result; end if;

  select m, p.measure_unit into v_candidate
  from public.shared_inventory_movements m
  join public.shared_inventory_products p on p.tenant_id=m.tenant_id
    and p.company_id=m.company_id and p.id=m.product_id
  join public.shared_companies c on c.tenant_id=m.tenant_id and c.id=m.company_id
  where m.tenant_id=v_tenant and m.company_id=p_company_id and m.id=p_movement_id
    and c.organization_id=p_organization_id and c.status='active'
    and m.purchase_invoice_id is null and m.sales_invoice_id is null
  for update of m for share of p;
  if not found then raise exception 'INVENTORY_BRANCH_ATTRIBUTION_MOVEMENT_UNAVAILABLE'; end if;
  v_movement := v_candidate.m;
  v_unit := v_candidate.measure_unit;
  v_fingerprint := public.native_inventory_historical_movement_fingerprint(v_movement,v_unit);
  if v_fingerprint<>p_expected_movement_fingerprint then
    raise exception 'INVENTORY_BRANCH_ATTRIBUTION_STALE';
  end if;
  perform 1 from public.shared_inventory_manual_branch_movements
  where tenant_id=v_tenant and company_id=p_company_id and movement_id=p_movement_id;
  if found then raise exception 'INVENTORY_BRANCH_ATTRIBUTION_ALREADY_ATTRIBUTED'; end if;
  insert into public.shared_inventory_manual_branch_movements(
    tenant_id,company_id,movement_id,branch_id,actor_user_id,
    attribution_origin,review_reason,movement_fingerprint,snapshot_unit)
  values(v_tenant,p_company_id,p_movement_id,p_branch_id,p_actor_user_id,
    'historical_review',v_reason,v_fingerprint,v_unit)
  returning assigned_at into v_attributed_at;
  v_result := jsonb_build_object(
    'movementId',v_movement.id,'companyId',v_movement.company_id,
    'branchId',p_branch_id,'productId',v_movement.product_id,'type',v_movement.type,
    'date',v_movement.date,'quantity',v_movement.quantity::text,
    'unit',v_unit,'unitCostVes',v_movement.unit_cost::text,
    'totalCostVes',v_movement.total_cost::text,
    'attributedAt',v_attributed_at,'attributedBy',p_actor_user_id,'reason',v_reason);
  update public.shared_inventory_historical_branch_requests set result=v_result
  where organization_id=p_organization_id and actor_user_id=p_actor_user_id
    and company_id=p_company_id and idempotency_key=v_key;
  return v_result;
end $$;
revoke all on function public.attribute_native_inventory_historical_movement(
  uuid,uuid,text,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.attribute_native_inventory_historical_movement(
  uuid,uuid,text,text,uuid,text,text,text) to service_role;

-- A reviewed source cannot be silently reassigned by later legacy updates.
create function public.guard_inventory_attributed_movement_source()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.shared_inventory_manual_branch_movements a
    where a.tenant_id=old.tenant_id and a.company_id=old.company_id
      and a.movement_id=old.id) then
    if tg_op='DELETE' then
      raise exception 'INVENTORY_BRANCH_ATTRIBUTION_SOURCE_IMMUTABLE';
    end if;
    if new.tenant_id is distinct from old.tenant_id
      or new.company_id is distinct from old.company_id
      or new.product_id is distinct from old.product_id
      or new.type is distinct from old.type or new.date is distinct from old.date
      or new.quantity is distinct from old.quantity
      or new.unit_cost is distinct from old.unit_cost
      or new.total_cost is distinct from old.total_cost
      or new.currency is distinct from old.currency
      or new.purchase_invoice_id is distinct from old.purchase_invoice_id
      or new.sales_invoice_id is distinct from old.sales_invoice_id
      or new.reference is distinct from old.reference then
      raise exception 'INVENTORY_BRANCH_ATTRIBUTION_SOURCE_IMMUTABLE';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger shared_inventory_movements_branch_attribution_source_guard
before update or delete on public.shared_inventory_movements
for each row execute function public.guard_inventory_attributed_movement_source();
revoke all on function public.guard_inventory_attributed_movement_source()
  from public,anon,authenticated,service_role;

create function public.guard_inventory_attributed_product_unit()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.measure_unit is distinct from old.measure_unit and exists(
    select 1 from public.shared_inventory_manual_branch_movements a
    join public.shared_inventory_movements m on m.tenant_id=a.tenant_id
      and m.company_id=a.company_id and m.id=a.movement_id
    where m.tenant_id=old.tenant_id and m.company_id=old.company_id
      and m.product_id=old.id
  ) then raise exception 'INVENTORY_BRANCH_ATTRIBUTION_UNIT_IMMUTABLE'; end if;
  return new;
end $$;
create trigger shared_inventory_products_branch_attribution_unit_guard
before update of measure_unit on public.shared_inventory_products
for each row execute function public.guard_inventory_attributed_product_unit();
revoke all on function public.guard_inventory_attributed_product_unit()
  from public,anon,authenticated,service_role;
