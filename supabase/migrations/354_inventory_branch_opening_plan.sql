-- ADM-012: version the legacy global stock and record explicit branch opening
-- allocation drafts. These drafts never activate branch stock or move inventory.
alter table public.shared_inventory_products
  add column stock_revision bigint not null default 0 check (stock_revision >= 0);

create or replace function public.guard_inventory_product_stock_revision()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.stock_revision is distinct from old.stock_revision then
    raise exception 'INVENTORY_STOCK_REVISION_MANAGED';
  end if;
  if new.current_stock is distinct from old.current_stock
    or new.measure_unit is distinct from old.measure_unit then
    new.stock_revision := old.stock_revision + 1;
  end if;
  return new;
end $$;
create trigger zz_inventory_product_stock_revision
before update on public.shared_inventory_products
for each row execute function public.guard_inventory_product_stock_revision();
revoke all on function public.guard_inventory_product_stock_revision() from public,anon,authenticated,service_role;

create unique index shared_inventory_products_branch_opening_scope_uq
  on public.shared_inventory_products(tenant_id, company_id, id);

create table public.shared_inventory_branch_opening_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  product_id text not null,
  stock_revision bigint not null check (stock_revision >= 0),
  stock_quantity numeric(14,4) not null check (stock_quantity > 0),
  measure_unit text not null check (length(btrim(measure_unit)) > 0),
  revision integer not null check (revision > 0),
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, company_id, product_id),
  unique (id, tenant_id, company_id),
  foreign key (tenant_id, company_id) references public.shared_companies(tenant_id, id) on delete restrict,
  foreign key (tenant_id, company_id, product_id)
    references public.shared_inventory_products(tenant_id, company_id, id) on delete restrict
);
create index shared_inventory_branch_opening_plans_org_idx
  on public.shared_inventory_branch_opening_plans(organization_id, company_id);

create table public.shared_inventory_branch_opening_lines (
  plan_id uuid not null,
  tenant_id uuid not null,
  company_id text not null,
  branch_id uuid not null,
  quantity numeric(14,4) not null check (quantity > 0),
  primary key (plan_id, branch_id),
  foreign key (plan_id, tenant_id, company_id)
    references public.shared_inventory_branch_opening_plans(id, tenant_id, company_id) on delete cascade,
  foreign key (branch_id, tenant_id, company_id)
    references public.shared_company_branches(id, tenant_id, company_id) on delete restrict
);
create index shared_inventory_branch_opening_lines_branch_idx
  on public.shared_inventory_branch_opening_lines(branch_id, tenant_id, company_id);

create table public.shared_inventory_branch_opening_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.shared_inventory_branch_opening_plans(id) on delete restrict,
  tenant_id uuid not null,
  organization_id uuid not null,
  company_id text not null,
  product_id text not null,
  revision integer not null,
  stock_revision bigint not null,
  actor_user_id uuid not null,
  allocations jsonb not null,
  occurred_at timestamptz not null default clock_timestamp()
);
create index shared_inventory_branch_opening_events_plan_idx
  on public.shared_inventory_branch_opening_events(plan_id, revision);
create index shared_inventory_branch_opening_events_org_idx
  on public.shared_inventory_branch_opening_events(organization_id, company_id, occurred_at);

create or replace function public.reject_inventory_branch_opening_event_mutation()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'INVENTORY_BRANCH_OPENING_EVENT_IMMUTABLE'; end $$;
create trigger shared_inventory_branch_opening_events_immutable
before update or delete on public.shared_inventory_branch_opening_events
for each row execute function public.reject_inventory_branch_opening_event_mutation();
revoke all on function public.reject_inventory_branch_opening_event_mutation() from public,anon,authenticated,service_role;

alter table public.shared_inventory_branch_opening_plans enable row level security;
alter table public.shared_inventory_branch_opening_lines enable row level security;
alter table public.shared_inventory_branch_opening_events enable row level security;
revoke all on public.shared_inventory_branch_opening_plans,
  public.shared_inventory_branch_opening_lines,
  public.shared_inventory_branch_opening_events from public,anon,authenticated,service_role;

