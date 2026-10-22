-- Reversible ADM-015 physical compensation smoke. No stock or receipt persists.
begin;
set local role service_role;
do $smoke$
declare
  f record;
  k text := replace(gen_random_uuid()::text,'-','');
  lines jsonb; preview jsonb; original jsonb; compensation_preview jsonb;
  compensated jsonb; replay jsonb;
begin
  select c1.tenant_id,c1.organization_id,c1.id source_company,c2.id destination_company,
    p1.id source_product,p2.id destination_product,p1.current_stock source_stock,
    p2.current_stock destination_stock,public.native_product_unit(p1.measure_unit) unit,m.user_id actor
    into f
  from public.shared_companies c1
  join public.shared_companies c2 on c2.organization_id=c1.organization_id and c2.tenant_id=c1.tenant_id
    and c2.id<>c1.id and c2.status='active'
  join public.shared_inventory_products p1 on p1.tenant_id=c1.tenant_id and p1.company_id=c1.id
    and p1.active and p1.composition_kind='simple' and p1.valuation_method='promedio_ponderado'
    and p1.current_stock>=1
  join public.shared_inventory_products p2 on p2.tenant_id=c2.tenant_id and p2.company_id=c2.id
    and p2.active and p2.composition_kind='simple' and p2.valuation_method='promedio_ponderado'
    and public.native_product_unit(p2.measure_unit)=public.native_product_unit(p1.measure_unit)
    and p2.current_stock<1000000000
  join public.organization_memberships m on m.organization_id=c1.organization_id and m.status='active'
  join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.status='active'
  where c1.status='active'
    and exists(select 1 from public.organization_role_permissions q where q.role_id=r.id and q.permission_code='inventory.read')
    and exists(select 1 from public.organization_role_permissions q where q.role_id=r.id and q.permission_code='inventory.update')
    and not exists(select 1 from public.shared_inventory_closures z where z.tenant_id=c1.tenant_id
      and z.company_id in (c1.id,c2.id) and z.period=to_char(current_date,'YYYY-MM'))
  limit 1;
  if not found then raise exception 'SMOKE_NO_AUTHORIZED_COMPENSATION_PAIR'; end if;
  lines := jsonb_build_array(jsonb_build_object('sourceProductId',f.source_product,
    'destinationProductId',f.destination_product,'quantity','0.5000','unit',f.unit));
  preview := public.preview_native_cross_company_inventory_transfer(f.actor,f.organization_id,
    f.source_company,f.destination_company,current_date,lines);
  original := public.execute_native_cross_company_inventory_transfer(f.actor,f.organization_id,
    f.source_company,f.destination_company,current_date,lines,
    'adm015-original-'||k,'adm015-correlation-'||k,'adm015-original-key-'||k,
    'ADM-015 compensation smoke',null,preview->>'sourceSnapshotToken',preview->>'destinationSnapshotToken');
  begin
    perform public.preview_native_cross_company_inventory_compensation(f.actor,f.organization_id,
      original->>'transferId',current_date-1);
    raise exception 'SMOKE_EXPECTED_EARLIER_DATE_DENIAL';
  exception when raise_exception then
    if sqlerrm<>'INVENTORY_CROSS_COMPANY_COMPENSATION_INVALID' then raise; end if;
  end;
  compensation_preview := public.preview_native_cross_company_inventory_compensation(f.actor,f.organization_id,
    original->>'transferId',current_date);
  if compensation_preview->>'sourceCompanyId'<>f.destination_company
    or compensation_preview->>'destinationCompanyId'<>f.source_company
    or compensation_preview->'lines'->0->>'sourceProductId'<>f.destination_product
    or compensation_preview->'lines'->0->>'destinationProductId'<>f.source_product
    or compensation_preview->'lines'->0->>'quantity'<>'0.5000'
    then raise exception 'SMOKE_REVERSE_MAPPING_INVALID %',compensation_preview; end if;
  compensated := public.execute_native_cross_company_inventory_compensation(f.actor,f.organization_id,
    original->>'transferId',current_date,'adm015-compensation-'||k,'adm015-compensation-key-'||k,
    'Devolución física de prueba',compensation_preview->>'sourceSnapshotToken',
    compensation_preview->>'destinationSnapshotToken');
  if compensated->>'compensationTransferId'<>'adm015-compensation-'||k
    or compensated->>'replayed'<>'false' or compensated->>'sourceOperationId'=compensated->>'destinationOperationId'
    then raise exception 'SMOKE_COMPENSATION_FAILED %',compensated; end if;
  replay := public.execute_native_cross_company_inventory_compensation(f.actor,f.organization_id,
    original->>'transferId',current_date,'adm015-compensation-'||k,'adm015-compensation-key-'||k,
    'Devolución física de prueba',compensation_preview->>'sourceSnapshotToken',
    compensation_preview->>'destinationSnapshotToken');
  if replay->>'replayed'<>'true' or replay->>'sourceOperationId'<>compensated->>'sourceOperationId'
    then raise exception 'SMOKE_COMPENSATION_REPLAY_FAILED'; end if;
  begin
    perform public.preview_native_cross_company_inventory_compensation(f.actor,f.organization_id,
      original->>'transferId',current_date);
    raise exception 'SMOKE_EXPECTED_ALREADY_COMPENSATED';
  exception when raise_exception then
    if sqlerrm<>'INVENTORY_CROSS_COMPANY_COMPENSATION_ALREADY_COMPENSATED' then raise; end if;
  end;
  begin
    perform public.execute_native_cross_company_inventory_compensation(f.actor,f.organization_id,
      original->>'transferId',current_date,'adm015-other-'||k,'adm015-other-key-'||k,
      'another compensation',compensation_preview->>'sourceSnapshotToken',
      compensation_preview->>'destinationSnapshotToken');
    raise exception 'SMOKE_EXPECTED_SECOND_COMPENSATION_DENIAL';
  exception when raise_exception then
    if sqlerrm<>'INVENTORY_CROSS_COMPANY_COMPENSATION_ALREADY_COMPENSATED' then raise; end if;
  end;
  perform set_config('kontave.adm015_comp_original',original->>'transferId',true);
  perform set_config('kontave.adm015_comp_new',compensated->>'compensationTransferId',true);
  perform set_config('kontave.adm015_comp_tenant',f.tenant_id::text,true);
  perform set_config('kontave.adm015_comp_source',f.source_product,true);
  perform set_config('kontave.adm015_comp_destination',f.destination_product,true);
  perform set_config('kontave.adm015_comp_source_stock',f.source_stock::text,true);
  perform set_config('kontave.adm015_comp_destination_stock',f.destination_stock::text,true);
