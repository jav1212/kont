-- Execute as one statement through MCP. Every fixture and movement is rolled back.
begin;
do $$
declare
  v_tenant uuid; v_org uuid; v_actor uuid; v_company text; v_product text;
  v_stock numeric(14,4); v_stock_revision bigint;
  v_branch_a uuid; v_branch_b uuid; v_first numeric(14,4);
  v_lines jsonb; v_result jsonb; v_denied boolean;
begin
  select p.tenant_id,c.organization_id,m.user_id,p.company_id,p.id,
    p.current_stock,p.stock_revision
  into v_tenant,v_org,v_actor,v_company,v_product,v_stock,v_stock_revision
  from public.shared_inventory_products p
  join public.shared_companies c on c.tenant_id=p.tenant_id and c.id=p.company_id
    and c.status='active'
  join public.organization_memberships m on m.organization_id=c.organization_id and m.status='active'
  join public.organization_roles r on r.id=m.role_id and r.status='active'
  join public.organization_role_permissions rp1 on rp1.role_id=r.id and rp1.permission_code='inventory.read'
  join public.organization_role_permissions rp2 on rp2.role_id=r.id and rp2.permission_code='inventory.update'
  join public.organization_role_permissions rp3 on rp3.role_id=r.id and rp3.permission_code='branches.select_any'
  where p.current_stock between 2 and 100 and p.composition_kind='simple'
    and public.company_branch_user_can_select_any(m.user_id,c.organization_id)
    and not exists (select 1 from public.shared_inventory_branch_opening_plans x
      where x.tenant_id=p.tenant_id and x.company_id=p.company_id and x.product_id=p.id)
  order by p.id limit 1;
  if v_product is null then raise exception 'SMOKE_NO_ELIGIBLE_PRODUCT'; end if;

  insert into public.shared_company_branches(tenant_id,organization_id,company_id,code,name,created_by)
  values(v_tenant,v_org,v_company,'SMOKE-'||upper(substr(gen_random_uuid()::text,1,8)),
    'Temporary opening branch A',v_actor) returning id into v_branch_a;
  insert into public.shared_company_branches(tenant_id,organization_id,company_id,code,name,created_by)
  values(v_tenant,v_org,v_company,'SMOKE-'||upper(substr(gen_random_uuid()::text,1,8)),
    'Temporary opening branch B',v_actor) returning id into v_branch_b;
  v_first := trunc(v_stock/2,4);
  v_lines := jsonb_build_array(
    jsonb_build_object('branchId',v_branch_a,'quantity',v_first::text),
    jsonb_build_object('branchId',v_branch_b,'quantity',(v_stock-v_first)::text));

  v_result := public.get_native_inventory_branch_opening_plan(v_actor,v_org,v_company,v_product);
  if v_result->'plan' <> 'null'::jsonb or (v_result->>'stockRevision')::bigint<>v_stock_revision then
    raise exception 'SMOKE_INITIAL_READ_FAILED';
  end if;
  v_result := public.replace_native_inventory_branch_opening_plan(
    v_actor,v_org,v_company,v_product,v_stock_revision,0,v_lines);
  if (v_result->'plan'->>'revision')::integer<>1
    or (v_result->'plan'->>'totalAllocated')::numeric<>v_stock
    or jsonb_array_length(v_result->'plan'->'lines')<>2
    or (v_result->'plan'->>'stale')::boolean then
    raise exception 'SMOKE_CREATE_FAILED';
  end if;

  v_denied := false;
  begin
    perform public.replace_native_inventory_branch_opening_plan(
      v_actor,v_org,v_company,v_product,v_stock_revision,0,v_lines);
  exception when others then
    if sqlerrm <> 'INVENTORY_BRANCH_OPENING_PLAN_CONFLICT' then raise; end if;
    v_denied := true;
  end;
  if not v_denied then raise exception 'SMOKE_PLAN_CONFLICT_MISSING'; end if;

  v_denied := false;
  begin
    perform public.replace_native_inventory_branch_opening_plan(
      v_actor,v_org,v_company,v_product,v_stock_revision,1,
      jsonb_build_array(jsonb_build_object('branchId',v_branch_a,'quantity','1')));
  exception when others then
    if sqlerrm <> 'INVENTORY_BRANCH_OPENING_SUM_MISMATCH' then raise; end if;
    v_denied := true;
  end;
  if not v_denied then raise exception 'SMOKE_SUM_GUARD_MISSING'; end if;

  v_denied := false;
  begin
    perform public.replace_native_inventory_branch_opening_plan(
      v_actor,v_org,v_company,v_product,v_stock_revision,1,
      jsonb_build_array(
        jsonb_build_object('branchId',v_branch_a,'quantity',v_first::text),
        jsonb_build_object('branchId',v_branch_a,'quantity',(v_stock-v_first)::text)));
  exception when others then
    if sqlerrm <> 'INVENTORY_BRANCH_OPENING_INVALID' then raise; end if;
    v_denied := true;
  end;
  if not v_denied then raise exception 'SMOKE_DUPLICATE_BRANCH_GUARD_MISSING'; end if;

  v_denied := false;
  begin
    update public.shared_inventory_products set stock_revision=stock_revision+1
    where tenant_id=v_tenant and company_id=v_company and id=v_product;
  exception when others then
    if sqlerrm <> 'INVENTORY_STOCK_REVISION_MANAGED' then raise; end if;
    v_denied := true;
  end;
  if not v_denied then raise exception 'SMOKE_STOCK_REVISION_GUARD_MISSING'; end if;

  perform public.shared_inventory_movement_save(v_tenant,jsonb_build_object(
    'empresa_id',v_company,'producto_id',v_product,'tipo','entrada',
    'cantidad','1','costo_unitario','0','moneda','VES'));
  v_result := public.get_native_inventory_branch_opening_plan(v_actor,v_org,v_company,v_product);
  if (v_result->>'stockRevision')::bigint<>v_stock_revision+1
    or (v_result->>'companyStock')::numeric<>v_stock+1
    or not (v_result->'plan'->>'stale')::boolean then
    raise exception 'SMOKE_STALE_PLAN_NOT_DETECTED';
  end if;
  v_denied := false;
  begin
    perform public.replace_native_inventory_branch_opening_plan(
      v_actor,v_org,v_company,v_product,v_stock_revision,1,v_lines);
  exception when others then
    if sqlerrm <> 'INVENTORY_BRANCH_OPENING_STOCK_CONFLICT' then raise; end if;
    v_denied := true;
  end;
  if not v_denied then raise exception 'SMOKE_STOCK_CONFLICT_MISSING'; end if;

  if (select count(*) from public.shared_inventory_branch_opening_events
      where product_id=v_product and company_id=v_company and tenant_id=v_tenant) <> 1 then
    raise exception 'SMOKE_EVENT_COUNT_FAILED';
  end if;
end $$;
rollback;
