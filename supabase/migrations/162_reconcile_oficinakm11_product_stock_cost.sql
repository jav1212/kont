-- Reconcile legacy stock/cost values that predate shared activity.
-- Only rows with matching identity and an older/equal shared timestamp qualify.

do $$
declare
    v_tenant uuid := '624a5ef3-6e23-43ba-b3de-30686fa944e5';
begin
    insert into public.shared_schema_reconciliation_audit
        (tenant_id, source_table, source_id, action, details)
    select
        v_tenant,
        'inventario_productos',
        s.id,
        'reconciled_stock_cost',
        jsonb_build_object(
            'legacy_updated_at', l.updated_at,
            'shared_updated_at_before', s.updated_at,
            'legacy_stock', l.existencia_actual,
            'shared_stock_before', s.current_stock,
            'legacy_average_cost', l.costo_promedio,
            'shared_average_cost_before', s.average_cost
        )
    from tenant_624a5ef36e2343bab3de30686fa944e5.inventario_productos l
    join public.shared_inventory_products s
      on s.tenant_id = v_tenant and s.id = l.id
    where s.updated_at <= coalesce(l.updated_at, 'epoch'::timestamptz)
      and s.company_id = l.empresa_id
      and s.code = l.codigo
      and s.name = l.nombre
      and s.type = l.tipo
      and s.department_id is not distinct from l.departamento_id
      and (
          s.current_stock is distinct from l.existencia_actual
          or s.average_cost is distinct from l.costo_promedio
      )
    on conflict do nothing;

    update public.shared_inventory_products s
    set current_stock = l.existencia_actual,
        average_cost = l.costo_promedio,
        updated_at = greatest(s.updated_at, l.updated_at)
    from tenant_624a5ef36e2343bab3de30686fa944e5.inventario_productos l
    where s.tenant_id = v_tenant
      and s.id = l.id
      and s.updated_at <= coalesce(l.updated_at, 'epoch'::timestamptz)
      and s.company_id = l.empresa_id
      and s.code = l.codigo
      and s.name = l.nombre
      and s.type = l.tipo
      and s.department_id is not distinct from l.departamento_id
      and (
          s.current_stock is distinct from l.existencia_actual
          or s.average_cost is distinct from l.costo_promedio
      );
end;
$$;
