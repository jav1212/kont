-- Execute as one statement through MCP; all inventory and branch fixtures roll back.
begin;
do $$
declare
  v_tenant uuid; v_org uuid; v_actor uuid; v_company text; v_product text;
  v_unit text; v_stock numeric(14,4); v_branch uuid; v_key text;
  v_first jsonb; v_replay jsonb; v_denied boolean; v_movement text;
begin
  select p.tenant_id,c.organization_id,m.user_id,p.company_id,p.id,p.measure_unit,p.current_stock
  into v_tenant,v_org,v_actor,v_company,v_product,v_unit,v_stock
  from public.shared_inventory_products p
  join public.shared_companies c on c.tenant_id=p.tenant_id and c.id=p.company_id
    and c.status='active'
  join public.organization_memberships m on m.organization_id=c.organization_id and m.status='active'
  join public.organization_roles r on r.id=m.role_id and r.status='active'
  join public.organization_role_permissions rp1 on rp1.role_id=r.id and rp1.permission_code='inventory.update'
  join public.organization_role_permissions rp2 on rp2.role_id=r.id and rp2.permission_code='branches.select'
  join public.organization_role_permissions rp3 on rp3.role_id=r.id and rp3.permission_code='inventory.read'
  join public.organization_role_permissions rp4 on rp4.role_id=r.id and rp4.permission_code='branches.consolidate'
  where p.active and p.current_stock between 2 and 100
    and p.composition_kind='simple'
    and public.company_branch_user_can_select_any(m.user_id,c.organization_id)
    and not exists (select 1 from public.shared_inventory_closures cl
      where cl.tenant_id=p.tenant_id and cl.company_id=p.company_id
        and cl.period=to_char(current_date,'YYYY-MM'))
  order by p.id limit 1;
  if v_product is null then raise exception 'SMOKE_NO_ELIGIBLE_PRODUCT'; end if;

  insert into public.shared_company_branches(
    tenant_id,organization_id,company_id,code,name,created_by)
  values(v_tenant,v_org,v_company,'SMOKE-'||upper(substr(gen_random_uuid()::text,1,8)),
    'Temporary manual adjustment branch',v_actor)
  returning id into v_branch;
  v_key := gen_random_uuid()::text;
  v_first := public.record_native_inventory_branch_adjustment(
    v_actor,v_org,v_company,v_branch,v_product,'ajuste_positivo',current_date,
    '1',v_unit,'0','smoke adjustment',v_key);
  v_movement := v_first->>'movementId';
  if v_movement is null or v_first->>'unit'<>v_unit
    or (v_first->>'globalBalance')::numeric<>v_stock+1
    or (select count(*) from public.shared_inventory_manual_branch_movements bm
      where bm.tenant_id=v_tenant and bm.movement_id=v_movement
        and bm.branch_id=v_branch)<>1 then
    raise exception 'SMOKE_MANUAL_BRANCH_WRITE_FAILED';
  end if;
  v_replay := public.record_native_inventory_branch_adjustment(
    v_actor,v_org,v_company,v_branch,v_product,'ajuste_positivo',current_date,
    '1',v_unit,'0','smoke adjustment',v_key);
  if v_replay is distinct from v_first then raise exception 'SMOKE_REPLAY_FAILED'; end if;

  v_replay := public.get_native_inventory_branch_movement_consolidation(
    v_actor,v_org,v_company,current_date,current_date,array[v_branch]);
  if jsonb_array_length(v_replay->'rows')<>1
    or v_replay->'rows'->0->>'sourceType'<>'manual'
    or (v_replay->'coverage'->>'attributedMovementCount')::bigint<>1 then
    raise exception 'SMOKE_MANUAL_CONSOLIDATION_FAILED';
  end if;
  v_replay := public.get_native_inventory_branch_stock_readiness(
    v_actor,v_org,v_company,1);
  if (v_replay->>'attributedMovementCount')::bigint<1 then
    raise exception 'SMOKE_READINESS_COVERAGE_FAILED';
  end if;

  v_denied := false;
  begin
    perform public.record_native_inventory_branch_adjustment(
      v_actor,v_org,v_company,v_branch,v_product,'ajuste_positivo',current_date,
      '2',v_unit,'0','smoke adjustment',v_key);
  exception when others then
    if sqlerrm<>'INVENTORY_BRANCH_ADJUSTMENT_IDEMPOTENCY_CONFLICT' then raise; end if;
    v_denied := true;
  end;
  if not v_denied then raise exception 'SMOKE_IDEMPOTENCY_CONFLICT_MISSING'; end if;

  v_denied := false;
  begin
    perform public.record_native_inventory_branch_adjustment(
      v_actor,v_org,v_company,v_branch,v_product,'ajuste_negativo',current_date,
      (v_stock+2)::text,v_unit,null,'smoke overdraw',gen_random_uuid()::text);
  exception when others then
    if sqlerrm<>'INVENTORY_BRANCH_ADJUSTMENT_STOCK_INSUFFICIENT' then raise; end if;
    v_denied := true;
  end;
  if not v_denied then raise exception 'SMOKE_NEGATIVE_STOCK_GUARD_MISSING'; end if;

  v_replay := public.record_native_inventory_branch_adjustment(
    v_actor,v_org,v_company,v_branch,v_product,'ajuste_negativo',current_date,
    '1',v_unit,null,'smoke outbound',gen_random_uuid()::text);
  if v_replay->>'unit'<>v_unit or (v_replay->>'globalBalance')::numeric<>v_stock
    or v_replay->>'unitCostVes' is null
    or v_replay->>'totalCostVes' is null then
    raise exception 'SMOKE_OUTBOUND_VALUATION_FAILED';
  end if;

  v_denied := false;
  begin
    update public.shared_inventory_manual_branch_movements set branch_id=gen_random_uuid()
    where tenant_id=v_tenant and movement_id=v_movement;
  exception when others then
    if sqlerrm<>'INVENTORY_BRANCH_ADJUSTMENT_MAPPING_IMMUTABLE' then raise; end if;
    v_denied := true;
  end;
  if not v_denied then raise exception 'SMOKE_MAPPING_MUTATION_GUARD_MISSING'; end if;

  insert into public.shared_inventory_closures(
    tenant_id,id,company_id,period,closed_at,notes)
  values(v_tenant,gen_random_uuid()::text,v_company,to_char(current_date,'YYYY-MM'),
    clock_timestamp(),'Temporary smoke closure');
  v_denied := false;
  begin
    perform public.record_native_inventory_branch_adjustment(
      v_actor,v_org,v_company,v_branch,v_product,'autoconsumo',current_date,
      '1',v_unit,null,'smoke closed period',gen_random_uuid()::text);
  exception when others then
    if sqlerrm<>'INVENTORY_BRANCH_ADJUSTMENT_PERIOD_CLOSED' then raise; end if;
    v_denied := true;
  end;
  if not v_denied then raise exception 'SMOKE_CLOSED_PERIOD_GUARD_MISSING'; end if;
end $$;
rollback;
