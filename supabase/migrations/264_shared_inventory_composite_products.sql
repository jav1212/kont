-- Composite products are commercial catalog items whose stock is represented by
-- their simple component products. Existing products remain simple by default.

alter table public.shared_inventory_products
  add column if not exists composition_kind text not null default 'simple';

alter table public.shared_inventory_products
  drop constraint if exists shared_inventory_products_composition_kind_check;
alter table public.shared_inventory_products
  add constraint shared_inventory_products_composition_kind_check
  check (composition_kind in ('simple', 'composite'));

create table if not exists public.shared_inventory_product_components (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  composite_product_id text not null,
  component_product_id text not null,
  quantity numeric(14,4) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, composite_product_id, component_product_id),
  foreign key (tenant_id, composite_product_id) references public.shared_inventory_products(tenant_id, id) on delete cascade,
  foreign key (tenant_id, component_product_id) references public.shared_inventory_products(tenant_id, id) on delete restrict,
  check (composite_product_id <> component_product_id),
  check (quantity > 0 and quantity <> 'NaN'::numeric)
);
create index if not exists shared_inventory_product_components_component_idx
  on public.shared_inventory_product_components(tenant_id, component_product_id);
alter table public.shared_inventory_product_components enable row level security;
revoke all on public.shared_inventory_product_components from public, anon, authenticated;

create or replace function public.shared_inventory_composite_product_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'INSERT' and new.composition_kind = 'composite' and new.current_stock <> 0 then
    raise exception 'COMPOSITE_PRODUCT_STOCK_MUST_BE_ZERO';
  end if;
  if tg_op = 'UPDATE' and old.composition_kind = 'simple' and new.composition_kind = 'composite'
     and old.current_stock <> 0 then
    raise exception 'COMPOSITE_PRODUCT_STOCK_MUST_BE_ZERO';
  end if;
  if new.composition_kind = 'composite' and tg_op = 'UPDATE' and new.current_stock <> old.current_stock then
    raise exception 'COMPOSITE_PRODUCT_STOCK_CANNOT_CHANGE';
  end if;
  if tg_op = 'UPDATE' and old.measure_unit <> new.measure_unit and exists (
    select 1 from public.shared_inventory_product_components c
    where c.tenant_id = old.tenant_id and c.component_product_id = old.id
  ) then
    raise exception 'COMPONENT_PRODUCT_UNIT_CANNOT_CHANGE';
  end if;
  if tg_op = 'UPDATE' and old.composition_kind = 'simple' and new.composition_kind = 'composite' and exists (
    select 1 from public.shared_inventory_product_components c
    where c.tenant_id = old.tenant_id and c.component_product_id = old.id
  ) then
    raise exception 'COMPONENT_PRODUCT_MUST_REMAIN_SIMPLE';
  end if;
  if tg_op = 'UPDATE' and old.company_id <> new.company_id and exists (
    select 1 from public.shared_inventory_product_components c
    where c.tenant_id = old.tenant_id and (c.component_product_id = old.id or c.composite_product_id = old.id)
  ) then raise exception 'COMPONENT_PRODUCT_COMPANY_CANNOT_CHANGE'; end if;
  if tg_op = 'UPDATE' and old.composition_kind = 'composite' and new.composition_kind = 'simple' and exists (
    select 1 from public.shared_inventory_product_components c where c.tenant_id=old.tenant_id and c.composite_product_id=old.id
  ) then raise exception 'COMPOSITE_PRODUCT_COMPONENTS_MUST_BE_CLEARED'; end if;
  return new;
end;
$$;
drop trigger if exists shared_inventory_composite_product_guard on public.shared_inventory_products;
create trigger shared_inventory_composite_product_guard before update on public.shared_inventory_products
for each row execute function public.shared_inventory_composite_product_guard();
drop trigger if exists shared_inventory_composite_product_insert_guard on public.shared_inventory_products;
create trigger shared_inventory_composite_product_insert_guard before insert on public.shared_inventory_products
for each row execute function public.shared_inventory_composite_product_guard();

