-- ADM-015: atomic, explicitly mapped company-to-company stock transfer.
-- The legacy movement writer is retained for valuation compatibility, but the
-- protected RPC rejects negative source stock before calling it.

create table public.shared_cross_company_inventory_transfers (
  id text not null,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null,
  source_company_id text not null,
  destination_company_id text not null,
  effective_date date not null,
  correlation_id text not null,
  idempotency_key text not null,
  intent jsonb not null,
  intent_sha256 text not null check (intent_sha256 ~ '^[0-9a-f]{64}$'),
  source_operation_id text not null,
  destination_operation_id text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id,id),
  unique (organization_id,actor_user_id,idempotency_key),
  check (source_company_id <> destination_company_id),
  check (length(btrim(id)) between 1 and 128),
  check (length(btrim(correlation_id)) between 1 and 128),
  check (length(btrim(idempotency_key)) between 1 and 128),
  foreign key (tenant_id,source_company_id) references public.shared_companies(tenant_id,id) on delete restrict,
  foreign key (tenant_id,destination_company_id) references public.shared_companies(tenant_id,id) on delete restrict,
  foreign key (tenant_id,source_operation_id) references public.shared_inventory_operations(tenant_id,id) on delete restrict,
  foreign key (tenant_id,destination_operation_id) references public.shared_inventory_operations(tenant_id,id) on delete restrict
);
create index shared_cross_company_inventory_transfers_source_idx
  on public.shared_cross_company_inventory_transfers(tenant_id,source_company_id,effective_date desc);
create index shared_cross_company_inventory_transfers_destination_idx
  on public.shared_cross_company_inventory_transfers(tenant_id,destination_company_id,effective_date desc);
create index shared_cross_company_inventory_transfers_source_operation_idx
  on public.shared_cross_company_inventory_transfers(tenant_id,source_operation_id);
create index shared_cross_company_inventory_transfers_destination_operation_idx
  on public.shared_cross_company_inventory_transfers(tenant_id,destination_operation_id);
alter table public.shared_cross_company_inventory_transfers enable row level security;
revoke all on public.shared_cross_company_inventory_transfers from public,anon,authenticated,service_role;

create function public.prevent_cross_company_inventory_transfer_mutation()
returns trigger language plpgsql set search_path=public as $$
begin raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_IMMUTABLE'; end;
$$;
create trigger shared_cross_company_inventory_transfers_immutable
before update or delete or truncate on public.shared_cross_company_inventory_transfers
for each statement execute function public.prevent_cross_company_inventory_transfer_mutation();
revoke all on function public.prevent_cross_company_inventory_transfer_mutation() from public,anon,authenticated,service_role;

-- Generic single-operation reversal would unbalance the paired transfer.
-- A future reversal must post both sides atomically through a dedicated contract.
create function public.prevent_cross_company_inventory_transfer_component_mutation()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_id text; v_protected boolean;
begin
  v_tenant := old.tenant_id;
  if tg_table_name='shared_inventory_operations' then
    v_id := old.id;
    select exists(select 1 from public.shared_cross_company_inventory_transfers t
      where t.tenant_id=v_tenant and (t.source_operation_id=v_id or t.destination_operation_id=v_id)) into v_protected;
  elsif tg_table_name='shared_inventory_operation_lines' then
    v_id := old.operation_id;
    select exists(select 1 from public.shared_cross_company_inventory_transfers t
      where t.tenant_id=v_tenant and (t.source_operation_id=v_id or t.destination_operation_id=v_id)) into v_protected;
  else
    select exists(select 1 from public.shared_inventory_operation_lines l
      join public.shared_cross_company_inventory_transfers t on t.tenant_id=l.tenant_id
        and (t.source_operation_id=l.operation_id or t.destination_operation_id=l.operation_id)
      where l.tenant_id=v_tenant and l.movement_id=old.id) into v_protected;
  end if;
  if v_protected then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_IMMUTABLE'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger shared_inventory_operations_transfer_immutable