end
$smoke$;
reset role;
do $audit$
declare
  c public.shared_cross_company_inventory_compensations%rowtype;
  o public.shared_cross_company_inventory_transfers%rowtype;
  t public.shared_cross_company_inventory_transfers%rowtype;
  source_cost numeric; destination_cost numeric;
begin
  select * into c from public.shared_cross_company_inventory_compensations
    where tenant_id=current_setting('kontave.adm015_comp_tenant')::uuid
      and original_transfer_id=current_setting('kontave.adm015_comp_original');
  if not found then raise exception 'SMOKE_COMPENSATION_LINK_MISSING'; end if;
  select * into o from public.shared_cross_company_inventory_transfers where tenant_id=c.tenant_id and id=c.original_transfer_id;
  select * into t from public.shared_cross_company_inventory_transfers where tenant_id=c.tenant_id and id=c.compensation_transfer_id;
  if t.source_company_id<>o.destination_company_id or t.destination_company_id<>o.source_company_id
    then raise exception 'SMOKE_COMPENSATION_DIRECTION_INVALID'; end if;
  if (select current_stock from public.shared_inventory_products where tenant_id=c.tenant_id
      and id=current_setting('kontave.adm015_comp_source'))<>current_setting('kontave.adm015_comp_source_stock')::numeric
    or (select current_stock from public.shared_inventory_products where tenant_id=c.tenant_id
      and id=current_setting('kontave.adm015_comp_destination'))<>current_setting('kontave.adm015_comp_destination_stock')::numeric
    then raise exception 'SMOKE_COMPENSATED_STOCK_INVALID'; end if;
  select coalesce(sum(m.total_cost),0) into source_cost from public.shared_inventory_operation_lines l
    join public.shared_inventory_movements m on m.tenant_id=l.tenant_id and m.id=l.movement_id
    where l.tenant_id=c.tenant_id and l.operation_id=t.source_operation_id;
  select coalesce(sum(m.total_cost),0) into destination_cost from public.shared_inventory_operation_lines l
    join public.shared_inventory_movements m on m.tenant_id=l.tenant_id and m.id=l.movement_id
    where l.tenant_id=c.tenant_id and l.operation_id=t.destination_operation_id;
  if source_cost<>destination_cost then raise exception 'SMOKE_COMPENSATION_COST_UNBALANCED'; end if;
  begin
    delete from public.shared_cross_company_inventory_compensations where id=c.id;
    raise exception 'SMOKE_EXPECTED_COMPENSATION_IMMUTABLE';
  exception when raise_exception then
    if sqlerrm<>'INVENTORY_CROSS_COMPANY_TRANSFER_IMMUTABLE' then raise; end if;
  end;
end
$audit$;
rollback;
