-- Execute as one statement through MCP; every fixture and stock change rolls back.
begin isolation level repeatable read;
do $$
declare
  v_tenant uuid; v_org uuid; v_actor uuid; v_company text; v_product text;
  v_unit text; v_branch uuid; v_move jsonb; v_id text;
  v_preview jsonb; v_result jsonb; v_replay jsonb; v_report jsonb;
  v_readiness_before jsonb; v_readiness_after jsonb;
  v_key text := gen_random_uuid()::text; v_denied boolean;
begin
  select p.tenant_id,c.organization_id,m.user_id,p.company_id,p.id,p.measure_unit
  into v_tenant,v_org,v_actor,v_company,v_product,v_unit
  from public.shared_inventory_products p
  join public.shared_companies c on c.tenant_id=p.tenant_id and c.id=p.company_id
    and c.status='active'
  join public.organization_memberships m on m.organization_id=c.organization_id and m.status='active'
  join public.organization_roles r on r.id=m.role_id and r.status='active'
  join public.organization_role_permissions rp1 on rp1.role_id=r.id and rp1.permission_code='inventory.update'
  join public.organization_role_permissions rp2 on rp2.role_id=r.id and rp2.permission_code='inventory.read'
  join public.organization_role_permissions rp3 on rp3.role_id=r.id and rp3.permission_code='branches.select_any'
  join public.organization_role_permissions rp4 on rp4.role_id=r.id and rp4.permission_code='branches.consolidate'
  where p.active and p.composition_kind='simple'
    and public.company_branch_user_can_select_any(m.user_id,c.organization_id)
  order by p.id limit 1;
  if v_product is null then raise exception 'SMOKE_NO_ELIGIBLE_PRODUCT'; end if;

  insert into public.shared_company_branches(
    tenant_id,organization_id,company_id,code,name,created_by)
  values(v_tenant,v_org,v_company,'SMOKE-'||upper(substr(gen_random_uuid()::text,1,8)),
    'Temporary historical attribution branch',v_actor)
  returning id into v_branch;
  v_move := public.shared_inventory_movement_save(v_tenant,jsonb_build_object(
    'empresa_id',v_company,'producto_id',v_product,'tipo','ajuste_positivo',
    'fecha',current_date,'cantidad','1','costo_unitario','0',
    'moneda','VES','referencia','historical attribution smoke'));
  v_id := v_move->>'id';
  v_preview := public.get_native_inventory_historical_movement_attribution_candidate(
    v_actor,v_org,v_company,v_id);
  if v_preview->>'movementId'<>v_id or v_preview->>'unit'<>v_unit
    or v_preview->>'attributedBranchId' is not null
    or (v_preview->>'fingerprint') !~ '^[0-9a-f]{64}$' then
    raise exception 'SMOKE_PREVIEW_FAILED';
  end if;
  v_readiness_before := public.get_native_inventory_branch_stock_readiness(
    v_actor,v_org,v_company,25);

  v_denied := false;
  begin
    perform public.attribute_native_inventory_historical_movement(
      v_actor,v_org,v_company,v_id,v_branch,repeat('0',64),
      'Reviewed inventory evidence',gen_random_uuid()::text);
  exception when others then
    if sqlerrm<>'INVENTORY_BRANCH_ATTRIBUTION_STALE' then raise; end if;
    v_denied := true;
  end;
  if not v_denied then raise exception 'SMOKE_STALE_GUARD_MISSING'; end if;

  v_result := public.attribute_native_inventory_historical_movement(
    v_actor,v_org,v_company,v_id,v_branch,v_preview->>'fingerprint',
    'Reviewed inventory evidence',v_key);
  if v_result->>'branchId'<>v_branch::text
    or v_result->>'movementId'<>v_id or v_result->>'unit'<>v_unit
    or v_result->>'attributedBy'<>v_actor::text
    or (select attribution_origin from public.shared_inventory_manual_branch_movements
      where tenant_id=v_tenant and movement_id=v_id)<>'historical_review' then
    raise exception 'SMOKE_ATTRIBUTION_FAILED';
  end if;
  v_replay := public.attribute_native_inventory_historical_movement(
    v_actor,v_org,v_company,v_id,v_branch,v_preview->>'fingerprint',
    'Reviewed inventory evidence',v_key);
  if v_replay is distinct from v_result then raise exception 'SMOKE_REPLAY_FAILED'; end if;
  v_readiness_after := public.get_native_inventory_branch_stock_readiness(
    v_actor,v_org,v_company,25);
  if (v_readiness_after->>'attributedMovementCount')::bigint
      <> (v_readiness_before->>'attributedMovementCount')::bigint + 1
    or (v_readiness_after->>'unlinkedMovementCount')::bigint
      <> (v_readiness_before->>'unlinkedMovementCount')::bigint - 1 then
    raise exception 'SMOKE_READINESS_COVERAGE_OVERLAP';
  end if;

  v_denied := false;
  begin
    perform public.attribute_native_inventory_historical_movement(
      v_actor,v_org,v_company,v_id,v_branch,v_preview->>'fingerprint',
      'A different reviewed reason',v_key);
  exception when others then
    if sqlerrm<>'INVENTORY_BRANCH_ATTRIBUTION_IDEMPOTENCY_CONFLICT' then raise; end if;
    v_denied := true;
  end;
  if not v_denied then raise exception 'SMOKE_KEY_CONFLICT_MISSING'; end if;
  v_denied := false;
  begin
    perform public.attribute_native_inventory_historical_movement(
      v_actor,v_org,v_company,v_id,v_branch,v_preview->>'fingerprint',
      'Reviewed inventory evidence',gen_random_uuid()::text);
  exception when others then
    if sqlerrm<>'INVENTORY_BRANCH_ATTRIBUTION_ALREADY_ATTRIBUTED' then raise; end if;
    v_denied := true;
  end;
  if not v_denied then raise exception 'SMOKE_DUPLICATE_ATTRIBUTION_MISSING'; end if;

  v_report := public.get_native_inventory_branch_movement_consolidation(
    v_actor,v_org,v_company,current_date,current_date,array[v_branch]);
  if not exists(select 1 from jsonb_array_elements(v_report->'rows') as item(value)
      where item.value->>'sourceType'='historical' and item.value->>'productId'=v_product
        and item.value->>'branchId'=v_branch::text) then
    raise exception 'SMOKE_HISTORICAL_REPORT_MISSING';
  end if;
  v_denied := false;
  begin
    update public.shared_inventory_movements set quantity=quantity+1
    where tenant_id=v_tenant and id=v_id;
  exception when others then
    if sqlerrm<>'INVENTORY_BRANCH_ATTRIBUTION_SOURCE_IMMUTABLE' then raise; end if;
    v_denied := true;
  end;
  if not v_denied then raise exception 'SMOKE_SOURCE_GUARD_MISSING'; end if;
  if has_function_privilege('anon','public.attribute_native_inventory_historical_movement(uuid,uuid,text,text,uuid,text,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.attribute_native_inventory_historical_movement(uuid,uuid,text,text,uuid,text,text,text)','EXECUTE')
    or not has_function_privilege('service_role','public.attribute_native_inventory_historical_movement(uuid,uuid,text,text,uuid,text,text,text)','EXECUTE') then
    raise exception 'SMOKE_EXECUTE_ACL_FAILED';
  end if;
end $$;
rollback;
