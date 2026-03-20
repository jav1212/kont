-- =============================================================================
-- 021_inventory_libro_inventarios.sql
-- Fase 8: Libro de Inventarios Anual (ISLR / Código de Comercio Art. 36)
-- Crea RPC tenant_inventario_libro_inventarios(p_user_id, p_empresa_id, p_anio)
-- Calcula por producto: saldo inicial 01/01, entradas, salidas, saldo final 31/12
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tenant_inventario_libro_inventarios(
    p_user_id    uuid,
    p_empresa_id text,
    p_anio       int
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema     text;
    v_fecha_ini  date;
    v_fecha_fin  date;
    v_result     jsonb;
BEGIN
    v_schema    := public.tenant_get_schema(p_user_id);
    v_fecha_ini := make_date(p_anio, 1, 1);
    v_fecha_fin := make_date(p_anio, 12, 31);

    EXECUTE format($q$
        WITH productos_anno AS (
            -- All products with movement activity in the year
            SELECT DISTINCT p.id, p.codigo, p.nombre, p.tipo, p.unidad_medida
            FROM %I.inventario_productos p
            JOIN %I.inventario_movimientos m ON m.producto_id = p.id
            WHERE m.empresa_id = %L
              AND m.fecha BETWEEN %L AND %L
        ),
        apertura AS (
            -- Last movement strictly before the year start → opening balance
            SELECT DISTINCT ON (m.producto_id)
                m.producto_id,
                m.saldo_cantidad                          AS cant_inicial,
                ROUND(m.saldo_cantidad * m.costo_unitario, 2) AS valor_inicial
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.fecha < %L
              AND m.producto_id IN (SELECT id FROM productos_anno)
            ORDER BY m.producto_id, m.fecha DESC, m.created_at DESC
        ),
        movs_anno AS (
            -- Aggregated entries and exits during the year
            SELECT
                m.producto_id,
                SUM(CASE
                    WHEN m.tipo IN ('entrada_compra','entrada_produccion','devolucion_venta','ajuste_positivo')
                    THEN m.cantidad ELSE 0
                END)                                      AS cant_entradas,
                ROUND(SUM(CASE
                    WHEN m.tipo IN ('entrada_compra','entrada_produccion','devolucion_venta','ajuste_positivo')
                    THEN COALESCE(m.costo_total, 0) ELSE 0
                END), 2)                                  AS valor_entradas,
                SUM(CASE
                    WHEN m.tipo IN ('salida_venta','salida_produccion','devolucion_compra','autoconsumo','ajuste_negativo')
                    THEN m.cantidad ELSE 0
                END)                                      AS cant_salidas,
                ROUND(SUM(CASE
                    WHEN m.tipo IN ('salida_venta','salida_produccion','devolucion_compra','autoconsumo','ajuste_negativo')
                    THEN COALESCE(m.costo_total, 0) ELSE 0
                END), 2)                                  AS valor_salidas,
                -- Compras alone (entrada_compra) for ISLR cost-of-sales formula
                ROUND(SUM(CASE
                    WHEN m.tipo = 'entrada_compra'
                    THEN COALESCE(m.costo_total, 0) ELSE 0
                END), 2)                                  AS valor_compras
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.fecha BETWEEN %L AND %L
            GROUP BY m.producto_id
        ),
        cierre AS (
            -- Last movement on or before 31/12 of the year → closing balance
            SELECT DISTINCT ON (m.producto_id)
                m.producto_id,
                m.saldo_cantidad                              AS cant_final,
                ROUND(m.saldo_cantidad * m.costo_unitario, 2) AS valor_final
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.fecha <= %L
              AND m.producto_id IN (SELECT id FROM productos_anno)
            ORDER BY m.producto_id, m.fecha DESC, m.created_at DESC
        )
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',              p.id,
                'codigo',          p.codigo,
                'nombre',          p.nombre,
                'tipo',            p.tipo,
                'unidad_medida',   p.unidad_medida,
                'cant_inicial',    COALESCE(a.cant_inicial,   0),
                'valor_inicial',   COALESCE(a.valor_inicial,  0),
                'cant_entradas',   COALESCE(ma.cant_entradas, 0),
                'valor_entradas',  COALESCE(ma.valor_entradas,0),
                'cant_salidas',    COALESCE(ma.cant_salidas,  0),
                'valor_salidas',   COALESCE(ma.valor_salidas, 0),
                'cant_final',      COALESCE(c.cant_final,     0),
                'valor_final',     COALESCE(c.valor_final,    0),
                'valor_compras',   COALESCE(ma.valor_compras, 0)
            ) ORDER BY p.nombre ASC
        ), '[]'::jsonb)
        FROM productos_anno p
        LEFT JOIN apertura   a  ON a.producto_id  = p.id
        LEFT JOIN movs_anno  ma ON ma.producto_id = p.id
        LEFT JOIN cierre     c  ON c.producto_id  = p.id
    $q$,
        -- productos_anno
        v_schema, v_schema, p_empresa_id, v_fecha_ini, v_fecha_fin,
        -- apertura
        v_schema, p_empresa_id, v_fecha_ini,
        -- movs_anno
        v_schema, p_empresa_id, v_fecha_ini, v_fecha_fin,
        -- cierre
        v_schema, p_empresa_id, v_fecha_fin
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
