-- Reversible ADM-015 smoke. All stock, operations, movements and fixtures roll back.
begin;
set local role service_role;
do $smoke$
declare
  f record;
  k text := replace(gen_random_uuid()::text,'-','');
  lines jsonb;
  preview jsonb;
  result jsonb;
  replay jsonb;
begin
  select c1.tenant_id,c1.organization_id,c1.id source_company,c2.id destination_company,
    p1.id source_product,p2.id destination_product,
    p1.current_stock source_stock,p2.current_stock destination_stock,
    public.native_product_unit(p1.measure_unit) unit,m.user_id actor
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
  if not found then raise exception 'SMOKE_NO_AUTHORIZED_COMPANY_PAIR'; end if;
  lines := jsonb_build_array(jsonb_build_object('sourceProductId',f.source_product,
    'destinationProductId',f.destination_product,'quantity','0.5000','unit',f.unit));
  begin
    perform public.preview_native_cross_company_inventory_transfer(gen_random_uuid(),f.organization_id,
      f.source_company,f.destination_company,current_date,lines);
    raise exception 'SMOKE_EXPECTED_ACCESS_DENIED';
  exception when raise_exception then
    if sqlerrm<>'ORGANIZATIONAL_USER_ACCESS_DENIED' then raise; end if;
  end;
  preview := public.preview_native_cross_company_inventory_transfer(f.actor,f.organization_id,
    f.source_company,f.destination_company,current_date,lines);
  if preview->>'sourceCompanyId'<>f.source_company or preview->>'destinationCompanyId'<>f.destination_company
    or preview->>'sourceSnapshotToken' !~ '^[0-9a-f]{64}$'
    or preview->>'destinationSnapshotToken' !~ '^[0-9a-f]{64}$'
    then raise exception 'SMOKE_PREVIEW_FAILED %',preview; end if;
  if (public.preview_native_cross_company_inventory_transfer(f.actor,f.organization_id,
      f.source_company,f.destination_company,current_date,
      jsonb_build_array(jsonb_build_object('sourceProductId',f.source_product,
        'destinationProductId',f.destination_product,'quantity','0.2500','unit',f.unit)))
      ->>'sourceSnapshotToken')=preview->>'sourceSnapshotToken'
    then raise exception 'SMOKE_LINE_INTENT_NOT_IN_SNAPSHOT'; end if;
  result := public.execute_native_cross_company_inventory_transfer(f.actor,f.organization_id,
    f.source_company,f.destination_company,current_date,lines,
    'adm015-transfer-'||k,'adm015-correlation-'||k,'adm015-key-'||k,
    'ADM-015 reversible smoke',null,preview->>'sourceSnapshotToken',preview->>'destinationSnapshotToken');
  if result->>'transferId'<>'adm015-transfer-'||k or result->>'replayed'<>'false'
    or result->>'sourceOperationId'=result->>'destinationOperationId'
    then raise exception 'SMOKE_EXECUTE_FAILED %',result; end if;
  replay := public.execute_native_cross_company_inventory_transfer(f.actor,f.organization_id,
    f.source_company,f.destination_company,current_date,lines,
    'adm015-transfer-'||k,'adm015-correlation-'||k,'adm015-key-'||k,
    'ADM-015 reversible smoke',null,preview->>'sourceSnapshotToken',preview->>'destinationSnapshotToken');
  if replay->>'replayed'<>'true' or replay->>'sourceOperationId'<>result->>'sourceOperationId'
    then raise exception 'SMOKE_REPLAY_FAILED'; end if;
  begin
    perform public.reverse_native_inventory_operation(f.actor,f.organization_id,f.source_company,
      result->>'sourceOperationId',1,current_date,'unilateral reversal must fail');
    raise exception 'SMOKE_EXPECTED_UNILATERAL_REVERSAL_DENIAL';
  exception when raise_exception then
    if sqlerrm<>'INVENTORY_CROSS_COMPANY_TRANSFER_IMMUTABLE' then raise; end if;
  end;
  begin
    perform public.execute_native_cross_company_inventory_transfer(f.actor,f.organization_id,
      f.source_company,f.destination_company,current_date,lines,
      'adm015-transfer-'||k,'adm015-correlation-'||k,'adm015-key-'||k,
      'changed reference',null,preview->>'sourceSnapshotToken',preview->>'destinationSnapshotToken');
    raise exception 'SMOKE_EXPECTED_IDEMPOTENCY_CONFLICT';
  exception when raise_exception then
    if sqlerrm<>'INVENTORY_CROSS_COMPANY_TRANSFER_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
  begin
    perform public.execute_native_cross_company_inventory_transfer(f.actor,f.organization_id,
      f.source_company,f.destination_company,current_date,lines,
      'adm015-stale-'||k,'adm015-correlation-'||k,'adm015-stale-key-'||k,
      null,null,preview->>'sourceSnapshotToken',preview->>'destinationSnapshotToken');
    raise exception 'SMOKE_EXPECTED_SNAPSHOT_CONFLICT';
  exception when raise_exception then
    if sqlerrm<>'INVENTORY_CROSS_COMPANY_TRANSFER_SNAPSHOT_CONFLICT' then raise; end if;
  end;
  begin
    perform public.preview_native_cross_company_inventory_transfer(f.actor,f.organization_id,
      f.source_company,f.destination_company,current_date,
      jsonb_build_array(jsonb_build_object('sourceProductId',f.source_product,
        'destinationProductId',f.destination_product,'quantity','9999999999.0000','unit',f.unit)));
    raise exception 'SMOKE_EXPECTED_STOCK_REJECTION';
  exception when raise_exception then
    if sqlerrm<>'INVENTORY_CROSS_COMPANY_TRANSFER_STOCK_INVALID' then raise; end if;
  end;
  perform set_config('kontave.adm015_transfer_id','adm015-transfer-'||k,true);
  perform set_config('kontave.adm015_tenant_id',f.tenant_id::text,true);
  perform set_config('kontave.adm015_source_product',f.source_product,true);
  perform set_config('kontave.adm015_destination_product',f.destination_product,true);
  perform set_config('kontave.adm015_source_stock',f.source_stock::text,true);
  perform set_config('kontave.adm015_destination_stock',f.destination_stock::text,true);
  perform set_config('kontave.adm015_source_company',f.source_company,true);
  perform set_config('kontave.adm015_destination_company',f.destination_company,true);
  perform set_config('kontave.adm015_actor',f.actor::text,true);
  perform set_config('kontave.adm015_org',f.organization_id::text,true);
