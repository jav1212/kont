-- =============================================================================
-- 041_reporte_periodo_fix_tipos.sql
-- Corrige tenant_inventario_reporte_periodo:
--   1. Actualiza tipos a los nombres post-037 (entrada, salida, devolucion_*)
--   2. Elimina costo_factura (no aplica — es entrada, no factura)
--   3. Mejora inv_inicial con DISTINCT ON en vez de MAX(created_at)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tenant_inventario_reporte_periodo(
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

    EXECUTE format($sql$
        WITH
        inv_inicial AS (
            -- Último saldo conocido antes del período (inventario inicial)
            SELECT DISTINCT ON (m.producto_id)
                m.producto_id,
                m.saldo_cantidad AS saldo
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.periodo < %L
            ORDER BY m.producto_id, m.periodo DESC, m.created_at DESC
        ),
        mov_periodo AS (
            SELECT
                m.producto_id,
                SUM(CASE WHEN m.tipo IN ('entrada','entrada_produccion','devolucion_salida','ajuste_positivo')
                         THEN m.cantidad ELSE 0 END) AS entradas,
                SUM(CASE WHEN m.tipo IN ('salida','salida_produccion','devolucion_entrada','ajuste_negativo','autoconsumo')
                         THEN m.cantidad ELSE 0 END) AS salidas,
                SUM(CASE WHEN m.tipo IN ('entrada','entrada_produccion','devolucion_salida','ajuste_positivo')
                         THEN COALESCE(m.costo_total, 0) ELSE 0 END) AS costo_entradas_bs,
                SUM(CASE WHEN m.tipo = 'salida'
                         THEN COALESCE(m.costo_total, 0) ELSE 0 END) AS total_salidas_s_iva_bs,
                SUM(CASE WHEN m.tipo IN ('salida','salida_produccion','devolucion_entrada','ajuste_negativo','autoconsumo')
                         THEN COALESCE(m.costo_total, 0) ELSE 0 END) AS costo_salidas_bs,
                SUM(CASE WHEN m.tipo = 'autoconsumo'
                         THEN COALESCE(m.costo_total, 0) ELSE 0 END) AS costo_autoconsumo
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.periodo = %L
            GROUP BY m.producto_id
        ),
        proveedor_por_producto AS (
            SELECT DISTINCT ON (fi.producto_id)
                fi.producto_id,
                pv.nombre AS proveedor_nombre
            FROM %I.inventario_facturas_compra_items fi
            JOIN %I.inventario_facturas_compra fc ON fc.id = fi.factura_id
            JOIN %I.inventario_proveedores pv ON pv.id = fc.proveedor_id
            WHERE fc.empresa_id = %L
              AND fc.periodo = %L
              AND fc.estado = 'confirmada'
            ORDER BY fi.producto_id, fc.fecha DESC
        )
        SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
        FROM (
            SELECT
                p.codigo,
                p.nombre,
                COALESCE(d.nombre, '')          AS departamento_nombre,
                COALESCE(pp.proveedor_nombre, '') AS proveedor_nombre,
                p.iva_tipo,
                COALESCE(ii.saldo, 0)                        AS inventario_inicial,
                p.costo_promedio,
                COALESCE(mp.entradas, 0)                     AS entradas,
                COALESCE(mp.salidas, 0)                      AS salidas,
                p.existencia_actual,
                COALESCE(mp.costo_entradas_bs, 0)            AS costo_entradas_bs,
                COALESCE(mp.total_salidas_s_iva_bs, 0)       AS total_salidas_s_iva_bs,
                COALESCE(mp.costo_salidas_bs, 0)             AS costo_salidas_bs,
                COALESCE(mp.costo_autoconsumo, 0)            AS costo_autoconsumo,
                p.existencia_actual * p.costo_promedio        AS costo_actual_bs
            FROM %I.inventario_productos p
            LEFT JOIN %I.inventario_departamentos d    ON d.id = p.departamento_id
            LEFT JOIN inv_inicial ii                   ON ii.producto_id = p.id
            LEFT JOIN mov_periodo mp                   ON mp.producto_id = p.id
            LEFT JOIN proveedor_por_producto pp        ON pp.producto_id = p.id
            WHERE p.empresa_id = %L
              AND p.activo = true
            ORDER BY COALESCE(d.nombre, 'ZZZZ'), p.nombre
        ) t
    $sql$,
        -- inv_inicial
        v_schema, p_empresa_id, p_periodo,
        -- mov_periodo
        v_schema, p_empresa_id, p_periodo,
        -- proveedor_por_producto
        v_schema, v_schema, v_schema, p_empresa_id, p_periodo,
        -- main query
        v_schema, v_schema, v_schema, v_schema, p_empresa_id
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
