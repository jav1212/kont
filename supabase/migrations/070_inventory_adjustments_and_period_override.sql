-- =============================================================================
-- 070_inventory_adjustments_and_period_override.sql
--
-- Adds two line/header adjustments (descuento, recargo — each by amount or
-- percentage) on purchase invoices and movements, and lets the user override
-- the accounting período of an invoice independently from its date (date keeps
-- driving BCV; periodo decides which inventory month gets hit).
--
-- The math is authored in TypeScript at
-- `src/modules/inventory/shared/totals.ts` and is the single source of truth.
-- The save RPC trusts the frontend's resolved montos (descuento_monto,
-- recargo_monto, base_iva per line + monto fields on header) and rebuilds
-- subtotal/iva_monto/total from the per-line base_iva and alícuota — same
-- pattern as migration 068 trusted item costo_total but recomputed iva_monto.
--
-- Columns added (per tenant schema):
--   inventario_facturas_compra_items: 6 input cols + 2 resolved monto cols +
--     base_iva + iva_incluido
--   inventario_facturas_compra:        6 input cols + 2 resolved monto cols +
--     periodo_manual
--   inventario_movimientos:            6 input cols + 2 resolved monto cols +
--     base_iva
--
-- Functions changed:
--   tenant_inventario_factura_save         -- accept periodo_manual + ajustes
--   tenant_inventario_factura_get          -- return new columns
--   tenant_inventario_facturas_get         -- return new header columns
--   tenant_inventario_factura_confirmar    -- propagate ajustes to movimientos,
--                                              cost = base_iva / cantidad
--   tenant_inventario_movimientos_save     -- accept ajustes + base_iva
--   tenant_inventario_movimientos_get      -- return new columns
--   tenant_inventario_libro_compras        -- IVA bases from base_iva (already
--                                              includes line + header spread)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Backfill columns on every existing tenant schema
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r        record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;

        -- inventario_facturas_compra_items: line-level adjustments
        EXECUTE format($s$
            ALTER TABLE %I.inventario_facturas_compra_items
                ADD COLUMN IF NOT EXISTS descuento_tipo  text
                    CHECK (descuento_tipo IS NULL OR descuento_tipo IN ('monto','porcentaje')),
                ADD COLUMN IF NOT EXISTS descuento_valor numeric(14,4) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS descuento_monto numeric(14,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS recargo_tipo    text
                    CHECK (recargo_tipo   IS NULL OR recargo_tipo   IN ('monto','porcentaje')),
                ADD COLUMN IF NOT EXISTS recargo_valor   numeric(14,4) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS recargo_monto   numeric(14,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS base_iva        numeric(14,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS iva_incluido    boolean       DEFAULT false
        $s$, v_schema);

        -- Backfill base_iva for legacy rows (= costo_total when no adjustments)
        EXECUTE format($s$
            UPDATE %I.inventario_facturas_compra_items
            SET base_iva = costo_total
            WHERE base_iva IS NULL OR base_iva = 0
        $s$, v_schema);

        -- inventario_facturas_compra: header-level adjustments + periodo_manual
        EXECUTE format($s$
            ALTER TABLE %I.inventario_facturas_compra
                ADD COLUMN IF NOT EXISTS descuento_tipo  text
                    CHECK (descuento_tipo IS NULL OR descuento_tipo IN ('monto','porcentaje')),
                ADD COLUMN IF NOT EXISTS descuento_valor numeric(14,4) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS descuento_monto numeric(14,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS recargo_tipo    text
                    CHECK (recargo_tipo   IS NULL OR recargo_tipo   IN ('monto','porcentaje')),
                ADD COLUMN IF NOT EXISTS recargo_valor   numeric(14,4) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS recargo_monto   numeric(14,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS periodo_manual  boolean       DEFAULT false
        $s$, v_schema);

        -- inventario_movimientos: line-level adjustments
        EXECUTE format($s$
            ALTER TABLE %I.inventario_movimientos
                ADD COLUMN IF NOT EXISTS descuento_tipo  text
                    CHECK (descuento_tipo IS NULL OR descuento_tipo IN ('monto','porcentaje')),
                ADD COLUMN IF NOT EXISTS descuento_valor numeric(14,4) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS descuento_monto numeric(14,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS recargo_tipo    text
                    CHECK (recargo_tipo   IS NULL OR recargo_tipo   IN ('monto','porcentaje')),
                ADD COLUMN IF NOT EXISTS recargo_valor   numeric(14,4) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS recargo_monto   numeric(14,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS base_iva        numeric(14,2) DEFAULT 0
        $s$, v_schema);

        -- Backfill base_iva for legacy movements
        EXECUTE format($s$
            UPDATE %I.inventario_movimientos
            SET base_iva = costo_total
            WHERE base_iva IS NULL OR base_iva = 0
        $s$, v_schema);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. tenant_inventario_factura_save — accept periodo_manual + ajustes
-- ---------------------------------------------------------------------------
-- Persists frontend-resolved monto fields per item and on header, recomputes
-- subtotal/iva_monto/total from per-line base_iva and alícuota.
CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_save(
    p_user_id uuid,
    p_factura jsonb,
    p_items   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema         text;
    v_id             text;
    v_fecha          date;
    v_periodo        text;
    v_periodo_manual boolean;
    v_subtotal       numeric(14,2);
    v_iva_monto      numeric(14,2);
    v_total          numeric(14,2);
    v_item           jsonb;
    v_result         jsonb;
    v_estado         text;
BEGIN
    v_schema         := public.tenant_get_schema(p_user_id);
    v_id             := COALESCE(NULLIF(p_factura->>'id', ''), gen_random_uuid()::text);
    v_fecha          := COALESCE(NULLIF(p_factura->>'fecha', ''), CURRENT_DATE::text)::date;
    v_periodo_manual := COALESCE((NULLIF(p_factura->>'periodo_manual',''))::boolean, false);

    IF v_periodo_manual AND NULLIF(p_factura->>'periodo','') IS NOT NULL THEN
        v_periodo := p_factura->>'periodo';
    ELSE
        v_periodo := to_char(v_fecha, 'YYYY-MM');
    END IF;

    IF NULLIF(p_factura->>'id', '') IS NOT NULL THEN
        EXECUTE format(
            'SELECT estado FROM %I.inventario_facturas_compra WHERE id = %L',
            v_schema, v_id
        ) INTO v_estado;
        IF v_estado = 'confirmada' THEN
            RAISE EXCEPTION 'No se puede modificar una factura confirmada';
        END IF;
    END IF;

    -- Subtotal = Σ base_iva por línea (ya incluye line + header spread)
    SELECT COALESCE(SUM(COALESCE((item->>'base_iva')::numeric, (item->>'costo_total')::numeric, 0)), 0)
    INTO v_subtotal
    FROM jsonb_array_elements(p_items) AS item;

    -- IVA = Σ base_iva × alícuota
    SELECT ROUND(COALESCE(SUM(
        CASE COALESCE(item->>'iva_alicuota', 'general_16')
            WHEN 'reducida_8' THEN COALESCE((item->>'base_iva')::numeric, (item->>'costo_total')::numeric, 0) * 8  / 100
            WHEN 'general_16' THEN COALESCE((item->>'base_iva')::numeric, (item->>'costo_total')::numeric, 0) * 16 / 100
            ELSE 0
        END
    ), 0), 2)
    INTO v_iva_monto
    FROM jsonb_array_elements(p_items) AS item;

    v_total := v_subtotal + v_iva_monto;

    EXECUTE format($sql$
        INSERT INTO %I.inventario_facturas_compra
            (id, empresa_id, proveedor_id, numero_factura, numero_control,
             fecha, periodo, periodo_manual, estado,
             subtotal, iva_porcentaje, iva_monto, total, notas,
             tasa_dolar, tasa_decimales,
             descuento_tipo, descuento_valor, descuento_monto,
             recargo_tipo, recargo_valor, recargo_monto,
             updated_at)
        VALUES (
            %L, %L, %L, %L, %L,
            %L, %L, %L, 'borrador',
            %L, 0, %L, %L, COALESCE(%L, ''),
            CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END,
            CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::smallint END,
            NULLIF(%L,''), COALESCE(NULLIF(%L,'')::numeric, 0), COALESCE(NULLIF(%L,'')::numeric, 0),
            NULLIF(%L,''), COALESCE(NULLIF(%L,'')::numeric, 0), COALESCE(NULLIF(%L,'')::numeric, 0),
            now()
        )
        ON CONFLICT (id) DO UPDATE SET
            proveedor_id    = EXCLUDED.proveedor_id,
            numero_factura  = EXCLUDED.numero_factura,
            numero_control  = EXCLUDED.numero_control,
            fecha           = EXCLUDED.fecha,
            periodo         = EXCLUDED.periodo,
            periodo_manual  = EXCLUDED.periodo_manual,
            subtotal        = EXCLUDED.subtotal,
            iva_porcentaje  = 0,
            iva_monto       = EXCLUDED.iva_monto,
            total           = EXCLUDED.total,
            notas           = EXCLUDED.notas,
            tasa_dolar      = EXCLUDED.tasa_dolar,
            tasa_decimales  = EXCLUDED.tasa_decimales,
            descuento_tipo  = EXCLUDED.descuento_tipo,
            descuento_valor = EXCLUDED.descuento_valor,
            descuento_monto = EXCLUDED.descuento_monto,
            recargo_tipo    = EXCLUDED.recargo_tipo,
            recargo_valor   = EXCLUDED.recargo_valor,
            recargo_monto   = EXCLUDED.recargo_monto,
            updated_at      = now()
        RETURNING row_to_json(inventario_facturas_compra)
    $sql$,
        v_schema,
        v_id,
        p_factura->>'empresa_id',
        p_factura->>'proveedor_id',
        COALESCE(p_factura->>'numero_factura', ''),
        COALESCE(p_factura->>'numero_control', ''),
        v_fecha,
        v_periodo,
        v_periodo_manual,
        v_subtotal,
        v_iva_monto,
        v_total,
        p_factura->>'notas',
        p_factura->>'tasa_dolar',     p_factura->>'tasa_dolar',     p_factura->>'tasa_dolar',
        p_factura->>'tasa_decimales', p_factura->>'tasa_decimales', p_factura->>'tasa_decimales',
        p_factura->>'descuento_tipo', p_factura->>'descuento_valor', p_factura->>'descuento_monto',
        p_factura->>'recargo_tipo',   p_factura->>'recargo_valor',   p_factura->>'recargo_monto'
    ) INTO v_result;

    EXECUTE format('DELETE FROM %I.inventario_facturas_compra_items WHERE factura_id = %L', v_schema, v_id);

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        EXECUTE format($sql$
            INSERT INTO %I.inventario_facturas_compra_items
                (id, factura_id, producto_id, cantidad, costo_unitario, costo_total,
                 iva_alicuota, moneda, costo_moneda, tasa_dolar,
                 descuento_tipo, descuento_valor, descuento_monto,
                 recargo_tipo, recargo_valor, recargo_monto,
                 base_iva, iva_incluido)
            VALUES (
                gen_random_uuid()::text, %L, %L,
                (%L)::numeric, (%L)::numeric, (%L)::numeric,
                COALESCE(NULLIF(%L,''), 'general_16'),
                COALESCE(NULLIF(%L,''), 'B'),
                CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END,
                CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END,
                NULLIF(%L,''), COALESCE(NULLIF(%L,'')::numeric, 0), COALESCE(NULLIF(%L,'')::numeric, 0),
                NULLIF(%L,''), COALESCE(NULLIF(%L,'')::numeric, 0), COALESCE(NULLIF(%L,'')::numeric, 0),
                COALESCE(NULLIF(%L,'')::numeric, (%L)::numeric),
                COALESCE((NULLIF(%L,''))::boolean, false)
            )
        $sql$,
            v_schema, v_id,
            v_item->>'producto_id',
            v_item->>'cantidad', v_item->>'costo_unitario', v_item->>'costo_total',
            v_item->>'iva_alicuota',
            v_item->>'moneda',
            v_item->>'costo_moneda', v_item->>'costo_moneda', v_item->>'costo_moneda',
            v_item->>'tasa_dolar',   v_item->>'tasa_dolar',   v_item->>'tasa_dolar',
            v_item->>'descuento_tipo', v_item->>'descuento_valor', v_item->>'descuento_monto',
            v_item->>'recargo_tipo',   v_item->>'recargo_valor',   v_item->>'recargo_monto',
            v_item->>'base_iva', v_item->>'costo_total',
            v_item->>'iva_incluido'
        );
    END LOOP;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. tenant_inventario_factura_get — return new columns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_get(
    p_user_id    uuid,
    p_factura_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema  text;
    v_factura jsonb;
    v_items   jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        $q$SELECT jsonb_build_object(
            'id',               f.id,
            'empresa_id',       f.empresa_id,
            'proveedor_id',     f.proveedor_id,
            'proveedor_nombre', pv.nombre,
            'numero_factura',   f.numero_factura,
            'numero_control',   f.numero_control,
            'fecha',            f.fecha,
            'periodo',          f.periodo,
            'periodo_manual',   f.periodo_manual,
            'estado',           f.estado,
            'subtotal',         f.subtotal,
            'iva_porcentaje',   f.iva_porcentaje,
            'iva_monto',        f.iva_monto,
            'total',            f.total,
            'notas',            f.notas,
            'tasa_dolar',       f.tasa_dolar,
            'tasa_decimales',   f.tasa_decimales,
            'descuento_tipo',   f.descuento_tipo,
            'descuento_valor',  f.descuento_valor,
            'descuento_monto',  f.descuento_monto,
            'recargo_tipo',     f.recargo_tipo,
            'recargo_valor',    f.recargo_valor,
            'recargo_monto',    f.recargo_monto,
            'confirmada_at',    f.confirmada_at,
            'created_at',       f.created_at,
            'updated_at',       f.updated_at
        )
        FROM %I.inventario_facturas_compra f
        JOIN %I.inventario_proveedores pv ON pv.id = f.proveedor_id
        WHERE f.id = %L$q$,
        v_schema, v_schema, p_factura_id
    ) INTO v_factura;

    EXECUTE format(
        $q$SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',              i.id,
                'factura_id',      i.factura_id,
                'producto_id',     i.producto_id,
                'producto_nombre', p.nombre,
                'cantidad',        i.cantidad,
                'costo_unitario',  i.costo_unitario,
                'costo_total',     i.costo_total,
                'iva_alicuota',    i.iva_alicuota,
                'moneda',          i.moneda,
                'costo_moneda',    i.costo_moneda,
                'tasa_dolar',      i.tasa_dolar,
                'descuento_tipo',  i.descuento_tipo,
                'descuento_valor', i.descuento_valor,
                'descuento_monto', i.descuento_monto,
                'recargo_tipo',    i.recargo_tipo,
                'recargo_valor',   i.recargo_valor,
                'recargo_monto',   i.recargo_monto,
                'base_iva',        i.base_iva,
                'iva_incluido',    i.iva_incluido
            ) ORDER BY i.created_at ASC
        ), '[]'::jsonb)
        FROM %I.inventario_facturas_compra_items i
        JOIN %I.inventario_productos p ON p.id = i.producto_id
        WHERE i.factura_id = %L$q$,
        v_schema, v_schema, p_factura_id
    ) INTO v_items;

    RETURN v_factura || jsonb_build_object('items', v_items);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. tenant_inventario_facturas_get — list returns new header columns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_facturas_get(
    p_user_id    uuid,
    p_empresa_id text
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
                'id',               f.id,
                'empresa_id',       f.empresa_id,
                'proveedor_id',     f.proveedor_id,
                'proveedor_nombre', pv.nombre,
                'numero_factura',   f.numero_factura,
                'numero_control',   f.numero_control,
                'fecha',            f.fecha,
                'periodo',          f.periodo,
                'periodo_manual',   f.periodo_manual,
                'estado',           f.estado,
                'subtotal',         f.subtotal,
                'iva_porcentaje',   f.iva_porcentaje,
                'iva_monto',        f.iva_monto,
                'total',            f.total,
                'notas',            f.notas,
                'tasa_dolar',       f.tasa_dolar,
                'tasa_decimales',   f.tasa_decimales,
                'descuento_tipo',   f.descuento_tipo,
                'descuento_valor',  f.descuento_valor,
                'descuento_monto',  f.descuento_monto,
                'recargo_tipo',     f.recargo_tipo,
                'recargo_valor',    f.recargo_valor,
                'recargo_monto',    f.recargo_monto,
                'confirmada_at',    f.confirmada_at,
                'created_at',       f.created_at,
                'updated_at',       f.updated_at
            ) ORDER BY f.fecha DESC, f.created_at DESC
        ), '[]'::jsonb)
        FROM %I.inventario_facturas_compra f
        JOIN %I.inventario_proveedores pv ON pv.id = f.proveedor_id
        WHERE f.empresa_id = %L$q$,
        v_schema, v_schema, p_empresa_id
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. tenant_inventario_factura_confirmar — propaga ajustes a movimientos
-- ---------------------------------------------------------------------------
-- Genera movimientos type='entrada' usando el período del header (que ya
-- respeta el override manual) y un costo_unitario derivado de base_iva /
-- cantidad — i.e. el costo neto real pagado por unidad después de todos los
-- descuentos/recargos (incluyendo el spread del header).
CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_confirmar(
    p_user_id    uuid,
    p_factura_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema           text;
    v_factura          record;
    v_item             record;
    v_existencia_act   numeric(14,4);
    v_costo_prom       numeric(14,4);
    v_new_existencia   numeric(14,4);
    v_new_costo_prom   numeric(14,4);
    v_costo_unit_real  numeric(14,4);
    v_costo_total_real numeric(14,2);
    v_result           jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'SELECT * FROM %I.inventario_facturas_compra WHERE id = %L',
        v_schema, p_factura_id
    ) INTO v_factura;

    IF v_factura IS NULL THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
    IF v_factura.estado = 'confirmada' THEN RAISE EXCEPTION 'La factura ya está confirmada'; END IF;

    EXECUTE format(
        'UPDATE %I.inventario_facturas_compra SET estado=''confirmada'', confirmada_at=now(), updated_at=now() WHERE id=%L',
        v_schema, p_factura_id
    );

    FOR v_item IN
        EXECUTE format(
            'SELECT * FROM %I.inventario_facturas_compra_items WHERE factura_id = %L',
            v_schema, p_factura_id
        )
    LOOP
        -- costo_unitario real = base_iva / cantidad (incluye line + header ajustes).
        -- Fallback a costo_unitario crudo si base_iva es 0/NULL (legacy).
        IF v_item.cantidad > 0 AND COALESCE(v_item.base_iva, 0) > 0 THEN
            v_costo_unit_real  := ROUND(v_item.base_iva / v_item.cantidad, 4);
            v_costo_total_real := ROUND(v_item.base_iva, 2);
        ELSE
            v_costo_unit_real  := v_item.costo_unitario;
            v_costo_total_real := v_item.costo_total;
        END IF;

        EXECUTE format(
            'SELECT existencia_actual, costo_promedio FROM %I.inventario_productos WHERE id = %L',
            v_schema, v_item.producto_id
        ) INTO v_existencia_act, v_costo_prom;

        v_new_existencia := v_existencia_act + v_item.cantidad;

        IF v_existencia_act > 0 THEN
            v_new_costo_prom := (v_existencia_act * v_costo_prom + v_item.cantidad * v_costo_unit_real)
                                / v_new_existencia;
        ELSE
            v_new_costo_prom := v_costo_unit_real;
        END IF;

        EXECUTE format(
            'UPDATE %I.inventario_productos SET existencia_actual=%L, costo_promedio=%L, updated_at=now() WHERE id=%L',
            v_schema, v_new_existencia, v_new_costo_prom, v_item.producto_id
        );

        EXECUTE format($sql$
            INSERT INTO %I.inventario_movimientos
                (id, empresa_id, producto_id, tipo, fecha, periodo,
                 cantidad, costo_unitario, costo_total, saldo_cantidad,
                 moneda, costo_moneda, tasa_dolar, referencia, notas, factura_compra_id,
                 descuento_tipo, descuento_valor, descuento_monto,
                 recargo_tipo, recargo_valor, recargo_monto,
                 base_iva)
            VALUES (
                gen_random_uuid()::text,
                %L, %L, 'entrada', %L, %L,
                %L, %L, %L, %L,
                %L, %L, %L, %L, '', %L,
                %L, %L, %L,
                %L, %L, %L,
                %L
            )
        $sql$,
            v_schema,
            v_factura.empresa_id, v_item.producto_id,
            v_factura.fecha, v_factura.periodo,
            v_item.cantidad, v_costo_unit_real,
            v_costo_total_real, v_new_existencia,
            v_item.moneda, v_item.costo_moneda, v_item.tasa_dolar,
            COALESCE(v_factura.numero_factura, ''),
            p_factura_id,
            v_item.descuento_tipo, COALESCE(v_item.descuento_valor, 0), COALESCE(v_item.descuento_monto, 0),
            v_item.recargo_tipo,   COALESCE(v_item.recargo_valor,   0), COALESCE(v_item.recargo_monto,   0),
            COALESCE(v_item.base_iva, v_costo_total_real)
        );
    END LOOP;

    EXECUTE format(
        'SELECT row_to_json(f)::jsonb FROM %I.inventario_facturas_compra f WHERE f.id = %L',
        v_schema, p_factura_id
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. tenant_inventario_movimientos_save — accept ajustes + base_iva
-- ---------------------------------------------------------------------------
-- Mantiene el contrato legacy (tipo, fecha, cantidad, costo_unitario,
-- costo_total, saldo_cantidad) pero acepta los 7 campos nuevos de ajustes.
-- El período sigue derivándose de la fecha (sin override en manual).
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
             base_iva)
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
            COALESCE(NULLIF(%L,'')::numeric, (%L)::numeric)
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
        p_row->>'base_iva', p_row->>'costo_total'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. tenant_inventario_movimientos_get — return new columns
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
                'id',              m.id,
                'empresa_id',      m.empresa_id,
                'producto_id',     m.producto_id,
                'producto_nombre', p.nombre,
                'tipo',            m.tipo,
                'fecha',           m.fecha,
                'periodo',         m.periodo,
                'cantidad',        m.cantidad,
                'costo_unitario',  m.costo_unitario,
                'costo_total',     m.costo_total,
                'saldo_cantidad',  m.saldo_cantidad,
                'referencia',      m.referencia,
                'notas',           m.notas,
                'moneda',          m.moneda,
                'costo_moneda',    m.costo_moneda,
                'tasa_dolar',      m.tasa_dolar,
                'descuento_tipo',  m.descuento_tipo,
                'descuento_valor', m.descuento_valor,
                'descuento_monto', m.descuento_monto,
                'recargo_tipo',    m.recargo_tipo,
                'recargo_valor',   m.recargo_valor,
                'recargo_monto',   m.recargo_monto,
                'base_iva',        m.base_iva,
                'created_at',      m.created_at
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

-- ---------------------------------------------------------------------------
-- 8. tenant_inventario_libro_compras — IVA bases derive from base_iva
-- ---------------------------------------------------------------------------
-- base_iva ya incluye descuentos/recargos a nivel línea + el prorrateo
-- proporcional del header, así que las bases por alícuota se suman
-- directamente desde ahí (no desde costo_total).
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
                'base_exenta',      COALESCE(exenta.monto,    0),
                'base_gravada_8',   COALESCE(gravada8.monto,  0),
                'iva_8',            ROUND(COALESCE(gravada8.monto,  0) * 8  / 100, 2),
                'base_gravada_16',  COALESCE(gravada16.monto, 0),
                'iva_16',           ROUND(COALESCE(gravada16.monto, 0) * 16 / 100, 2),
                'total',            f.total
            ) ORDER BY f.fecha ASC, f.numero_factura ASC
        ), '[]'::jsonb)
        FROM %I.inventario_facturas_compra f
        JOIN %I.inventario_proveedores pv ON pv.id = f.proveedor_id
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(COALESCE(NULLIF(i.base_iva,0), i.costo_total)), 0) AS monto
            FROM %I.inventario_facturas_compra_items i
            WHERE i.factura_id = f.id AND i.iva_alicuota = 'exenta'
        ) exenta ON true
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(COALESCE(NULLIF(i.base_iva,0), i.costo_total)), 0) AS monto
            FROM %I.inventario_facturas_compra_items i
            WHERE i.factura_id = f.id AND i.iva_alicuota = 'reducida_8'
        ) gravada8 ON true
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(COALESCE(NULLIF(i.base_iva,0), i.costo_total)), 0) AS monto
            FROM %I.inventario_facturas_compra_items i
            WHERE i.factura_id = f.id AND i.iva_alicuota = 'general_16'
        ) gravada16 ON true
        WHERE f.empresa_id = %L
          AND f.periodo    = %L
          AND f.estado     = 'confirmada'
    $q$,
        v_schema, v_schema, v_schema, v_schema,
        p_empresa_id, p_periodo
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