end
$smoke$;
reset role;
do $audit$
declare
  t public.shared_cross_company_inventory_transfers%rowtype;
  source_lines integer; destination_lines integer;
  source_cost numeric; destination_cost numeric;
begin
  select * into t from public.shared_cross_company_inventory_transfers
    where tenant_id=current_setting('kontave.adm015_tenant_id')::uuid
      and id=current_setting('kontave.adm015_transfer_id');
  if not found then raise exception 'SMOKE_RECEIPT_MISSING'; end if;
  select count(*),coalesce(sum(m.total_cost),0) into source_lines,source_cost
    from public.shared_inventory_operation_lines l join public.shared_inventory_movements m
      on m.tenant_id=l.tenant_id and m.id=l.movement_id
    where l.tenant_id=t.tenant_id and l.operation_id=t.source_operation_id and l.direction='outbound';
  select count(*),coalesce(sum(m.total_cost),0) into destination_lines,destination_cost
    from public.shared_inventory_operation_lines l join public.shared_inventory_movements m
      on m.tenant_id=l.tenant_id and m.id=l.movement_id
    where l.tenant_id=t.tenant_id and l.operation_id=t.destination_operation_id and l.direction='inbound';
  if source_lines<>1 or destination_lines<>1 or source_cost<>destination_cost
    then raise exception 'SMOKE_PAIRED_COST_INVALID'; end if;
  if (select current_stock from public.shared_inventory_products where tenant_id=t.tenant_id
      and company_id=t.source_company_id and id=current_setting('kontave.adm015_source_product'))
      <> current_setting('kontave.adm015_source_stock')::numeric-0.5
    or (select current_stock from public.shared_inventory_products where tenant_id=t.tenant_id
      and company_id=t.destination_company_id and id=current_setting('kontave.adm015_destination_product'))
      <> current_setting('kontave.adm015_destination_stock')::numeric+0.5
    then raise exception 'SMOKE_STOCK_DELTA_INVALID'; end if;
  begin
    update public.shared_inventory_operations set status='reversed' where tenant_id=t.tenant_id and id=t.source_operation_id;
    raise exception 'SMOKE_EXPECTED_OPERATION_IMMUTABLE';
  exception when raise_exception then
    if sqlerrm<>'INVENTORY_CROSS_COMPANY_TRANSFER_IMMUTABLE' then raise; end if;
  end;
  begin
    update public.shared_inventory_movements set notes='changed' where tenant_id=t.tenant_id and id=(
      select movement_id from public.shared_inventory_operation_lines where tenant_id=t.tenant_id
        and operation_id=t.source_operation_id limit 1);
    raise exception 'SMOKE_EXPECTED_MOVEMENT_IMMUTABLE';
  exception when raise_exception then
    if sqlerrm<>'INVENTORY_CROSS_COMPANY_TRANSFER_IMMUTABLE' then raise; end if;
  end;
  insert into public.shared_inventory_closures(tenant_id,id,company_id,period,closed_at,notes)
    values(t.tenant_id,gen_random_uuid()::text,t.source_company_id,to_char(current_date,'YYYY-MM'),clock_timestamp(),'ADM-015 smoke');
end
$audit$;
set local role service_role;
do $closed$
begin
  begin
    perform public.preview_native_cross_company_inventory_transfer(
      current_setting('kontave.adm015_actor')::uuid,current_setting('kontave.adm015_org')::uuid,
      current_setting('kontave.adm015_source_company'),current_setting('kontave.adm015_destination_company'),
      current_date,jsonb_build_array(jsonb_build_object('sourceProductId',current_setting('kontave.adm015_source_product'),
        'destinationProductId',current_setting('kontave.adm015_destination_product'),'quantity','0.1000','unit','each')));
    raise exception 'SMOKE_EXPECTED_CLOSED_PERIOD';
  exception when raise_exception then
    if sqlerrm<>'INVENTORY_CROSS_COMPANY_TRANSFER_PERIOD_CLOSED' then raise; end if;
  end;
end
$closed$;
rollback;
