-- =============================================================================
-- 074_inventory_precio_venta_unitario.sql
--
-- Restaura `precio_venta_unitario` en `inventario_movimientos` (nullable) para
-- las salidas. Las entradas dejan el campo NULL — siguen valoradas a costo.
--
-- Este campo persiste por línea el precio de venta sin IVA por unidad. La
-- columna fue introducida originalmente en mig 019 (libro de ventas) y
-- eliminada en mig 037 al simplificarse los tipos de salida; ahora retorna
-- para soportar el generador aleatorio de salidas que distribuye un monto
-- objetivo (con margen) sobre líneas múltiples.
--
-- Tabla afectada: inventario_movimientos (en cada tenant schema)
-- Funciones afectadas:
--   tenant_inventario_movimientos_save  -- acepta precio_venta_unitario
--   tenant_inventario_movimientos_get   -- retorna precio_venta_unitario
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Backfill: agregar columna en cada tenant
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r        record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;
        EXECUTE format($s$
            ALTER TABLE %I.inventario_movimientos
                ADD COLUMN IF NOT EXISTS precio_venta_unitario numeric(14,4) DEFAULT NULL
        $s$, v_schema);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. tenant_inventario_movimientos_save — acepta precio_venta_unitario
-- ---------------------------------------------------------------------------
-- Se mantiene idéntico a 070 pero con el campo nuevo: NULL si no viene en el
-- payload, numeric si llega.
CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_save(
    p_user_id uuid,
    p_row     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema   text;
    v_id       text;
    v_fecha    date;
    v_periodo  text;
    v_result   jsonb;
BEGIN
    v_schema  := public.tenant_get_schema(p_user_id);
    v_id      := COALESCE(NULLIF(p_row->>'id',''), gen_random_uuid()::text);
    v_fecha   := COALESCE(NULLIF(p_row->>'fecha',''), CURRENT_DATE::text)::date;
    v_periodo := to_char(v_fecha, 'YYYY-MM');

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
        p_row->>'producto_id',
        p_row->>'tipo', v_fecha, v_periodo,
        p_row->>'cantidad', p_row->>'costo_unitario', p_row->>'costo_total', p_row->>'saldo_cantidad',
        p_row->>'moneda',
        p_row->>'costo_moneda', p_row->>'costo_moneda', p_row->>'costo_moneda',
        p_row->>'tasa_dolar',   p_row->>'tasa_dolar',   p_row->>'tasa_dolar',
        p_row->>'referencia', p_row->>'notas',
        p_row->>'descuento_tipo', p_row->>'descuento_valor', p_row->>'descuento_monto',
        p_row->>'recargo_tipo',   p_row->>'recargo_valor',   p_row->>'recargo_monto',
        p_row->>'base_iva', p_row->>'costo_total',
        p_row->>'precio_venta_unitario', p_row->>'precio_venta_unitario', p_row->>'precio_venta_unitario'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. tenant_inventario_movimientos_get — retorna precio_venta_unitario
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_get(
    p_user_id    uuid,
    p_empresa_id text,
    p_periodo    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        $q$SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',                    m.id,
                'empresa_id',            m.empresa_id,
                'producto_id',           m.producto_id,
                'producto_nombre',       p.nombre,
                'tipo',                  m.tipo,
                'fecha',                 m.fecha,
                'periodo',               m.periodo,
                'cantidad',              m.cantidad,
                'costo_unitario',        m.costo_unitario,
                'costo_total',           m.costo_total,
                'saldo_cantidad',        m.saldo_cantidad,
                'referencia',            m.referencia,
                'notas',                 m.notas,
                'moneda',                m.moneda,
                'costo_moneda',          m.costo_moneda,
                'tasa_dolar',            m.tasa_dolar,
                'descuento_tipo',        m.descuento_tipo,
                'descuento_valor',       m.descuento_valor,
                'descuento_monto',       m.descuento_monto,
                'recargo_tipo',          m.recargo_tipo,
                'recargo_valor',         m.recargo_valor,
                'recargo_monto',         m.recargo_monto,
                'base_iva',              m.base_iva,
                'precio_venta_unitario', m.precio_venta_unitario,
                'created_at',            m.created_at
            ) ORDER BY m.fecha DESC, m.created_at DESC
        ), '[]'::jsonb)
        FROM %I.inventario_movimientos m
        JOIN %I.inventario_productos p ON p.id = m.producto_id
        WHERE m.empresa_id = %L
        $q$ ||
        CASE WHEN p_periodo IS NOT NULL AND p_periodo <> ''
             THEN format(' AND m.periodo = %L', p_periodo)
             ELSE '' END,
        v_schema, v_schema, p_empresa_id
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
