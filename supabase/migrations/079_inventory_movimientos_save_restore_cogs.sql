-- =============================================================================
-- 079_inventory_movimientos_save_restore_cogs.sql
--
-- Regresión introducida en mig 070: cuando se simplificó
-- `tenant_inventario_movimientos_save` para aceptar los campos de ajustes,
-- se perdió toda la lógica que (a) resolvía el costo unitario contra
-- `inventario_productos.costo_promedio` para los movimientos de salida,
-- (b) calculaba `saldo_cantidad` post-movimiento y (c) actualizaba
-- `existencia_actual` / `costo_promedio` del producto.
--
-- Síntoma visible al usuario: al confirmar salidas (manuales o generadas
-- por el generador aleatorio) el movimiento queda con
-- `costo_unitario = 0`, `costo_total = 0`, `saldo_cantidad = 0`, y el stock
-- del producto NO se descuenta. La KPI "Costo de salidas" del tablero queda
-- en Bs 0,00 y el libro de salidas muestra todas las columnas de costo en
-- cero.
--
-- Esta migración:
--   1. Reescribe `tenant_inventario_movimientos_save` para:
--        - Salidas (salida, autoconsumo, ajuste_negativo, devolucion_entrada):
--          forzar `costo_unitario := producto.costo_promedio` (COGS), calcular
--          `costo_total = cantidad × costo_promedio`, computar
--          `saldo_cantidad = max(0, existencia_actual − cantidad)` y restar la
--          cantidad de `existencia_actual`.
--        - Entradas (entrada, devolucion_salida, ajuste_positivo): respetar
--          el `costo_unitario` del payload, recalcular costo promedio
--          ponderado y aumentar `existencia_actual`.
--   2. Hace backfill por tenant de los movimientos rotos:
--        - Para cada salida con `costo_unitario = 0 AND saldo_cantidad = 0`,
--          fija `costo_unitario = producto.costo_promedio` (snapshot actual)
--          y `costo_total = cantidad × costo_promedio`.
--        - Aplica el descuento diferido a `existencia_actual` por la suma de
--          cantidad de esos movimientos rotos.
--        - Replay cronológico de `saldo_cantidad` para todos los movimientos
--          de cada producto afectado, dejando un kardex coherente.
--
-- Funciones afectadas:
--   tenant_inventario_movimientos_save
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Save function — lookup costo_promedio para salidas, actualizar producto
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_save(
    p_user_id uuid,
    p_row     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema           text;
    v_id               text;
    v_fecha            date;
    v_periodo          text;
    v_producto_id      text;
    v_tipo             text;
    v_cantidad         numeric(14,4);
    v_costo_unit_in    numeric(14,4);
    v_costo_unit       numeric(14,4);
    v_costo_total      numeric(14,2);
    v_saldo_cant       numeric(14,4);
    v_prev_cant        numeric(14,4);
    v_prev_costo       numeric(14,4);
    v_new_costo_prom   numeric(14,4);
    v_is_outbound      boolean;
    v_outbound_types   text[] := ARRAY['salida','autoconsumo','ajuste_negativo','devolucion_entrada'];
    v_result           jsonb;
BEGIN
    v_schema      := public.tenant_get_schema(p_user_id);
    v_id          := COALESCE(NULLIF(p_row->>'id',''), gen_random_uuid()::text);
    v_fecha       := COALESCE(NULLIF(p_row->>'fecha',''), CURRENT_DATE::text)::date;
    v_periodo     := to_char(v_fecha, 'YYYY-MM');
    v_producto_id := p_row->>'producto_id';
    v_tipo        := p_row->>'tipo';
    v_cantidad    := COALESCE(NULLIF(p_row->>'cantidad',''),'0')::numeric;
    v_costo_unit_in := COALESCE(NULLIF(p_row->>'costo_unitario',''),'0')::numeric;
    v_is_outbound := v_tipo = ANY(v_outbound_types);

    EXECUTE format(
        'SELECT existencia_actual, costo_promedio FROM %I.inventario_productos WHERE id = %L',
        v_schema, v_producto_id
    ) INTO v_prev_cant, v_prev_costo;

    v_prev_cant  := COALESCE(v_prev_cant, 0);
    v_prev_costo := COALESCE(v_prev_costo, 0);

    IF v_is_outbound THEN
        v_costo_unit     := v_prev_costo;
        v_costo_total    := ROUND(v_cantidad * v_costo_unit, 2);
        v_saldo_cant     := GREATEST(0, v_prev_cant - v_cantidad);
        v_new_costo_prom := v_prev_costo;
    ELSE
        v_costo_unit  := v_costo_unit_in;
        v_costo_total := ROUND(v_cantidad * v_costo_unit, 2);
        v_saldo_cant  := v_prev_cant + v_cantidad;
        IF v_saldo_cant > 0 THEN
            v_new_costo_prom := ROUND(
                (v_prev_cant * v_prev_costo + v_cantidad * v_costo_unit) / v_saldo_cant,
                4
            );
        ELSE
            v_new_costo_prom := v_costo_unit;
        END IF;
    END IF;

    EXECUTE format($sql$
        INSERT INTO %I.inventario_movimientos
            (id, empresa_id, producto_id,
             tipo, fecha, periodo,
             cantidad, costo_unitario, costo_total, saldo_cantidad,
             moneda, costo_moneda, tasa_dolar,
             referencia, notas,
             descuento_tipo, descuento_valor, descuento_monto,
             recargo_tipo, recargo_valor, recargo_monto,
             base_iva, precio_venta_unitario)
        VALUES (
            %L, %L, %L,
            %L, %L, %L,
            (%L)::numeric, (%L)::numeric, (%L)::numeric, (%L)::numeric,
            COALESCE(NULLIF(%L,''), 'B'),
            CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END,
            CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END,
            COALESCE(%L,''), COALESCE(%L,''),
            NULLIF(%L,''), COALESCE(NULLIF(%L,'')::numeric, 0), COALESCE(NULLIF(%L,'')::numeric, 0),
            NULLIF(%L,''), COALESCE(NULLIF(%L,'')::numeric, 0), COALESCE(NULLIF(%L,'')::numeric, 0),
            COALESCE(NULLIF(%L,'')::numeric, (%L)::numeric),
            CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END
        )
        RETURNING row_to_json(inventario_movimientos)::jsonb
    $sql$,
        v_schema,
        v_id,
        p_row->>'empresa_id',
        v_producto_id,
        v_tipo, v_fecha, v_periodo,
        v_cantidad, v_costo_unit, v_costo_total, v_saldo_cant,
        p_row->>'moneda',
        p_row->>'costo_moneda', p_row->>'costo_moneda', p_row->>'costo_moneda',
        p_row->>'tasa_dolar',   p_row->>'tasa_dolar',   p_row->>'tasa_dolar',
        p_row->>'referencia', p_row->>'notas',
        p_row->>'descuento_tipo', p_row->>'descuento_valor', p_row->>'descuento_monto',
        p_row->>'recargo_tipo',   p_row->>'recargo_valor',   p_row->>'recargo_monto',
        p_row->>'base_iva', v_costo_total,
        p_row->>'precio_venta_unitario', p_row->>'precio_venta_unitario', p_row->>'precio_venta_unitario'
    ) INTO v_result;

    EXECUTE format(
        'UPDATE %I.inventario_productos
            SET existencia_actual = %L,
                costo_promedio    = %L,
                updated_at        = now()
          WHERE id = %L',
        v_schema, v_saldo_cant, v_new_costo_prom, v_producto_id
    );

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Backfill por tenant
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r        record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;

        -- Snapshot de movimientos rotos: salida con costo y saldo en cero.
        -- El JOIN trae el costo_promedio actual del producto, que se usa como
        -- COGS retroactivo. Productos sin compras previas tienen
        -- costo_promedio = 0 y los movimientos quedan con COGS = 0 (no hay
        -- base de costo histórica que recuperar).
        EXECUTE format($s$
            DROP TABLE IF EXISTS pg_temp.broken_outbound;
            CREATE TEMP TABLE broken_outbound AS
            SELECT
                m.id,
                m.producto_id,
                m.cantidad,
                p.costo_promedio AS avg_cost
            FROM %I.inventario_movimientos m
            JOIN %I.inventario_productos p ON p.id = m.producto_id
            WHERE m.tipo IN ('salida','autoconsumo','ajuste_negativo','devolucion_entrada')
              AND COALESCE(m.costo_unitario, 0) = 0
              AND COALESCE(m.saldo_cantidad, 0)  = 0
        $s$, v_schema, v_schema);

        -- Aplicar el descuento diferido a existencia_actual: una sola vez por
        -- producto, sumando todas las cantidades rotas.
        EXECUTE format($s$
            UPDATE %I.inventario_productos p
               SET existencia_actual = GREATEST(0, p.existencia_actual - d.qty),
                   updated_at        = now()
              FROM (
                  SELECT producto_id, SUM(cantidad) AS qty
                    FROM broken_outbound
                   GROUP BY producto_id
              ) d
             WHERE p.id = d.producto_id
        $s$, v_schema);

        -- Restaurar costo en los movimientos rotos.
        EXECUTE format($s$
            UPDATE %I.inventario_movimientos m
               SET costo_unitario = b.avg_cost,
                   costo_total    = ROUND(m.cantidad * b.avg_cost, 2)
              FROM broken_outbound b
             WHERE m.id = b.id
        $s$, v_schema);

        -- Replay cronológico de saldo_cantidad para todos los movimientos de
        -- cada producto afectado. Se respeta el orden (fecha, created_at) y
        -- el signo del tipo de movimiento.
        EXECUTE format($s$
            WITH ordered AS (
                SELECT
                    m.id,
                    m.producto_id,
                    CASE
                        WHEN m.tipo IN ('salida','autoconsumo','ajuste_negativo','devolucion_entrada')
                            THEN -m.cantidad
                        ELSE m.cantidad
                    END AS delta,
                    ROW_NUMBER() OVER (
                        PARTITION BY m.producto_id
                        ORDER BY m.fecha, m.created_at
                    ) AS rn
                FROM %I.inventario_movimientos m
                WHERE m.producto_id IN (SELECT DISTINCT producto_id FROM broken_outbound)
            ),
            cumulative AS (
                SELECT
                    id,
                    GREATEST(0, SUM(delta) OVER (
                        PARTITION BY producto_id ORDER BY rn
                    )) AS running_qty
                FROM ordered
            )
            UPDATE %I.inventario_movimientos m
               SET saldo_cantidad = c.running_qty
              FROM cumulative c
             WHERE m.id = c.id
        $s$, v_schema, v_schema);

        DROP TABLE IF EXISTS broken_outbound;
    END LOOP;
END;
$$;
