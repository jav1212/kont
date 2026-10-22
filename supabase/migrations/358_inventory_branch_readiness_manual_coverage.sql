-- ADM-012: include explicitly attributed manual movements in readiness coverage.
-- This diagnostic never allocates historic stock or changes inventory balances.
create or replace function public.get_native_inventory_branch_stock_readiness(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
  p_mismatch_limit integer default 25
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_branch_tenant uuid;
  v_total_products bigint;
  v_nonzero_stock_products bigint;
  v_mismatch_products bigint;
  v_linked_without_branch bigint;
  v_unlinked bigint;
  v_attributed bigint;
  v_unsupported bigint;
  v_branch_count bigint;
  v_mismatches jsonb;
begin
  if p_actor_user_id is null or p_organization_id is null
    or p_company_id is null or btrim(p_company_id) = ''
    or p_mismatch_limit is null or p_mismatch_limit < 1 or p_mismatch_limit > 100 then
    raise exception 'INVENTORY_BRANCH_STOCK_READINESS_INVALID';
  end if;

  begin
    v_tenant := public.assert_user_security_access(
      p_actor_user_id, p_organization_id, p_company_id, 'inventory.read');
  exception when others then
    if sqlerrm in ('ORGANIZATIONAL_USER_ACCESS_DENIED', 'ORGANIZATIONAL_USER_COMPANY_INVALID') then
      raise exception 'INVENTORY_BRANCH_STOCK_READINESS_ACCESS_DENIED';
    end if;
    raise;
  end;
  begin
    v_branch_tenant := public.assert_company_administration_access(
      p_organization_id, p_actor_user_id, 'branches.consolidate');
  exception when others then
    if sqlerrm in ('COMPANY_ACCESS_DENIED', 'COMPANY_ORGANIZATION_NOT_READY') then
      raise exception 'INVENTORY_BRANCH_STOCK_READINESS_ACCESS_DENIED';
    end if;
    raise;
  end;
  if v_tenant is null or v_tenant is distinct from v_branch_tenant
    or not public.company_branch_user_can_select_any(p_actor_user_id, p_organization_id) then
    raise exception 'INVENTORY_BRANCH_STOCK_READINESS_ACCESS_DENIED';
  end if;

  with movement_totals as (
    select m.product_id,
      sum(case
        when m.type in ('entrada', 'ajuste_positivo') then m.quantity
        when m.type in ('salida', 'ajuste_negativo', 'autoconsumo') then -m.quantity
        else 0
      end) as signed_quantity
    from public.shared_inventory_movements m
    where m.tenant_id = v_tenant and m.company_id = p_company_id
    group by m.product_id
  ), reconciled as (
    select p.id, p.code, p.measure_unit, p.current_stock,
      coalesce(mt.signed_quantity, 0) as signed_quantity,
      p.current_stock - coalesce(mt.signed_quantity, 0) as difference
    from public.shared_inventory_products p
    left join movement_totals mt on mt.product_id = p.id
    where p.tenant_id = v_tenant and p.company_id = p_company_id
  )
  select count(*), count(*) filter (where current_stock <> 0),
    count(*) filter (where difference <> 0)
  into v_total_products, v_nonzero_stock_products, v_mismatch_products
  from reconciled;

  with movement_totals as (
    select m.product_id,
      sum(case
        when m.type in ('entrada', 'ajuste_positivo') then m.quantity
        when m.type in ('salida', 'ajuste_negativo', 'autoconsumo') then -m.quantity
        else 0
      end) as signed_quantity
    from public.shared_inventory_movements m
    where m.tenant_id = v_tenant and m.company_id = p_company_id
    group by m.product_id
  ), mismatches as (
    select p.id, p.code, p.measure_unit, p.current_stock,
      coalesce(mt.signed_quantity, 0) as signed_quantity,
      p.current_stock - coalesce(mt.signed_quantity, 0) as difference
    from public.shared_inventory_products p
    left join movement_totals mt on mt.product_id = p.id
    where p.tenant_id = v_tenant and p.company_id = p_company_id
      and p.current_stock <> coalesce(mt.signed_quantity, 0)
    order by abs(p.current_stock - coalesce(mt.signed_quantity, 0)) desc, p.id
    limit p_mismatch_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'productId', id, 'code', code, 'measureUnit', measure_unit,
    'currentStock', current_stock::text,
    'signedMovementQuantity', signed_quantity::text,
    'difference', difference::text
  ) order by abs(difference) desc, id), '[]'::jsonb)
  into v_mismatches from mismatches;

  select count(*) into v_branch_count from public.shared_company_branches b
  where b.tenant_id = v_tenant and b.organization_id = p_organization_id
    and b.company_id = p_company_id;

  with movement_sources as (
    select m.type, m.purchase_invoice_id, m.sales_invoice_id,
      coalesce(pi.branch_id, si.branch_id, mb.branch_id) as branch_id
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
  )
  select count(*) filter (where (purchase_invoice_id is not null or sales_invoice_id is not null)
      and branch_id is null),
    count(*) filter (where purchase_invoice_id is null and sales_invoice_id is null),
    count(*) filter (where branch_id is not null),
    count(*) filter (where type not in
      ('entrada', 'ajuste_positivo', 'salida', 'ajuste_negativo', 'autoconsumo'))
  into v_linked_without_branch, v_unlinked, v_attributed, v_unsupported
  from movement_sources;

  return jsonb_build_object(
    'totalProducts', v_total_products,
    'nonzeroStockProducts', v_nonzero_stock_products,
    'movementReconciliationMismatchProducts', v_mismatch_products,
    'linkedWithoutBranchMovementCount', v_linked_without_branch,
    'unlinkedMovementCount', v_unlinked,
    'attributedMovementCount', v_attributed,
    'unsupportedMovementCount', v_unsupported,
    'branchCount', v_branch_count,
    'mismatches', v_mismatches,
    'generatedAt', clock_timestamp()
  );
end $$;
revoke all on function public.get_native_inventory_branch_stock_readiness(uuid,uuid,text,integer)
  from public,anon,authenticated;
grant execute on function public.get_native_inventory_branch_stock_readiness(uuid,uuid,text,integer)
  to service_role;
