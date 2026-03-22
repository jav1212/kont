-- =============================================================================
-- 040_libro_inventarios_carry_forward.sql
-- Corrige tenant_inventario_libro_inventarios para que incluya productos
-- con saldo inicial no cero aunque no tengan movimientos en el año consultado.
--
-- Problema anterior: productos_anno filtraba sólo por movimientos en el año,
-- por lo que productos sin actividad en el año corriente no aparecían en el
-- libro, perdiendo la persistencia del saldo de cierre del año anterior.
--
-- Cambios:
--   1. Se extrae "apertura_raw" como primer CTE, antes de productos_anno,
--      de modo que productos_anno pueda referenciarlo.
--   2. productos_anno = union de (movimientos en el año) + (saldo_inicial > 0).
--   3. valor_inicial / valor_final usan m.saldo_valor (columna ya calculada y
--      almacenada por la función de guardado) en lugar de
--      saldo_cantidad * costo_unitario.
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
        WITH apertura_raw AS (
            -- Último movimiento estrictamente anterior al año → saldo de apertura
            SELECT DISTINCT ON (m.producto_id)
                m.producto_id,
                m.saldo_cantidad AS cant_inicial,
                m.saldo_valor    AS valor_inicial
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.fecha < %L
            ORDER BY m.producto_id, m.fecha DESC, m.created_at DESC
        ),
        productos_anno AS (
            -- Productos con movimientos en el año O con saldo inicial no cero
            SELECT DISTINCT p.id, p.codigo, p.nombre, p.tipo, p.unidad_medida
            FROM %I.inventario_productos p
            WHERE p.id IN (
                -- Productos con actividad en el año
                SELECT DISTINCT m2.producto_id
                FROM %I.inventario_movimientos m2
                WHERE m2.empresa_id = %L
                  AND m2.fecha BETWEEN %L AND %L
                UNION
                -- Productos con saldo de apertura > 0 (arrastre de año anterior)
                SELECT producto_id FROM apertura_raw WHERE cant_inicial > 0
            )
        ),
        movs_anno AS (
            SELECT
                m.producto_id,
                SUM(CASE
                    WHEN m.tipo IN ('entrada','entrada_produccion','devolucion_salida','ajuste_positivo')
                    THEN m.cantidad ELSE 0
                END)                                      AS cant_entradas,
                ROUND(SUM(CASE
                    WHEN m.tipo IN ('entrada','entrada_produccion','devolucion_salida','ajuste_positivo')
                    THEN COALESCE(m.costo_total, 0) ELSE 0
                END), 2)                                  AS valor_entradas,
                SUM(CASE
                    WHEN m.tipo IN ('salida','salida_produccion','devolucion_entrada','autoconsumo','ajuste_negativo')
                    THEN m.cantidad ELSE 0
                END)                                      AS cant_salidas,
                ROUND(SUM(CASE
                    WHEN m.tipo IN ('salida','salida_produccion','devolucion_entrada','autoconsumo','ajuste_negativo')
                    THEN COALESCE(m.costo_total, 0) ELSE 0
                END), 2)                                  AS valor_salidas,
                -- Compras (entrada directa) para fórmula ISLR costo de ventas
                ROUND(SUM(CASE
                    WHEN m.tipo = 'entrada'
                    THEN COALESCE(m.costo_total, 0) ELSE 0
                END), 2)                                  AS valor_compras
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.fecha BETWEEN %L AND %L
            GROUP BY m.producto_id
        ),
        cierre AS (
            -- Último movimiento en o antes de 31/12 → saldo de cierre
            -- Para productos sin actividad en el año, coincide con apertura.
            SELECT DISTINCT ON (m.producto_id)
                m.producto_id,
                m.saldo_cantidad AS cant_final,
                m.saldo_valor    AS valor_final
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
        LEFT JOIN apertura_raw a  ON a.producto_id  = p.id
        LEFT JOIN movs_anno    ma ON ma.producto_id = p.id
        LEFT JOIN cierre       c  ON c.producto_id  = p.id
    $q$,
        -- apertura_raw: schema, empresa_id, fecha_ini
        v_schema, p_empresa_id, v_fecha_ini,
        -- productos_anno: schema productos, schema movimientos, empresa_id, fecha_ini, fecha_fin
        v_schema, v_schema, p_empresa_id, v_fecha_ini, v_fecha_fin,
        -- movs_anno: schema, empresa_id, fecha_ini, fecha_fin
        v_schema, p_empresa_id, v_fecha_ini, v_fecha_fin,
        -- cierre: schema, empresa_id, fecha_fin
        v_schema, p_empresa_id, v_fecha_fin
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