before update or delete on public.shared_inventory_operations
for each row execute function public.prevent_cross_company_inventory_transfer_component_mutation();
create trigger shared_inventory_operation_lines_transfer_immutable
before update or delete on public.shared_inventory_operation_lines
for each row execute function public.prevent_cross_company_inventory_transfer_component_mutation();
create trigger shared_inventory_movements_transfer_immutable
before update or delete on public.shared_inventory_movements
for each row execute function public.prevent_cross_company_inventory_transfer_component_mutation();
revoke all on function public.prevent_cross_company_inventory_transfer_component_mutation()
  from public,anon,authenticated,service_role;

-- Close/reopen of either period and its transfer must serialize even though the
-- legacy Web closure route writes the closure table directly.
create function public.native_cross_company_transfer_period_lock(p_tenant_id uuid,p_company_id text,p_period text)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_company_id||':'||p_period,3315));
end;
$$;
create function public.native_cross_company_transfer_closure_lock()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' and (old.tenant_id,old.company_id,old.period) is distinct from (new.tenant_id,new.company_id,new.period)
    then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_PERIOD_INVALID'; end if;
  if tg_op='DELETE' then
    perform public.native_cross_company_transfer_period_lock(old.tenant_id,old.company_id,old.period);
    return old;
  end if;
  perform public.native_cross_company_transfer_period_lock(new.tenant_id,new.company_id,new.period);
  return new;
end;
$$;
create trigger shared_inventory_closures_transfer_lock
before insert or update or delete on public.shared_inventory_closures
for each row execute function public.native_cross_company_transfer_closure_lock();
revoke all on function public.native_cross_company_transfer_period_lock(uuid,text,text),
  public.native_cross_company_transfer_closure_lock() from public,anon,authenticated,service_role;

create function public.native_cross_company_transfer_snapshot(
  p_tenant_id uuid,p_company_id text,p_effective_date date,p_lines jsonb,p_side text
) returns text language sql stable set search_path=public as $$
  select encode(extensions.digest(jsonb_build_object(
    'companyId',p_company_id,'effectiveDate',p_effective_date,
    'periodClosed',exists(select 1 from public.shared_inventory_closures c where c.tenant_id=p_tenant_id
      and c.company_id=p_company_id and c.period=to_char(p_effective_date,'YYYY-MM')),
    'products',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'stock',p.current_stock,'cost',p.average_cost,'unit',p.measure_unit,
      'valuation',p.valuation_method,'composition',p.composition_kind,'active',p.active,
      'updatedAt',p.updated_at) order by p.id)
      from public.shared_inventory_products p
      join jsonb_to_recordset(p_lines) as l("sourceProductId" text,"destinationProductId" text)
        on p.id=case when p_side='source' then l."sourceProductId" else l."destinationProductId" end
      where p.tenant_id=p_tenant_id and p.company_id=p_company_id),'[]'::jsonb)
    )::text,'sha256'),'hex')
$$;
revoke all on function public.native_cross_company_transfer_snapshot(uuid,text,date,jsonb,text)
  from public,anon,authenticated,service_role;