create or replace function public.shared_inventory_product_component_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_parent record; v_child record;
begin
  select * into v_parent from public.shared_inventory_products
    where tenant_id=new.tenant_id and id=new.composite_product_id for update;
  select * into v_child from public.shared_inventory_products
    where tenant_id=new.tenant_id and id=new.component_product_id for update;
  if not found or v_parent.company_id <> v_child.company_id or v_parent.composition_kind <> 'composite'
     or v_child.composition_kind <> 'simple' or not v_child.active then
    raise exception 'COMPOSITION_COMPONENT_INVALID';
  end if;
  return new;
end;
$$;
drop trigger if exists shared_inventory_product_component_guard on public.shared_inventory_product_components;
create trigger shared_inventory_product_component_guard before insert or update on public.shared_inventory_product_components
for each row execute function public.shared_inventory_product_component_guard();

create or replace function public.shared_inventory_product_components_list(
  p_tenant_id uuid, p_product_ids text[]
) returns table(composite_product_id text, product_id text, quantity numeric, code text, name text, measure_unit text, current_stock numeric, active boolean)
language sql stable security definer set search_path=public as $$
  select c.composite_product_id, p.id, c.quantity, p.code, p.name, p.measure_unit, p.current_stock, p.active
  from public.shared_inventory_product_components c
  join public.shared_inventory_products p on p.tenant_id=c.tenant_id and p.id=c.component_product_id
  where c.tenant_id=p_tenant_id and c.composite_product_id = any(p_product_ids)
  order by c.composite_product_id, p.code, p.id
$$;

