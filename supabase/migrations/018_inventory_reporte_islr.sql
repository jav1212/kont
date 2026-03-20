-- =============================================================================
-- 018_inventory_reporte_islr.sql
-- Adds RPC tenant_inventario_kardex_periodo for Reporte Art. 177 ISLR
-- (Reglamento ISLR Art. 177 — registro mensual detallado por producto)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tenant_inventario_kardex_periodo(
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
        WITH productos_periodo AS (
            SELECT DISTINCT m.producto_id, p.codigo, p.nombre
            FROM %I.inventario_movimientos m
            JOIN %I.inventario_productos p ON p.id = m.producto_id
            WHERE m.empresa_id = %L
              AND m.periodo = %L
        ),
        apertura AS (
            SELECT DISTINCT ON (m.producto_id)
                m.producto_id,
                m.saldo_cantidad                    AS apertura_cantidad,
                m.saldo_cantidad * m.costo_unitario AS apertura_costo
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.periodo < %L
              AND m.producto_id IN (SELECT producto_id FROM productos_periodo)
            ORDER BY m.producto_id, m.fecha DESC, m.id DESC
        ),
        movs AS (
            SELECT
                m.producto_id,
                m.id,
                m.fecha,
                COALESCE(m.referencia, '')             AS referencia,
                m.tipo,
                CASE WHEN m.tipo IN ('entrada_compra','entrada_produccion','devolucion_venta','ajuste_positivo')
                     THEN m.cantidad ELSE 0 END        AS cant_entrada,
                CASE WHEN m.tipo NOT IN ('entrada_compra','entrada_produccion','devolucion_venta','ajuste_positivo')
                     THEN m.cantidad ELSE 0 END        AS cant_salida,
                m.saldo_cantidad,
                CASE WHEN m.tipo IN ('entrada_compra','entrada_produccion','devolucion_venta','ajuste_positivo')
                     THEN COALESCE(m.costo_total, 0) ELSE 0 END AS costo_entrada,
                CASE WHEN m.tipo NOT IN ('entrada_compra','entrada_produccion','devolucion_venta','ajuste_positivo')
                     THEN COALESCE(m.costo_total, 0) ELSE 0 END AS costo_salida,
                m.saldo_cantidad * m.costo_unitario    AS saldo_costo
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.periodo = %L
        )
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'producto_id',       pp.producto_id,
                'producto_codigo',   pp.codigo,
                'producto_nombre',   pp.nombre,
                'apertura_cantidad', COALESCE(a.apertura_cantidad, 0),
                'apertura_costo',    COALESCE(a.apertura_costo, 0),
                'movimientos', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id',             mv.id,
                            'fecha',          mv.fecha,
                            'referencia',     mv.referencia,
                            'tipo',           mv.tipo,
                            'cant_entrada',   mv.cant_entrada,
                            'cant_salida',    mv.cant_salida,
                            'saldo_cantidad', mv.saldo_cantidad,
                            'costo_entrada',  mv.costo_entrada,
                            'costo_salida',   mv.costo_salida,
                            'saldo_costo',    mv.saldo_costo
                        ) ORDER BY mv.fecha ASC, mv.id ASC
                    )
                    FROM movs mv WHERE mv.producto_id = pp.producto_id
                ), '[]'::jsonb)
            ) ORDER BY pp.codigo ASC
        ), '[]'::jsonb)
        FROM productos_periodo pp
        LEFT JOIN apertura a ON a.producto_id = pp.producto_id
    $q$,
        v_schema, v_schema, p_empresa_id, p_periodo,
        v_schema, p_empresa_id, p_periodo,
        v_schema, p_empresa_id, p_periodo
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