create or replace function public.native_inventory_branch_opening_snapshot(
  p_product public.shared_inventory_products,
  p_plan public.shared_inventory_branch_opening_plans
) returns jsonb language plpgsql stable set search_path = public as $$
declare v_lines jsonb; v_total numeric;
begin
  if p_plan.id is null then
    return jsonb_build_object(
      'productId', p_product.id, 'measureUnit', p_product.measure_unit,
      'companyStock', p_product.current_stock::text,
      'stockRevision', p_product.stock_revision::text, 'plan', null);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'branchId', l.branch_id, 'branchCode', b.code, 'quantity', l.quantity::text)
    order by b.code, l.branch_id), '[]'::jsonb), coalesce(sum(l.quantity),0)
  into v_lines, v_total
  from public.shared_inventory_branch_opening_lines l
  join public.shared_company_branches b on b.id=l.branch_id
    and b.tenant_id=l.tenant_id and b.company_id=l.company_id
  where l.plan_id=p_plan.id;
  return jsonb_build_object(
    'productId', p_product.id, 'measureUnit', p_product.measure_unit,
    'companyStock', p_product.current_stock::text,
    'stockRevision', p_product.stock_revision::text,
    'plan', jsonb_build_object(
      'revision', p_plan.revision,
      'snapshotStockRevision', p_plan.stock_revision::text,
      'snapshotCompanyStock', p_plan.stock_quantity::text,
      'totalAllocated', v_total::text,
      'stale', p_plan.stock_revision is distinct from p_product.stock_revision,
      'updatedAt', p_plan.updated_at, 'lines', v_lines));
end $$;
revoke all on function public.native_inventory_branch_opening_snapshot(
  public.shared_inventory_products,public.shared_inventory_branch_opening_plans)
  from public,anon,authenticated,service_role;

