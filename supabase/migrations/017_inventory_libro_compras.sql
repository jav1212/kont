-- =============================================================================
-- 017_inventory_libro_compras.sql
-- Adds RPC tenant_inventario_libro_compras for Libro de Compras IVA
-- (Reglamento Ley IVA Art. 70-72)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tenant_inventario_libro_compras(
    p_user_id    uuid,
    p_empresa_id text,
    p_periodo    text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format($q$
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',               f.id,
                'fecha',            f.fecha,
                'numero_factura',   f.numero_factura,
                'numero_control',   f.numero_control,
                'proveedor_rif',    pv.rif,
                'proveedor_nombre', pv.nombre,
                'base_gravada',     COALESCE(gravada.monto, 0),
                'iva_general',      ROUND(COALESCE(gravada.monto, 0) * f.iva_porcentaje / 100, 2),
                'base_exenta',      COALESCE(exenta.monto, 0),
                'total',            f.total
            ) ORDER BY f.fecha ASC, f.numero_factura ASC
        ), '[]'::jsonb)
        FROM %I.inventario_facturas_compra f
        JOIN %I.inventario_proveedores pv ON pv.id = f.proveedor_id
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(i.costo_total), 0) AS monto
            FROM %I.inventario_facturas_compra_items i
            JOIN %I.inventario_productos p ON p.id = i.producto_id
            WHERE i.factura_id = f.id
              AND p.iva_tipo = 'general'
        ) gravada ON true
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(i.costo_total), 0) AS monto
            FROM %I.inventario_facturas_compra_items i
            JOIN %I.inventario_productos p ON p.id = i.producto_id
            WHERE i.factura_id = f.id
              AND p.iva_tipo = 'exento'
        ) exenta ON true
        WHERE f.empresa_id = %L
          AND f.periodo = %L
          AND f.estado = 'confirmada'
    $q$,
        v_schema, v_schema,
        v_schema, v_schema,
        v_schema, v_schema,
        p_empresa_id, p_periodo
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