create or replace function public.shared_inventory_product_composition_get(
  p_tenant_id uuid, p_company_id text, p_product_id text
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_product record;
begin
  select * into v_product from public.shared_inventory_products
  where tenant_id=p_tenant_id and company_id=p_company_id and id=p_product_id;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  return jsonb_build_object(
    'product_id', v_product.id, 'company_id', v_product.company_id,
    'composition_kind', v_product.composition_kind,
    'composition_status', case when v_product.composition_kind='simple' or exists(
      select 1 from public.shared_inventory_product_components c
      where c.tenant_id=p_tenant_id and c.composite_product_id=v_product.id
    ) then 'ready' else 'pending' end,
    'components', coalesce((select jsonb_agg(jsonb_build_object(
      'product_id', p.id, 'quantity', c.quantity, 'code', p.code, 'name', p.name,
      'measure_unit', p.measure_unit, 'current_stock', p.current_stock, 'active', p.active
    ) order by p.code,p.id) from public.shared_inventory_product_components c join public.shared_inventory_products p
      on p.tenant_id=c.tenant_id and p.id=c.component_product_id
      where c.tenant_id=p_tenant_id and c.composite_product_id=v_product.id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.shared_inventory_product_composition_replace(
  p_tenant_id uuid, p_company_id text, p_product_id text, p_components jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_parent record; v_component jsonb; v_child record; v_seen text[] := '{}';
begin
  if jsonb_typeof(p_components) is distinct from 'array' then raise exception 'COMPOSITION_INVALID'; end if;
  select * into v_parent from public.shared_inventory_products
    where tenant_id=p_tenant_id and company_id=p_company_id and id=p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if v_parent.composition_kind <> 'composite' then raise exception 'PRODUCT_NOT_COMPOSITE'; end if;
  for v_component in select * from jsonb_array_elements(p_components) order by value->>'productId' loop
    if nullif(v_component->>'productId','') is null or coalesce((v_component->>'quantity')::numeric, 0) <= 0
       or (v_component->>'quantity')::numeric = 'NaN'::numeric then
      raise exception 'COMPOSITION_INVALID';
    end if;
    if v_component->>'productId' = p_product_id or v_component->>'productId' = any(v_seen) then raise exception 'COMPOSITION_INVALID'; end if;
    v_seen := array_append(v_seen, v_component->>'productId');
    select * into v_child from public.shared_inventory_products
      where tenant_id=p_tenant_id and company_id=p_company_id and id=v_component->>'productId' for update;
    if not found or not v_child.active or v_child.composition_kind <> 'simple' then raise exception 'COMPOSITION_COMPONENT_INVALID'; end if;
  end loop;
  delete from public.shared_inventory_product_components
    where tenant_id=p_tenant_id and composite_product_id=p_product_id;
  insert into public.shared_inventory_product_components(tenant_id,composite_product_id,component_product_id,quantity)
  select p_tenant_id,p_product_id,item->>'productId',(item->>'quantity')::numeric
  from jsonb_array_elements(p_components) item;
  return public.shared_inventory_product_composition_get(p_tenant_id,p_company_id,p_product_id);
end;
$$;

-- Keeps the exact recipe used when a commercial sale is posted. The actual
-- movements remain the authoritative stock effect used during unconfirmation.
create table if not exists public.shared_inventory_sales_invoice_item_components (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_item_id text not null,
  component_product_id text not null,
  quantity numeric(14,4) not null,
  component_code text not null,
  component_name text not null,
  component_measure_unit text not null,
  primary key(tenant_id, invoice_item_id, component_product_id),
  foreign key(tenant_id, invoice_item_id) references public.shared_inventory_sales_invoice_items(tenant_id,id) on delete cascade,
  foreign key(tenant_id, component_product_id) references public.shared_inventory_products(tenant_id,id),
  check(quantity>0)
);
alter table public.shared_inventory_sales_invoice_item_components enable row level security;
revoke all on public.shared_inventory_sales_invoice_item_components from public, anon, authenticated;

create or replace function public.shared_inventory_sales_invoice_confirm(
  p_tenant_id uuid, p_invoice_id text, p_allow_negative_stock boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_invoice record; v_item record; v_product record; v_demand record; v_move jsonb; v_negative_allowed boolean;
begin
  select * into v_invoice from public.shared_inventory_sales_invoices
    where tenant_id=p_tenant_id and id=p_invoice_id for update;
  if v_invoice is null then raise exception 'Sales invoice not found'; end if;
  if v_invoice.status <> 'borrador' then raise exception 'Sales invoice is not a draft'; end if;
  v_negative_allowed := coalesce(p_allow_negative_stock, false);

  create temp table if not exists _shared_sales_composite_demand(product_id text primary key, quantity numeric(14,4) not null, composite_quantity numeric(14,4) not null) on commit drop;
  truncate _shared_sales_composite_demand;
  delete from public.shared_inventory_sales_invoice_item_components where tenant_id=p_tenant_id and invoice_item_id in (
    select id from public.shared_inventory_sales_invoice_items where tenant_id=p_tenant_id and invoice_id=p_invoice_id
  );
  -- Recipe parents are locked before their components are read. The matching
  -- replace procedure locks this same parent row before replacing its recipe.
  for v_product in select p.* from public.shared_inventory_sales_invoice_items i join public.shared_inventory_products p
    on p.tenant_id=i.tenant_id and p.id=i.product_id
    where i.tenant_id=p_tenant_id and i.invoice_id=p_invoice_id and p.composition_kind='composite' order by p.id for update loop
    if v_product.company_id<>v_invoice.company_id or not v_product.active then raise exception 'Product does not belong to invoice company'; end if;
  end loop;
  for v_item in select * from public.shared_inventory_sales_invoice_items where tenant_id=p_tenant_id and invoice_id=p_invoice_id order by id loop
    if v_item.product_id is null then continue; end if;
    select * into v_product from public.shared_inventory_products where tenant_id=p_tenant_id and id=v_item.product_id;
    if not found or v_product.company_id <> v_invoice.company_id or not v_product.active then raise exception 'Product does not belong to invoice company'; end if;
    if v_product.composition_kind='composite' then
      if not exists(select 1 from public.shared_inventory_product_components c where c.tenant_id=p_tenant_id and c.composite_product_id=v_product.id) then raise exception 'COMPOSITE_PRODUCT_COMPOSITION_PENDING'; end if;
      insert into public.shared_inventory_sales_invoice_item_components(tenant_id,invoice_item_id,component_product_id,quantity,component_code,component_name,component_measure_unit)
      select p_tenant_id,v_item.id,c.component_product_id,c.quantity*v_item.quantity,p.code,p.name,p.measure_unit
      from public.shared_inventory_product_components c join public.shared_inventory_products p on p.tenant_id=c.tenant_id and p.id=c.component_product_id
      where c.tenant_id=p_tenant_id and c.composite_product_id=v_product.id;
      insert into _shared_sales_composite_demand(product_id,quantity,composite_quantity)
      select c.component_product_id,c.quantity*v_item.quantity,c.quantity*v_item.quantity from public.shared_inventory_product_components c where c.tenant_id=p_tenant_id and c.composite_product_id=v_product.id
      on conflict(product_id) do update set quantity=_shared_sales_composite_demand.quantity+excluded.quantity,composite_quantity=_shared_sales_composite_demand.composite_quantity+excluded.composite_quantity;
    else
      insert into _shared_sales_composite_demand(product_id,quantity,composite_quantity) values(v_product.id,v_item.quantity,0)
      on conflict(product_id) do update set quantity=_shared_sales_composite_demand.quantity+excluded.quantity;
    end if;
  end loop;
  -- Lock stock rows in product id order so concurrent invoices use a stable order.
  for v_demand in select * from _shared_sales_composite_demand order by product_id loop
    select * into v_product from public.shared_inventory_products where tenant_id=p_tenant_id and id=v_demand.product_id for update;
    if not found or v_product.company_id<>v_invoice.company_id or not v_product.active or v_product.composition_kind<>'simple' then raise exception 'COMPOSITE_COMPONENT_INVALID'; end if;
    if not v_negative_allowed and v_product.current_stock < v_demand.quantity then raise exception 'Insufficient stock for product %',v_demand.product_id; end if;
  end loop;
  -- Composite effects are aggregated so shared components are decremented once.
  for v_demand in select product_id,composite_quantity quantity from _shared_sales_composite_demand where composite_quantity>0 order by product_id loop
    v_move := public.shared_inventory_movement_save(p_tenant_id,jsonb_build_object(
      'id',gen_random_uuid()::text,'empresa_id',v_invoice.company_id,'producto_id',v_demand.product_id,'tipo','salida','fecha',v_invoice.invoice_date::text,
      'cantidad',v_demand.quantity,'costo_unitario',0,'referencia',v_invoice.invoice_number,'precio_venta_unitario',0,'factura_venta_id',p_invoice_id
    ));
  end loop;
  -- Simple commercial lines preserve their existing sale-price accounting.
  for v_item in select i.* from public.shared_inventory_sales_invoice_items i join public.shared_inventory_products p
    on p.tenant_id=i.tenant_id and p.id=i.product_id
    where i.tenant_id=p_tenant_id and i.invoice_id=p_invoice_id and p.composition_kind='simple' order by i.id loop
    v_move := public.shared_inventory_movement_save(p_tenant_id,jsonb_build_object(
      'id',gen_random_uuid()::text,'empresa_id',v_invoice.company_id,'producto_id',v_item.product_id,'tipo','salida','fecha',v_invoice.invoice_date::text,
      'cantidad',v_item.quantity,'costo_unitario',v_item.unit_price,'moneda',v_item.currency,'costo_moneda',v_item.currency_price,'tasa_dolar',v_item.dollar_rate,
      'referencia',v_invoice.invoice_number,'base_iva',v_item.vat_base,'precio_venta_unitario',v_item.unit_price,'factura_venta_id',p_invoice_id
    ));
  end loop;
  update public.shared_inventory_sales_invoices set status='confirmada',confirmed_at=now(),updated_at=now() where tenant_id=p_tenant_id and id=p_invoice_id;
  return (select row_to_json(i)::jsonb from public.shared_inventory_sales_invoices i where i.tenant_id=p_tenant_id and i.id=p_invoice_id);
end;
$$;

revoke all on function public.shared_inventory_product_components_list(uuid,text[]),public.shared_inventory_product_composition_get(uuid,text,text),public.shared_inventory_product_composition_replace(uuid,text,text,jsonb) from public,anon,authenticated;
revoke execute on function public.shared_inventory_sales_invoice_confirm(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.shared_inventory_product_components_list(uuid,text[]),public.shared_inventory_product_composition_get(uuid,text,text),public.shared_inventory_product_composition_replace(uuid,text,text,jsonb),public.shared_inventory_sales_invoice_confirm(uuid,text,boolean) to service_role;

-- Match confirmation lock order when rebuilding component stock on reversal.
create or replace function public.shared_inventory_sales_invoice_unconfirm(
    p_tenant_id uuid, p_invoice_id text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_invoice record;
    v_product record;
    v_move record;
    v_stock numeric(14,4);
    v_average numeric(14,4);
    v_next_stock numeric(14,4);
    v_next_average numeric(14,4);
begin
    select * into v_invoice from public.shared_inventory_sales_invoices
    where tenant_id=p_tenant_id and id=p_invoice_id for update;
    if v_invoice is null then raise exception 'Sales invoice not found'; end if;
    if v_invoice.status <> 'confirmada' then raise exception 'Sales invoice is not confirmed'; end if;

    create temp table if not exists _shared_sales_rebuild_products(product_id text primary key) on commit drop;
    truncate _shared_sales_rebuild_products;
    insert into _shared_sales_rebuild_products
        select distinct product_id from public.shared_inventory_movements
        where tenant_id=p_tenant_id and sales_invoice_id=p_invoice_id
        on conflict do nothing;
    delete from public.shared_inventory_movements
        where tenant_id=p_tenant_id and sales_invoice_id=p_invoice_id;

    for v_product in
        select p.* from public.shared_inventory_products p
        join _shared_sales_rebuild_products r on r.product_id=p.id
        where p.tenant_id=p_tenant_id order by p.id for update
    loop
        v_stock:=0; v_average:=0;
        for v_move in
            select * from public.shared_inventory_movements
            where tenant_id=p_tenant_id and product_id=v_product.id
            order by date,created_at,id
        loop
            if v_move.type in ('entrada','ajuste_positivo','devolucion_salida') then
                v_next_stock:=v_stock+v_move.quantity;
                v_next_average:=case when v_next_stock>0
                    then ((v_stock*v_average)+v_move.total_cost)/v_next_stock else v_move.unit_cost end;
            else
                v_next_stock:=v_stock-v_move.quantity;
                v_next_average:=v_average;
            end if;
            update public.shared_inventory_movements set balance_quantity=v_next_stock
                where tenant_id=p_tenant_id and id=v_move.id;
            v_stock:=v_next_stock; v_average:=v_next_average;
        end loop;
        update public.shared_inventory_products
        set current_stock=v_stock,average_cost=v_average,updated_at=now()
        where tenant_id=p_tenant_id and id=v_product.id;
    end loop;

    update public.shared_inventory_sales_invoices
    set status='borrador',confirmed_at=null,updated_at=now()
    where tenant_id=p_tenant_id and id=p_invoice_id;
    return (select row_to_json(i)::jsonb from public.shared_inventory_sales_invoices i
        where i.tenant_id=p_tenant_id and i.id=p_invoice_id);
end;
$$;


grant select on public.shared_inventory_sales_invoice_item_components to service_role;