create or replace function public.get_native_inventory_branch_opening_plan(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_product_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid; v_branch_tenant uuid;
  v_product public.shared_inventory_products%rowtype;
  v_plan public.shared_inventory_branch_opening_plans%rowtype;
begin
  if p_actor_user_id is null or p_organization_id is null or p_company_id is null
    or btrim(p_company_id)='' or p_product_id is null or btrim(p_product_id)='' then
    raise exception 'INVENTORY_BRANCH_OPENING_INVALID';
  end if;
  begin
    v_tenant := public.assert_user_security_access(
      p_actor_user_id,p_organization_id,p_company_id,'inventory.read');
    v_branch_tenant := public.assert_company_administration_access(
      p_organization_id,p_actor_user_id,'branches.select_any');
  exception when others then
    if sqlerrm in ('ORGANIZATIONAL_USER_ACCESS_DENIED','ORGANIZATIONAL_USER_COMPANY_INVALID',
      'COMPANY_ACCESS_DENIED','COMPANY_ORGANIZATION_NOT_READY') then
      raise exception 'INVENTORY_BRANCH_OPENING_ACCESS_DENIED';
    end if;
    raise;
  end;
  if v_tenant is null or v_tenant is distinct from v_branch_tenant
    or not public.company_branch_user_can_select_any(p_actor_user_id,p_organization_id) then
    raise exception 'INVENTORY_BRANCH_OPENING_ACCESS_DENIED';
  end if;
  select p.* into v_product from public.shared_inventory_products p
  join public.shared_companies c on c.tenant_id=p.tenant_id and c.id=p.company_id
  where p.tenant_id=v_tenant and p.company_id=p_company_id and p.id=p_product_id
    and c.organization_id=p_organization_id;
  if not found then raise exception 'INVENTORY_BRANCH_OPENING_ACCESS_DENIED'; end if;
  select * into v_plan from public.shared_inventory_branch_opening_plans
  where tenant_id=v_tenant and organization_id=p_organization_id
    and company_id=p_company_id and product_id=p_product_id;
  return public.native_inventory_branch_opening_snapshot(v_product,v_plan);
end $$;
revoke all on function public.get_native_inventory_branch_opening_plan(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.get_native_inventory_branch_opening_plan(uuid,uuid,text,text)
  to service_role;

create or replace function public.replace_native_inventory_branch_opening_plan(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_product_id text,
  p_expected_stock_revision bigint,p_expected_plan_revision integer,p_lines jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid; v_branch_tenant uuid;
  v_product public.shared_inventory_products%rowtype;
  v_plan public.shared_inventory_branch_opening_plans%rowtype;
  v_line jsonb; v_branch uuid; v_quantity numeric(14,4);
  v_seen uuid[] := '{}'::uuid[]; v_total numeric := 0;
begin
  if p_actor_user_id is null or p_organization_id is null or p_company_id is null
    or btrim(p_company_id)='' or p_product_id is null or btrim(p_product_id)=''
    or p_expected_stock_revision is null or p_expected_stock_revision<0
    or p_expected_plan_revision is null or p_expected_plan_revision<0
    or jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'INVENTORY_BRANCH_OPENING_INVALID';
  end if;
  if jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'INVENTORY_BRANCH_OPENING_INVALID';
  end if;
  begin
    v_tenant := public.assert_user_security_access(
      p_actor_user_id,p_organization_id,p_company_id,'inventory.update');
    v_branch_tenant := public.assert_company_administration_access(
      p_organization_id,p_actor_user_id,'branches.select_any');
  exception when others then
    if sqlerrm in ('ORGANIZATIONAL_USER_ACCESS_DENIED','ORGANIZATIONAL_USER_COMPANY_INVALID',
      'COMPANY_ACCESS_DENIED','COMPANY_ORGANIZATION_NOT_READY') then
      raise exception 'INVENTORY_BRANCH_OPENING_ACCESS_DENIED';
    end if;
    raise;
  end;
  if v_tenant is null or v_tenant is distinct from v_branch_tenant
    or not public.company_branch_user_can_select_any(p_actor_user_id,p_organization_id) then
    raise exception 'INVENTORY_BRANCH_OPENING_ACCESS_DENIED';
  end if;

  select p.* into v_product from public.shared_inventory_products p
  join public.shared_companies c on c.tenant_id=p.tenant_id and c.id=p.company_id
  where p.tenant_id=v_tenant and p.company_id=p_company_id and p.id=p_product_id
    and c.organization_id=p_organization_id and c.status='active' for update of p;
  if not found then raise exception 'INVENTORY_BRANCH_OPENING_ACCESS_DENIED'; end if;
  if v_product.stock_revision<>p_expected_stock_revision then
    raise exception 'INVENTORY_BRANCH_OPENING_STOCK_CONFLICT';
  end if;
  if v_product.current_stock<=0 then raise exception 'INVENTORY_BRANCH_OPENING_STOCK_NOT_POSITIVE'; end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line) is distinct from 'object' then
      raise exception 'INVENTORY_BRANCH_OPENING_INVALID';
    end if;
    if (select count(*) from jsonb_object_keys(v_line))<>2
      or jsonb_typeof(v_line->'branchId') is distinct from 'string'
      or jsonb_typeof(v_line->'quantity') is distinct from 'string'
      or (v_line->>'branchId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (v_line->>'quantity') !~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,4})?$' then
      raise exception 'INVENTORY_BRANCH_OPENING_INVALID';
    end if;
    v_branch := (v_line->>'branchId')::uuid;
    v_quantity := (v_line->>'quantity')::numeric(14,4);
    if v_quantity<=0 or v_branch=any(v_seen) then
      raise exception 'INVENTORY_BRANCH_OPENING_INVALID';
    end if;
    perform 1 from public.shared_company_branches b
    where b.id=v_branch and b.tenant_id=v_tenant
      and b.organization_id=p_organization_id and b.company_id=p_company_id for share;
    if not found then raise exception 'INVENTORY_BRANCH_OPENING_ACCESS_DENIED'; end if;
    v_seen := array_append(v_seen,v_branch);
    v_total := v_total+v_quantity;
  end loop;
  if v_total<>v_product.current_stock then
    raise exception 'INVENTORY_BRANCH_OPENING_SUM_MISMATCH';
  end if;

  select * into v_plan from public.shared_inventory_branch_opening_plans
  where tenant_id=v_tenant and organization_id=p_organization_id
    and company_id=p_company_id and product_id=p_product_id for update;
  if not found then
    if p_expected_plan_revision<>0 then raise exception 'INVENTORY_BRANCH_OPENING_PLAN_CONFLICT'; end if;
    insert into public.shared_inventory_branch_opening_plans(
      tenant_id,organization_id,company_id,product_id,stock_revision,stock_quantity,
      measure_unit,revision,created_by,updated_by)
    values(v_tenant,p_organization_id,p_company_id,p_product_id,v_product.stock_revision,
      v_product.current_stock,v_product.measure_unit,1,p_actor_user_id,p_actor_user_id)
    returning * into v_plan;
  else
    if v_plan.revision<>p_expected_plan_revision then
      raise exception 'INVENTORY_BRANCH_OPENING_PLAN_CONFLICT';
    end if;
    update public.shared_inventory_branch_opening_plans set
      stock_revision=v_product.stock_revision,stock_quantity=v_product.current_stock,
      measure_unit=v_product.measure_unit,revision=v_plan.revision+1,
      updated_by=p_actor_user_id,updated_at=clock_timestamp()
    where id=v_plan.id returning * into v_plan;
    delete from public.shared_inventory_branch_opening_lines where plan_id=v_plan.id;
  end if;
  insert into public.shared_inventory_branch_opening_lines(
    plan_id,tenant_id,company_id,branch_id,quantity)
  select v_plan.id,v_tenant,p_company_id,(line->>'branchId')::uuid,
    (line->>'quantity')::numeric(14,4)
  from jsonb_array_elements(p_lines) as items(line);
  insert into public.shared_inventory_branch_opening_events(
    plan_id,tenant_id,organization_id,company_id,product_id,revision,
    stock_revision,actor_user_id,allocations)
  values(v_plan.id,v_tenant,p_organization_id,p_company_id,p_product_id,v_plan.revision,
    v_product.stock_revision,p_actor_user_id,p_lines);
  return public.native_inventory_branch_opening_snapshot(v_product,v_plan);
end $$;
revoke all on function public.replace_native_inventory_branch_opening_plan(
  uuid,uuid,text,text,bigint,integer,jsonb) from public,anon,authenticated;
grant execute on function public.replace_native_inventory_branch_opening_plan(
  uuid,uuid,text,text,bigint,integer,jsonb) to service_role;
