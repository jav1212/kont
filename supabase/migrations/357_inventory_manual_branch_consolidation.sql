-- ADM-012: include explicitly mapped manual movements alongside confirmed purchase/sale sources.
-- Historical standalone movements remain visible as coverage, never assigned by inference.
create or replace function public.get_native_inventory_branch_movement_consolidation(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
  p_from date, p_to date, p_branch_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_branch_tenant uuid;
  v_select_any boolean;
  v_rows jsonb;
  v_attributed_count bigint;
  v_linked_without_branch_count bigint;
  v_unlinked_count bigint;
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 365
    or coalesce(cardinality(p_branch_ids), 0) > 100
    or (p_branch_ids is not null and (
      exists(select 1 from unnest(p_branch_ids) ids(branch_id) where branch_id is null)
      or cardinality(p_branch_ids) <> (select count(distinct ids.branch_id) from unnest(p_branch_ids) ids(branch_id))
    )) then raise exception 'INVENTORY_BRANCH_CONSOLIDATION_INVALID'; end if;

  begin
    v_tenant := public.assert_user_security_access(p_actor_user_id, p_organization_id, p_company_id, 'inventory.read');
  exception when others then
    if sqlerrm in ('ORGANIZATIONAL_USER_ACCESS_DENIED', 'ORGANIZATIONAL_USER_COMPANY_INVALID') then
      raise exception 'INVENTORY_BRANCH_CONSOLIDATION_ACCESS_DENIED';
    end if;
    raise;
  end;
  begin
    v_branch_tenant := public.assert_company_administration_access(p_organization_id, p_actor_user_id, 'branches.consolidate');
  exception when others then
    if sqlerrm in ('COMPANY_ACCESS_DENIED', 'COMPANY_ORGANIZATION_NOT_READY') then
      raise exception 'INVENTORY_BRANCH_CONSOLIDATION_ACCESS_DENIED';
    end if;
    raise;
  end;
  if v_tenant is null or v_tenant is distinct from v_branch_tenant then
    raise exception 'INVENTORY_BRANCH_CONSOLIDATION_ACCESS_DENIED';
  end if;
  v_select_any := public.company_branch_user_can_select_any(p_actor_user_id, p_organization_id);

  if p_branch_ids is not null and exists (
    select 1 from unnest(p_branch_ids) requested(branch_id)
    where not exists (
      select 1 from public.shared_company_branches b
      where b.id = requested.branch_id and b.tenant_id = v_tenant
        and b.organization_id = p_organization_id and b.company_id = p_company_id
        and (v_select_any or exists (
          select 1 from public.shared_company_branch_memberships bm
          where bm.tenant_id = b.tenant_id and bm.organization_id = b.organization_id
            and bm.company_id = b.company_id and bm.branch_id = b.id
            and bm.user_id = p_actor_user_id and bm.status = 'active'
        ))
    )
  ) then raise exception 'INVENTORY_BRANCH_CONSOLIDATION_ACCESS_DENIED'; end if;

  with accessible_branches as (
    select b.id, b.code, b.name from public.shared_company_branches b
    where b.tenant_id = v_tenant and b.organization_id = p_organization_id
      and b.company_id = p_company_id and (p_branch_ids is null or b.id = any(p_branch_ids))
      and (v_select_any or exists (
        select 1 from public.shared_company_branch_memberships bm
        where bm.tenant_id = b.tenant_id and bm.organization_id = b.organization_id
          and bm.company_id = b.company_id and bm.branch_id = b.id
          and bm.user_id = p_actor_user_id and bm.status = 'active'
      ))
  ), grouped as (
    select b.id branch_id, b.code branch_code, b.name branch_name,
      case when m.purchase_invoice_id is not null then 'purchase'
        when m.sales_invoice_id is not null then 'sale' else 'manual' end source_type,
      m.product_id, pr.name product_name, pr.measure_unit,
      m.type movement_type, count(*)::bigint movement_count,
      sum(m.quantity)::text quantity, sum(m.total_cost)::text total_cost_ves
    from public.shared_inventory_movements m
    left join public.shared_inventory_purchase_invoices pi
      on pi.tenant_id = m.tenant_id and pi.company_id = m.company_id
      and pi.id = m.purchase_invoice_id and pi.status = 'confirmada'
    left join public.shared_inventory_sales_invoices si
      on si.tenant_id = m.tenant_id and si.company_id = m.company_id
      and si.id = m.sales_invoice_id and si.status = 'confirmada'
    left join public.shared_inventory_manual_branch_movements mb
      on mb.tenant_id = m.tenant_id and mb.company_id = m.company_id
      and mb.movement_id = m.id
    join accessible_branches b on b.id = coalesce(pi.branch_id, si.branch_id, mb.branch_id)
    join public.shared_inventory_products pr
      on pr.tenant_id = m.tenant_id and pr.company_id = m.company_id and pr.id = m.product_id
    where m.tenant_id = v_tenant and m.company_id = p_company_id
      and m.date between p_from and p_to
      and ((m.purchase_invoice_id is not null and m.sales_invoice_id is null)
        or (m.sales_invoice_id is not null and m.purchase_invoice_id is null)
        or (m.purchase_invoice_id is null and m.sales_invoice_id is null and mb.branch_id is not null))
    group by b.id, b.code, b.name, source_type, m.product_id, pr.name, pr.measure_unit, m.type
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'branchId', branch_id, 'branchCode', branch_code, 'branchName', branch_name,
    'sourceType', source_type, 'productId', product_id, 'productName', product_name,
    'measureUnit', measure_unit, 'movementType', movement_type,
    'movementCount', movement_count, 'quantity', quantity, 'totalCostVes', total_cost_ves
  ) order by branch_code, source_type, product_id, movement_type), '[]'::jsonb)
  into v_rows from grouped;

  with attributed as (
    select m.id, coalesce(pi.branch_id, si.branch_id, mb.branch_id) branch_id
    from public.shared_inventory_movements m
    left join public.shared_inventory_purchase_invoices pi
      on pi.tenant_id = m.tenant_id and pi.company_id = m.company_id
      and pi.id = m.purchase_invoice_id and pi.status = 'confirmada'
    left join public.shared_inventory_sales_invoices si
      on si.tenant_id = m.tenant_id and si.company_id = m.company_id
      and si.id = m.sales_invoice_id and si.status = 'confirmada'
    left join public.shared_inventory_manual_branch_movements mb
      on mb.tenant_id = m.tenant_id and mb.company_id = m.company_id
      and mb.movement_id = m.id
    where m.tenant_id = v_tenant and m.company_id = p_company_id
      and m.date between p_from and p_to
      and ((m.purchase_invoice_id is not null and m.sales_invoice_id is null)
        or (m.sales_invoice_id is not null and m.purchase_invoice_id is null)
        or (m.purchase_invoice_id is null and m.sales_invoice_id is null and mb.branch_id is not null))
  )
  select count(*) into v_attributed_count from attributed a
  join public.shared_company_branches b on b.id = a.branch_id
    and b.tenant_id = v_tenant and b.organization_id = p_organization_id
    and b.company_id = p_company_id
  where (p_branch_ids is null or a.branch_id = any(p_branch_ids))
    and (v_select_any or exists (
      select 1 from public.shared_company_branch_memberships bm
      where bm.tenant_id = b.tenant_id and bm.organization_id = b.organization_id
        and bm.company_id = b.company_id and bm.branch_id = b.id
        and bm.user_id = p_actor_user_id and bm.status = 'active'
    ));

  if v_select_any then
    with movement_sources as (
      select m.purchase_invoice_id, m.sales_invoice_id,
        coalesce(pi.branch_id, si.branch_id, mb.branch_id) branch_id
      from public.shared_inventory_movements m
      left join public.shared_inventory_purchase_invoices pi
        on pi.tenant_id = m.tenant_id and pi.company_id = m.company_id
        and pi.id = m.purchase_invoice_id and pi.status = 'confirmada'
      left join public.shared_inventory_sales_invoices si
        on si.tenant_id = m.tenant_id and si.company_id = m.company_id
        and si.id = m.sales_invoice_id and si.status = 'confirmada'
      left join public.shared_inventory_manual_branch_movements mb
        on mb.tenant_id = m.tenant_id and mb.company_id = m.company_id
        and mb.movement_id = m.id
      where m.tenant_id = v_tenant and m.company_id = p_company_id
        and m.date between p_from and p_to
    )
    select count(*) filter (where (purchase_invoice_id is not null or sales_invoice_id is not null)
        and branch_id is null),
      count(*) filter (where purchase_invoice_id is null and sales_invoice_id is null)
    into v_linked_without_branch_count, v_unlinked_count from movement_sources;
  end if;
  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to), 'rows', v_rows,
    'coverage', jsonb_build_object(
      'attributedMovementCount', v_attributed_count,
      'linkedWithoutBranchMovementCount', case when v_select_any then v_linked_without_branch_count else null end,
      'unlinkedMovementCount', case when v_select_any then v_unlinked_count else null end,
      'includesCompanyWideCoverage', v_select_any
    ), 'generatedAt', clock_timestamp()
  );
end $$;
revoke all on function public.get_native_inventory_branch_movement_consolidation(uuid,uuid,text,date,date,uuid[]) from public,anon,authenticated;
grant execute on function public.get_native_inventory_branch_movement_consolidation(uuid,uuid,text,date,date,uuid[]) to service_role;
