-- 157_reconcile_oficinakm11_shared.sql
-- Reconciles rows created in the legacy tenant schema after the shared-schema
-- backfills. This migration is intentionally tenant-specific and idempotent.

create table if not exists public.shared_schema_reconciliation_audit (
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    source_table text not null,
    source_id text not null,
    action text not null,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    primary key (tenant_id, source_table, source_id, action)
);

alter table public.shared_schema_reconciliation_audit enable row level security;

do $$
declare
    v_tenant uuid := '624a5ef3-6e23-43ba-b3de-30686fa944e5';
    v_schema text := 'tenant_624a5ef36e2343bab3de30686fa944e5';
begin
    -- Products must exist before invoice items and movements.
    insert into public.shared_schema_reconciliation_audit (tenant_id, source_table, source_id, action, details)
    select v_tenant, 'inventario_productos', p.id, 'inserted',
           jsonb_build_object('company_id', p.empresa_id, 'code', p.codigo, 'name', p.nombre)
    from tenant_624a5ef36e2343bab3de30686fa944e5.inventario_productos p
    where not exists (
        select 1 from public.shared_inventory_products s
        where s.tenant_id = v_tenant and s.id = p.id
    )
    on conflict do nothing;

    insert into public.shared_inventory_products
        (tenant_id, id, company_id, code, name, description, type, measure_unit,
         valuation_method, current_stock, average_cost, active, created_at, updated_at,
         department_id, vat_type, default_currency, custom_fields)
    select v_tenant, p.id, p.empresa_id, p.codigo, p.nombre, p.descripcion, p.tipo,
           p.unidad_medida, p.metodo_valuacion, p.existencia_actual, p.costo_promedio,
           p.activo, p.created_at, p.updated_at, p.departamento_id, p.iva_tipo,
           p.moneda_defecto, p.custom_fields
    from tenant_624a5ef36e2343bab3de30686fa944e5.inventario_productos p
    where not exists (
        select 1 from public.shared_inventory_products s
        where s.tenant_id = v_tenant and s.id = p.id
    );

    -- Invoices must exist before their items and linked movements.
    insert into public.shared_schema_reconciliation_audit (tenant_id, source_table, source_id, action, details)
    select v_tenant, 'inventario_facturas_compra', f.id, 'inserted',
           jsonb_build_object('company_id', f.empresa_id, 'invoice_number', f.numero_factura,
                              'invoice_date', f.fecha)
    from tenant_624a5ef36e2343bab3de30686fa944e5.inventario_facturas_compra f
    where not exists (
        select 1 from public.shared_inventory_purchase_invoices s
        where s.tenant_id = v_tenant and s.id = f.id
    )
    on conflict do nothing;

    insert into public.shared_inventory_purchase_invoices
        (tenant_id, id, company_id, supplier_id, invoice_number, invoice_date, period,
         status, subtotal, vat_percentage, vat_amount, total, notes, confirmed_at,
         created_at, updated_at, control_number, dollar_rate, rate_decimals,
         discount_type, discount_value, discount_amount, surcharge_type, surcharge_value,
         surcharge_amount, tax_type, tax_value, tax_amount, tax_concept, manual_period,
         vat_retention_percentage, vat_retention_amount, vat_retention_receipt_number,
         income_tax_concept, income_tax_percentage, income_tax_base, income_tax_subtrahend,
         income_tax_amount, tax_unit_value, income_tax_receipt_number, financial_tax_applies,
         financial_tax_percentage, financial_tax_currency_base, financial_tax_bs_base,
         financial_tax_amount, taxes)
    select v_tenant, f.id, f.empresa_id, f.proveedor_id, f.numero_factura, f.fecha, f.periodo,
           f.estado, f.subtotal, f.iva_porcentaje, f.iva_monto, f.total, f.notas,
           f.confirmada_at, f.created_at, f.updated_at, f.numero_control, f.tasa_dolar,
           f.tasa_decimales, f.descuento_tipo, f.descuento_valor, f.descuento_monto,
           f.recargo_tipo, f.recargo_valor, f.recargo_monto, f.impuesto_tipo,
           f.impuesto_valor, f.impuesto_monto, f.impuesto_concepto, f.periodo_manual,
           f.retencion_iva_pct, f.retencion_iva_monto, f.comprobante_retencion_iva_numero,
           f.islr_concepto, f.islr_porcentaje, f.islr_base_retencion, f.islr_sustraendo,
           f.islr_monto, f.islr_unidad_tributaria, f.comprobante_islr_numero, f.igtf_aplica,
           f.igtf_porcentaje, f.igtf_base_divisa, f.igtf_base_bs, f.igtf_monto, f.impuestos
    from tenant_624a5ef36e2343bab3de30686fa944e5.inventario_facturas_compra f
    where not exists (
        select 1 from public.shared_inventory_purchase_invoices s
        where s.tenant_id = v_tenant and s.id = f.id
    );

    insert into public.shared_schema_reconciliation_audit (tenant_id, source_table, source_id, action, details)
    select v_tenant, 'inventario_facturas_compra_items', i.id, 'inserted',
           jsonb_build_object('invoice_id', i.factura_id, 'product_id', i.producto_id)
    from tenant_624a5ef36e2343bab3de30686fa944e5.inventario_facturas_compra_items i
    where not exists (
        select 1 from public.shared_inventory_purchase_invoice_items s
        where s.tenant_id = v_tenant and s.id = i.id
    )
    on conflict do nothing;

    insert into public.shared_inventory_purchase_invoice_items
        (tenant_id, id, invoice_id, product_id, quantity, unit_cost, total_cost, created_at,
         vat_rate, currency, currency_cost, dollar_rate, discount_type, discount_value,
         discount_amount, surcharge_type, surcharge_value, surcharge_amount, tax_type,
         tax_value, tax_amount, tax_concept, vat_base, vat_included)
    select v_tenant, i.id, i.factura_id, i.producto_id, i.cantidad, i.costo_unitario,
           i.costo_total, i.created_at, i.iva_alicuota, i.moneda, i.costo_moneda,
           i.tasa_dolar, i.descuento_tipo, i.descuento_valor, i.descuento_monto,
           i.recargo_tipo, i.recargo_valor, i.recargo_monto, i.impuesto_tipo,
           i.impuesto_valor, i.impuesto_monto, i.impuesto_concepto, i.base_iva,
           i.iva_incluido
    from tenant_624a5ef36e2343bab3de30686fa944e5.inventario_facturas_compra_items i
    where not exists (
        select 1 from public.shared_inventory_purchase_invoice_items s
        where s.tenant_id = v_tenant and s.id = i.id
    );

    insert into public.shared_schema_reconciliation_audit (tenant_id, source_table, source_id, action, details)
    select v_tenant, 'inventario_movimientos', m.id, 'inserted',
           jsonb_build_object('company_id', m.empresa_id, 'product_id', m.producto_id,
                              'purchase_invoice_id', m.factura_compra_id)
    from tenant_624a5ef36e2343bab3de30686fa944e5.inventario_movimientos m
    where not exists (
        select 1 from public.shared_inventory_movements s
        where s.tenant_id = v_tenant and s.id = m.id
    )
    on conflict do nothing;

    insert into public.shared_inventory_movements
        (tenant_id, id, company_id, product_id, type, date, period, quantity, unit_cost,
         total_cost, balance_quantity, reference, notes, created_at, balance_value,
         currency, currency_cost, dollar_rate, purchase_invoice_id, discount_type,
         discount_value, discount_amount, surcharge_type, surcharge_value, surcharge_amount,
         tax_type, tax_value, tax_amount, tax_concept, vat_base, sale_price_unit)
    select v_tenant, m.id, m.empresa_id, m.producto_id, m.tipo, m.fecha, m.periodo,
           m.cantidad, m.costo_unitario, m.costo_total, m.saldo_cantidad, m.referencia,
           m.notas, m.created_at, m.saldo_valor, m.moneda, m.costo_moneda, m.tasa_dolar,
           m.factura_compra_id, m.descuento_tipo, m.descuento_valor, m.descuento_monto,
           m.recargo_tipo, m.recargo_valor, m.recargo_monto, m.impuesto_tipo,
           m.impuesto_valor, m.impuesto_monto, m.impuesto_concepto, m.base_iva,
           m.precio_venta_unitario
    from tenant_624a5ef36e2343bab3de30686fa944e5.inventario_movimientos m
    where not exists (
        select 1 from public.shared_inventory_movements s
        where s.tenant_id = v_tenant and s.id = m.id
    );

    insert into public.shared_schema_reconciliation_audit (tenant_id, source_table, source_id, action, details)
    select v_tenant, 'accounting_integration_log', l.id, 'inserted',
           jsonb_build_object('source', l.source, 'source_ref', l.source_ref)
    from tenant_624a5ef36e2343bab3de30686fa944e5.accounting_integration_log l
    where not exists (
        select 1 from public.shared_accounting_integration_log s
        where s.tenant_id = v_tenant and s.id = l.id
    )
    on conflict do nothing;

    insert into public.shared_accounting_integration_log
        (tenant_id, id, company_id, source, source_ref, entry_id, status, error_message, created_at)
    select v_tenant, l.id, l.company_id, l.source, l.source_ref, l.entry_id,
           l.status, l.error_message, l.created_at
    from tenant_624a5ef36e2343bab3de30686fa944e5.accounting_integration_log l
    where not exists (
        select 1 from public.shared_accounting_integration_log s
        where s.tenant_id = v_tenant and s.id = l.id
    );
end;
$$;

revoke all on table public.shared_schema_reconciliation_audit from public, anon, authenticated;
grant select on table public.shared_schema_reconciliation_audit to service_role;