create function public.preview_native_cross_company_inventory_transfer(
  p_actor_user_id uuid,p_organization_id uuid,p_source_company_id text,
  p_destination_company_id text,p_effective_date date,p_lines jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid; v_destination_tenant uuid; v_company public.shared_companies%rowtype;
  v_line record; v_source public.shared_inventory_products%rowtype;
  v_destination public.shared_inventory_products%rowtype;
  v_source_ids text[] := '{}'; v_destination_ids text[] := '{}';
begin
  v_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,p_source_company_id,'inventory.read');
  perform public.assert_user_security_access(p_actor_user_id,p_organization_id,p_source_company_id,'inventory.update');
  v_destination_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,p_destination_company_id,'inventory.update');
  if v_tenant is null or v_tenant is distinct from v_destination_tenant
    or p_source_company_id is null or p_destination_company_id is null
    or p_source_company_id=p_destination_company_id or p_effective_date is null
    or p_lines is null or jsonb_typeof(p_lines)<>'array'
    then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_INVALID'; end if;
  if jsonb_array_length(p_lines) not between 1 and 100
    then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_INVALID'; end if;
  for v_company in select * from public.shared_companies c where c.tenant_id=v_tenant
      and c.organization_id=p_organization_id and c.id in (p_source_company_id,p_destination_company_id)
      order by c.id for share
  loop
    if v_company.status<>'active' then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_COMPANY_INVALID'; end if;
  end loop;
  if not exists(select 1 from public.shared_companies c where c.tenant_id=v_tenant
      and c.organization_id=p_organization_id and c.id=p_source_company_id and c.status='active')
    or not exists(select 1 from public.shared_companies c where c.tenant_id=v_tenant
      and c.organization_id=p_organization_id and c.id=p_destination_company_id and c.status='active')
    then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_COMPANY_INVALID'; end if;
  if exists(select 1 from public.shared_inventory_closures c where c.tenant_id=v_tenant
    and c.company_id in (p_source_company_id,p_destination_company_id)
    and c.period=to_char(p_effective_date,'YYYY-MM'))
    then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_PERIOD_CLOSED'; end if;
  for v_line in select * from jsonb_to_recordset(p_lines) as l("sourceProductId" text,"destinationProductId" text,quantity text,unit text)
  loop
    if v_line."sourceProductId" is null or v_line."destinationProductId" is null
      or length(v_line."sourceProductId") not between 1 and 128
      or length(v_line."destinationProductId") not between 1 and 128
      or v_line.quantity is null or v_line.quantity !~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,4})?$'
      or v_line."sourceProductId"=any(v_source_ids)
      or v_line."destinationProductId"=any(v_destination_ids)
      then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_INVALID'; end if;
    if v_line.quantity::numeric<=0 then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_INVALID'; end if;
    v_source_ids := array_append(v_source_ids,v_line."sourceProductId");
    v_destination_ids := array_append(v_destination_ids,v_line."destinationProductId");
    select * into v_source from public.shared_inventory_products
      where tenant_id=v_tenant and company_id=p_source_company_id and id=v_line."sourceProductId";
    select * into v_destination from public.shared_inventory_products
      where tenant_id=v_tenant and company_id=p_destination_company_id and id=v_line."destinationProductId";
    if v_source.id is null or v_destination.id is null or not v_source.active or not v_destination.active
      or v_source.composition_kind<>'simple' or v_destination.composition_kind<>'simple'
      or v_source.valuation_method<>'promedio_ponderado' or v_destination.valuation_method<>'promedio_ponderado'
      or public.native_product_unit(v_source.measure_unit) is distinct from v_line.unit
      or public.native_product_unit(v_destination.measure_unit) is distinct from v_line.unit
      then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_PRODUCT_INVALID'; end if;
    if v_source.current_stock<v_line.quantity::numeric or v_source.average_cost<0
      then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_STOCK_INVALID'; end if;
  end loop;
  return jsonb_build_object(
    'sourceCompanyId',p_source_company_id,'destinationCompanyId',p_destination_company_id,
    'sourceSnapshotToken',public.native_cross_company_transfer_snapshot(v_tenant,p_source_company_id,p_effective_date,p_lines,'source'),
    'destinationSnapshotToken',public.native_cross_company_transfer_snapshot(v_tenant,p_destination_company_id,p_effective_date,p_lines,'destination'));
