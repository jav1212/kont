-- =============================================================================
-- 081_balance_report_total_ventas.sql
--
-- Extiende `tenant_inventario_reporte_saldo` para retornar también el total
-- de ventas (sin IVA) por departamento, calculado como
--   Σ (precio_venta_unitario × cantidad) sobre movimientos de tipo
--   'salida' o 'autoconsumo' (donde precio_venta_unitario está poblado por
--   el generador de salidas — fallback null si no aplica).
--
-- Se agrega la columna `total_ventas_s_iva` a la salida JSON sin alterar las
-- columnas existentes; el frontend la consume para mostrar el KPI y la
-- columna nueva en la tabla.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tenant_inventario_reporte_saldo(
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
            SELECT
                m.producto_id,
                m.saldo_cantidad AS saldo
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.periodo < %L
              AND m.created_at = (
                  SELECT MAX(m2.created_at)
                  FROM %I.inventario_movimientos m2
                  WHERE m2.producto_id = m.producto_id
                    AND m2.periodo < %L
              )
        ),
        mov_periodo AS (
            SELECT
                m.producto_id,
                SUM(CASE WHEN m.tipo IN ('entrada','entrada_produccion','devolucion_entrada','ajuste_positivo')
                         THEN m.cantidad ELSE 0 END) AS unidades_entradas,
                SUM(CASE WHEN m.tipo IN ('salida','salida_produccion','devolucion_salida','ajuste_negativo','autoconsumo')
                         THEN m.cantidad ELSE 0 END) AS unidades_salidas,
                SUM(CASE WHEN m.tipo IN ('entrada','entrada_produccion','devolucion_entrada','ajuste_positivo')
                         THEN m.costo_total ELSE 0 END) AS costo_entradas,
                SUM(CASE WHEN m.tipo IN ('salida','salida_produccion','devolucion_salida','ajuste_negativo','autoconsumo')
                         THEN m.costo_total ELSE 0 END) AS costo_salidas,
                SUM(CASE WHEN m.tipo IN ('salida','autoconsumo')
                         THEN COALESCE(m.precio_venta_unitario * m.cantidad, 0) ELSE 0 END) AS total_ventas_s_iva
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.periodo = %L
            GROUP BY m.producto_id
        ),
        por_producto AS (
            SELECT
                COALESCE(d.nombre, 'Sin departamento')           AS departamento_nombre,
                COALESCE(ii.saldo, 0)                            AS unidades_inicial,
                COALESCE(ii.saldo, 0) * p.costo_promedio         AS costo_inicial,
                COALESCE(mp.unidades_entradas, 0)                AS unidades_entradas,
                COALESCE(mp.costo_entradas, 0)                   AS costo_entradas,
                COALESCE(mp.unidades_salidas, 0)                 AS unidades_salidas,
                COALESCE(mp.costo_salidas, 0)                    AS costo_salidas,
                COALESCE(mp.total_ventas_s_iva, 0)               AS total_ventas_s_iva,
                p.existencia_actual                              AS unidades_existencia,
                p.existencia_actual * p.costo_promedio           AS costo_existencia
            FROM %I.inventario_productos p
            LEFT JOIN %I.inventario_departamentos d ON d.id = p.departamento_id
            LEFT JOIN inv_inicial ii                 ON ii.producto_id = p.id
            LEFT JOIN mov_periodo mp                 ON mp.producto_id = p.id
            WHERE p.empresa_id = %L
              AND p.activo = true
        )
        SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
        FROM (
            SELECT
                departamento_nombre,
                SUM(unidades_inicial)    AS unidades_inicial,
                SUM(costo_inicial)       AS costo_inicial,
                SUM(unidades_entradas)   AS unidades_entradas,
                SUM(costo_entradas)      AS costo_entradas,
                SUM(unidades_salidas)    AS unidades_salidas,
                SUM(costo_salidas)       AS costo_salidas,
                SUM(total_ventas_s_iva)  AS total_ventas_s_iva,
                SUM(unidades_existencia) AS unidades_existencia,
                SUM(costo_existencia)    AS costo_existencia
            FROM por_producto
            GROUP BY departamento_nombre
            ORDER BY departamento_nombre
        ) t
    $sql$,
        v_schema, p_empresa_id, p_periodo,
        v_schema, p_periodo,
        v_schema, p_empresa_id, p_periodo,
        v_schema, v_schema,
        p_empresa_id
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
