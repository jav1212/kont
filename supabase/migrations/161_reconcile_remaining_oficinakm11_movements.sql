-- Reconcile movements created in the legacy pilot schema after migration 157.
-- Idempotent: preserves the legacy movement id and never overwrites shared rows.

do $$
declare
    v_tenant uuid := '624a5ef3-6e23-43ba-b3de-30686fa944e5';
begin
    insert into public.shared_schema_reconciliation_audit
        (tenant_id, source_table, source_id, action, details)
    select v_tenant, 'inventario_movimientos', m.id, 'inserted',
           jsonb_build_object(
               'company_id', m.empresa_id,
               'product_id', m.producto_id,
               'purchase_invoice_id', m.factura_compra_id,
               'reason', 'post_pilot_activity'
           )
    from tenant_624a5ef36e2343bab3de30686fa944e5.inventario_movimientos m
    where not exists (
        select 1
        from public.shared_inventory_movements s
        where s.tenant_id = v_tenant and s.id = m.id
    )
    on conflict do nothing;

    insert into public.shared_inventory_movements
        (tenant_id, id, company_id, product_id, type, date, period, quantity,
         unit_cost, total_cost, balance_quantity, reference, notes, created_at,
         balance_value, currency, currency_cost, dollar_rate, purchase_invoice_id,
         discount_type, discount_value, discount_amount, surcharge_type,
         surcharge_value, surcharge_amount, tax_type, tax_value, tax_amount,
         tax_concept, vat_base, sale_price_unit)
    select v_tenant, m.id, m.empresa_id, m.producto_id, m.tipo, m.fecha, m.periodo,
           m.cantidad, m.costo_unitario, m.costo_total, m.saldo_cantidad,
           m.referencia, m.notas, m.created_at, m.saldo_valor, m.moneda,
           m.costo_moneda, m.tasa_dolar, m.factura_compra_id, m.descuento_tipo,
           m.descuento_valor, m.descuento_monto, m.recargo_tipo, m.recargo_valor,
           m.recargo_monto, m.impuesto_tipo, m.impuesto_valor, m.impuesto_monto,
           m.impuesto_concepto, m.base_iva, m.precio_venta_unitario
    from tenant_624a5ef36e2343bab3de30686fa944e5.inventario_movimientos m
    where not exists (
        select 1
        from public.shared_inventory_movements s
        where s.tenant_id = v_tenant and s.id = m.id
    );
end;
$$;
