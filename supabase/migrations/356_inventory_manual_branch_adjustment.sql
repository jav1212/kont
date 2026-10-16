-- ADM-012: new manual inventory adjustments may carry an explicit branch.
-- Historical movements remain unassigned; the legacy movement function is not
-- replaced, and this command never claims branch-level on-hand stock.
create unique index shared_inventory_movements_manual_branch_scope_uq
  on public.shared_inventory_movements(tenant_id, company_id, id);

create table public.shared_inventory_manual_branch_movements (
  tenant_id uuid not null,
  company_id text not null,
  movement_id text not null,
  branch_id uuid not null,
  actor_user_id uuid not null,
  assigned_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, movement_id),
  foreign key (tenant_id, company_id, movement_id)
    references public.shared_inventory_movements(tenant_id, company_id, id) on delete restrict,
  foreign key (branch_id, tenant_id, company_id)
    references public.shared_company_branches(id, tenant_id, company_id) on delete restrict
);
create index shared_inventory_manual_branch_movements_scope_idx
  on public.shared_inventory_manual_branch_movements(tenant_id, company_id, movement_id);
create index shared_inventory_manual_branch_movements_branch_idx
  on public.shared_inventory_manual_branch_movements(branch_id, tenant_id, company_id);

create table public.shared_inventory_manual_branch_requests (
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
create index shared_inventory_manual_branch_requests_company_idx
  on public.shared_inventory_manual_branch_requests(tenant_id, company_id);

create or replace function public.reject_inventory_manual_branch_mapping_mutation()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'INVENTORY_BRANCH_ADJUSTMENT_MAPPING_IMMUTABLE'; end $$;
create trigger shared_inventory_manual_branch_movements_immutable
before update or delete on public.shared_inventory_manual_branch_movements
for each row execute function public.reject_inventory_manual_branch_mapping_mutation();
revoke all on function public.reject_inventory_manual_branch_mapping_mutation()
  from public,anon,authenticated,service_role;

alter table public.shared_inventory_manual_branch_movements enable row level security;
alter table public.shared_inventory_manual_branch_requests enable row level security;
revoke all on public.shared_inventory_manual_branch_movements,
  public.shared_inventory_manual_branch_requests from public,anon,authenticated,service_role;

create or replace function public.record_native_inventory_branch_adjustment(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_branch_id uuid,
  p_product_id text,p_type text,p_date date,p_quantity text,p_unit text,
  p_unit_cost_ves text,p_reference text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid; v_branch_tenant uuid;
  v_product public.shared_inventory_products%rowtype;
  v_request public.shared_inventory_manual_branch_requests%rowtype;
  v_quantity numeric(14,4); v_unit_cost numeric(14,4);
  v_reference text; v_key text; v_intent jsonb;
  v_movement jsonb; v_result jsonb; v_stock_revision bigint;
begin
  if p_actor_user_id is null or p_organization_id is null or p_company_id is null
    or btrim(p_company_id)='' or p_branch_id is null or p_product_id is null
    or btrim(p_product_id)='' or p_type is null
    or p_type not in ('ajuste_positivo','ajuste_negativo','autoconsumo')
    or p_date is null or p_quantity is null
    or p_quantity !~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,4})?$'
    or p_unit is null or btrim(p_unit)='' or length(p_unit)>64
    or p_reference is not null and length(btrim(p_reference))>160
    or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 128
    or (p_type='ajuste_positivo' and (p_unit_cost_ves is null
      or p_unit_cost_ves !~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,4})?$'))
    or (p_type in ('ajuste_negativo','autoconsumo') and p_unit_cost_ves is not null) then
    raise exception 'INVENTORY_BRANCH_ADJUSTMENT_INVALID';
  end if;
  v_quantity := p_quantity::numeric(14,4);
  if v_quantity<=0 then raise exception 'INVENTORY_BRANCH_ADJUSTMENT_INVALID'; end if;
  v_unit_cost := case when p_unit_cost_ves is null then null
    else p_unit_cost_ves::numeric(14,4) end;
  v_reference := coalesce(btrim(p_reference),'');
  v_key := btrim(p_idempotency_key);

  begin
    v_tenant := public.assert_user_security_access(
      p_actor_user_id,p_organization_id,p_company_id,'inventory.update');
    v_branch_tenant := public.assert_company_administration_access(
      p_organization_id,p_actor_user_id,'branches.select');
  exception when others then
    if sqlerrm in ('ORGANIZATIONAL_USER_ACCESS_DENIED','ORGANIZATIONAL_USER_COMPANY_INVALID',
      'COMPANY_ACCESS_DENIED','COMPANY_ORGANIZATION_NOT_READY') then
      raise exception 'INVENTORY_BRANCH_ADJUSTMENT_ACCESS_DENIED';
    end if;
    raise;
  end;
  if v_tenant is null or v_tenant is distinct from v_branch_tenant then
    raise exception 'INVENTORY_BRANCH_ADJUSTMENT_ACCESS_DENIED';
  end if;
  perform 1 from public.shared_company_branches b
  where b.id=p_branch_id and b.tenant_id=v_tenant and b.organization_id=p_organization_id
    and b.company_id=p_company_id
    and (public.company_branch_user_can_select_any(p_actor_user_id,p_organization_id)
      or exists(select 1 from public.shared_company_branch_memberships bm
        where bm.tenant_id=b.tenant_id and bm.organization_id=b.organization_id
          and bm.company_id=b.company_id and bm.branch_id=b.id
          and bm.user_id=p_actor_user_id and bm.status='active'))
  for share;
  if not found then raise exception 'INVENTORY_BRANCH_ADJUSTMENT_ACCESS_DENIED'; end if;

  v_intent := jsonb_build_object('branchId',p_branch_id,'productId',p_product_id,
    'type',p_type,'date',p_date,'quantity',v_quantity::text,'unit',p_unit,
    'unitCostVes',v_unit_cost::text,'reference',v_reference);
  insert into public.shared_inventory_manual_branch_requests(
    tenant_id,organization_id,company_id,actor_user_id,idempotency_key,intent)
  values(v_tenant,p_organization_id,p_company_id,p_actor_user_id,v_key,v_intent)
  on conflict do nothing;
  select * into v_request from public.shared_inventory_manual_branch_requests
  where organization_id=p_organization_id and actor_user_id=p_actor_user_id
    and company_id=p_company_id and idempotency_key=v_key for update;
  if v_request.intent is distinct from v_intent then
    raise exception 'INVENTORY_BRANCH_ADJUSTMENT_IDEMPOTENCY_CONFLICT';
  end if;
  if v_request.result is not null then return v_request.result; end if;

  select p.* into v_product from public.shared_inventory_products p
  join public.shared_companies c on c.tenant_id=p.tenant_id and c.id=p.company_id
  where p.tenant_id=v_tenant and p.company_id=p_company_id and p.id=p_product_id
    and c.organization_id=p_organization_id and c.status='active' for update of p;
  if not found or v_product.active is not true or v_product.measure_unit is distinct from p_unit then
    raise exception 'INVENTORY_BRANCH_ADJUSTMENT_PRODUCT_UNAVAILABLE';
  end if;
  perform 1 from public.shared_inventory_closures cl
  where cl.tenant_id=v_tenant and cl.company_id=p_company_id
    and cl.period=to_char(p_date,'YYYY-MM') for share;
  if found then raise exception 'INVENTORY_BRANCH_ADJUSTMENT_PERIOD_CLOSED'; end if;
  if p_type in ('ajuste_negativo','autoconsumo')
    and v_product.current_stock<v_quantity then
    raise exception 'INVENTORY_BRANCH_ADJUSTMENT_STOCK_INSUFFICIENT';
  end if;

  v_movement := public.shared_inventory_movement_save(v_tenant,jsonb_build_object(
    'empresa_id',p_company_id,'producto_id',p_product_id,'tipo',p_type,
    'fecha',p_date,'cantidad',v_quantity::text,'costo_unitario',coalesce(v_unit_cost,0)::text,
    'moneda','VES','referencia',v_reference));
  insert into public.shared_inventory_manual_branch_movements(
    tenant_id,company_id,movement_id,branch_id,actor_user_id)
  values(v_tenant,p_company_id,v_movement->>'id',p_branch_id,p_actor_user_id);
  select stock_revision into v_stock_revision from public.shared_inventory_products
  where tenant_id=v_tenant and company_id=p_company_id and id=p_product_id;
  v_result := jsonb_build_object(
    'movementId',v_movement->>'id','branchId',p_branch_id,'companyId',p_company_id,
    'productId',p_product_id,'type',p_type,'date',p_date,
    'quantity',(v_movement->>'quantity')::numeric::text,
    'unitCostVes',(v_movement->>'unit_cost')::numeric::text,
    'totalCostVes',(v_movement->>'total_cost')::numeric::text,
    'globalBalance',(v_movement->>'balance_quantity')::numeric::text,
    'stockRevision',v_stock_revision::text);
  update public.shared_inventory_manual_branch_requests set result=v_result
  where organization_id=p_organization_id and actor_user_id=p_actor_user_id
    and company_id=p_company_id and idempotency_key=v_key;
  return v_result;
end $$;
revoke all on function public.record_native_inventory_branch_adjustment(
  uuid,uuid,text,uuid,text,text,date,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.record_native_inventory_branch_adjustment(
  uuid,uuid,text,uuid,text,text,date,text,text,text,text,text)
  to service_role;