end;
$$;
revoke all on function public.preview_native_cross_company_inventory_transfer(uuid,uuid,text,text,date,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.preview_native_cross_company_inventory_transfer(uuid,uuid,text,text,date,jsonb)
  to service_role;

create function public.execute_native_cross_company_inventory_transfer(
  p_actor_user_id uuid,p_organization_id uuid,p_source_company_id text,
  p_destination_company_id text,p_effective_date date,p_lines jsonb,
  p_transfer_id text,p_correlation_id text,p_idempotency_key text,p_reference text,p_notes text,
  p_expected_source_snapshot_token text,p_expected_destination_snapshot_token text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid; v_destination_tenant uuid; v_existing public.shared_cross_company_inventory_transfers%rowtype;
  v_intent jsonb; v_hash text; v_preview jsonb; v_period text;
  v_source_operation_id text := gen_random_uuid()::text;
  v_destination_operation_id text := gen_random_uuid()::text;
  v_line record; v_product record; v_source public.shared_inventory_products%rowtype;
  v_source_movement jsonb; v_destination_movement jsonb;
begin
  v_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,p_source_company_id,'inventory.read');
  perform public.assert_user_security_access(p_actor_user_id,p_organization_id,p_source_company_id,'inventory.update');
  v_destination_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,p_destination_company_id,'inventory.update');
  if v_tenant is null or v_tenant is distinct from v_destination_tenant
    or p_transfer_id is null or length(btrim(p_transfer_id)) not between 1 and 128
    or p_correlation_id is null or length(btrim(p_correlation_id)) not between 1 and 128
    or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 128
    or p_reference is not null and length(btrim(p_reference))>160
    or p_notes is not null and length(btrim(p_notes))>2000
    or p_expected_source_snapshot_token is null or p_expected_source_snapshot_token !~ '^[0-9a-f]{64}$'
    or p_expected_destination_snapshot_token is null or p_expected_destination_snapshot_token !~ '^[0-9a-f]{64}$'
    then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_INVALID'; end if;
  v_intent := jsonb_build_object('sourceCompanyId',p_source_company_id,'destinationCompanyId',p_destination_company_id,
    'effectiveDate',p_effective_date,'lines',p_lines,'transferId',btrim(p_transfer_id),
    'correlationId',btrim(p_correlation_id),'reference',nullif(btrim(p_reference),''),
    'notes',nullif(btrim(p_notes),''),'sourceSnapshotToken',p_expected_source_snapshot_token,
    'destinationSnapshotToken',p_expected_destination_snapshot_token);
  v_hash := encode(extensions.digest(v_intent::text,'sha256'),'hex');
  select * into v_existing from public.shared_cross_company_inventory_transfers
    where organization_id=p_organization_id and actor_user_id=p_actor_user_id and idempotency_key=btrim(p_idempotency_key)
    for update;
  if found then
    if v_existing.tenant_id<>v_tenant or v_existing.intent_sha256<>v_hash or v_existing.intent is distinct from v_intent
      then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('transferId',v_existing.id,'sourceCompanyId',v_existing.source_company_id,
      'destinationCompanyId',v_existing.destination_company_id,'sourceOperationId',v_existing.source_operation_id,
      'destinationOperationId',v_existing.destination_operation_id,'replayed',true);
  end if;
  if exists(select 1 from public.shared_cross_company_inventory_transfers where tenant_id=v_tenant and id=btrim(p_transfer_id))
    then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_IDEMPOTENCY_CONFLICT'; end if;
  if p_effective_date is null or p_source_company_id=p_destination_company_id
    or p_lines is null or jsonb_typeof(p_lines)<>'array'
    then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_INVALID'; end if;
  if jsonb_array_length(p_lines) not between 1 and 100
    then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_INVALID'; end if;
  v_period := to_char(p_effective_date,'YYYY-MM');
  if p_source_company_id<p_destination_company_id then
    perform public.native_cross_company_transfer_period_lock(v_tenant,p_source_company_id,v_period);
    perform public.native_cross_company_transfer_period_lock(v_tenant,p_destination_company_id,v_period);
  else
    perform public.native_cross_company_transfer_period_lock(v_tenant,p_destination_company_id,v_period);
    perform public.native_cross_company_transfer_period_lock(v_tenant,p_source_company_id,v_period);
  end if;
  -- Lock all mapped rows before comparing the preview and before any legacy writer can change stock.
  for v_product in
    select p.tenant_id,p.id from public.shared_inventory_products p
    join (select p_source_company_id company_id,l."sourceProductId" product_id from jsonb_to_recordset(p_lines)
        as l("sourceProductId" text,"destinationProductId" text)
      union all select p_destination_company_id,l."destinationProductId" from jsonb_to_recordset(p_lines)
        as l("sourceProductId" text,"destinationProductId" text)) x
      on x.company_id=p.company_id and x.product_id=p.id
    where p.tenant_id=v_tenant order by p.id for update of p
  loop null; end loop;
  v_preview := public.preview_native_cross_company_inventory_transfer(p_actor_user_id,p_organization_id,
    p_source_company_id,p_destination_company_id,p_effective_date,p_lines);
  if v_preview->>'sourceSnapshotToken' is distinct from p_expected_source_snapshot_token
    or v_preview->>'destinationSnapshotToken' is distinct from p_expected_destination_snapshot_token
    then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_SNAPSHOT_CONFLICT'; end if;

  insert into public.shared_inventory_operations(tenant_id,id,company_id,reason,effective_date,status,source_kind,
    source_document_id,reference,notes,version,posted_at,created_by)
  values(v_tenant,v_source_operation_id,p_source_company_id,'transfer',p_effective_date,'posted','inventory',
    btrim(p_transfer_id),nullif(btrim(p_reference),''),nullif(btrim(p_notes),''),1,clock_timestamp(),p_actor_user_id),
    (v_tenant,v_destination_operation_id,p_destination_company_id,'transfer',p_effective_date,'posted','inventory',
    btrim(p_transfer_id),nullif(btrim(p_reference),''),nullif(btrim(p_notes),''),1,clock_timestamp(),p_actor_user_id);
  for v_line in select * from jsonb_to_recordset(p_lines)
      as l("sourceProductId" text,"destinationProductId" text,quantity text,unit text)
      order by l."sourceProductId",l."destinationProductId"
  loop
    select * into v_source from public.shared_inventory_products where tenant_id=v_tenant
      and company_id=p_source_company_id and id=v_line."sourceProductId" for update;
    if v_source.current_stock<v_line.quantity::numeric then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_STOCK_INVALID'; end if;
    v_source_movement := public.shared_inventory_movement_save(v_tenant,jsonb_build_object(
      'empresa_id',p_source_company_id,'producto_id',v_line."sourceProductId",'tipo','ajuste_negativo',
      'fecha',p_effective_date,'cantidad',v_line.quantity,'costo_unitario',v_source.average_cost,
      'moneda','VES','referencia',coalesce(p_reference,'')||' ['||p_transfer_id||']','notas',coalesce(p_notes,'')));
    v_destination_movement := public.shared_inventory_movement_save(v_tenant,jsonb_build_object(
      'empresa_id',p_destination_company_id,'producto_id',v_line."destinationProductId",'tipo','ajuste_positivo',
      'fecha',p_effective_date,'cantidad',v_line.quantity,'costo_unitario',v_source_movement->>'unit_cost',
      'moneda','VES','referencia',coalesce(p_reference,'')||' ['||p_transfer_id||']','notas',coalesce(p_notes,'')));
    if (v_source_movement->>'total_cost')::numeric is distinct from (v_destination_movement->>'total_cost')::numeric
      then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_VALUATION_CONFLICT'; end if;
    insert into public.shared_inventory_operation_lines(tenant_id,operation_id,id,product_id,direction,quantity,unit,unit_cost,movement_id)
    values(v_tenant,v_source_operation_id,gen_random_uuid()::text,v_line."sourceProductId",'outbound',v_line.quantity::numeric,
      v_line.unit,(v_source_movement->>'unit_cost')::numeric,v_source_movement->>'id'),
      (v_tenant,v_destination_operation_id,gen_random_uuid()::text,v_line."destinationProductId",'inbound',v_line.quantity::numeric,
      v_line.unit,(v_destination_movement->>'unit_cost')::numeric,v_destination_movement->>'id');
  end loop;
  insert into public.shared_cross_company_inventory_transfers(id,tenant_id,organization_id,actor_user_id,
    source_company_id,destination_company_id,effective_date,correlation_id,idempotency_key,intent,intent_sha256,
    source_operation_id,destination_operation_id)
  values(btrim(p_transfer_id),v_tenant,p_organization_id,p_actor_user_id,p_source_company_id,p_destination_company_id,
    p_effective_date,btrim(p_correlation_id),btrim(p_idempotency_key),v_intent,v_hash,v_source_operation_id,v_destination_operation_id);
  return jsonb_build_object('transferId',btrim(p_transfer_id),'sourceCompanyId',p_source_company_id,
    'destinationCompanyId',p_destination_company_id,'sourceOperationId',v_source_operation_id,
    'destinationOperationId',v_destination_operation_id,'replayed',false);
exception when unique_violation then raise exception 'INVENTORY_CROSS_COMPANY_TRANSFER_IDEMPOTENCY_CONFLICT';
end;
$$;
revoke all on function public.execute_native_cross_company_inventory_transfer(uuid,uuid,text,text,date,jsonb,text,text,text,text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.execute_native_cross_company_inventory_transfer(uuid,uuid,text,text,date,jsonb,text,text,text,text,text,text,text)
  to service_role;
