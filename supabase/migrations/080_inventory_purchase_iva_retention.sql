-- =============================================================================
-- 080_inventory_purchase_iva_retention.sql
--
-- IVA retention on purchase invoices (contribuyentes especiales).
-- Adds two header-level columns to `inventario_facturas_compra`:
--   * retencion_iva_pct   numeric(5,2)  — 0 / 75 / 100 (or any pct)
--   * retencion_iva_monto numeric(14,2) — server-resolved Bs amount
--
-- The retention is a POST-IVA discount: it does NOT touch base imponible nor
-- IVA débito; it just reduces the amount paid to the supplier (the retained
-- amount is enterado a SENIAT). Stored at header level (not per-line), since
-- the user's case applies a single retention rate to the whole invoice's IVA.
--
-- Functions affected:
--   tenant_inventario_factura_save     — accept + persist + recompute retencion_iva_monto
--   tenant_inventario_factura_get      — return retencion_iva_*
--   tenant_inventario_facturas_get     — return retencion_iva_*
--   tenant_inventario_libro_compras    — add `iva_retenido` column
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Schema columns (per-tenant)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r        record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;
        EXECUTE format($s$
            ALTER TABLE %I.inventario_facturas_compra
                ADD COLUMN IF NOT EXISTS retencion_iva_pct   numeric(5,2)  DEFAULT 0,
                ADD COLUMN IF NOT EXISTS retencion_iva_monto numeric(14,2) DEFAULT 0
        $s$, v_schema);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. tenant_inventario_factura_save — accept retencion_iva_pct
-- ---------------------------------------------------------------------------
-- Server resolves retencion_iva_monto = ROUND(iva_monto × pct/100, 2). The
-- frontend only sends the pct (0 / 75 / 100); the monto is authoritative
-- here so it never drifts from the recomputed iva_monto.
CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_save(
    p_user_id uuid,
    p_factura jsonb,
    p_items   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema             text;
    v_id                 text;
    v_fecha              date;
    v_periodo            text;
    v_periodo_manual     boolean;
    v_subtotal           numeric(14,2);
    v_iva_monto          numeric(14,2);
    v_total              numeric(14,2);
    v_retencion_iva_pct  numeric(5,2);
    v_retencion_iva_monto numeric(14,2);
    v_item               jsonb;
    v_result             jsonb;
    v_estado             text;
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

    -- Retención IVA — pct from frontend, monto recomputed authoritatively here.
    v_retencion_iva_pct  := COALESCE(NULLIF(p_factura->>'retencion_iva_pct','')::numeric, 0);
    IF v_retencion_iva_pct < 0 OR v_retencion_iva_pct > 100 THEN
        RAISE EXCEPTION 'retencion_iva_pct fuera de rango (0–100): %', v_retencion_iva_pct;
    END IF;
    v_retencion_iva_monto := ROUND(v_iva_monto * v_retencion_iva_pct / 100, 2);

    EXECUTE format($sql$
        INSERT INTO %I.inventario_facturas_compra
            (id, empresa_id, proveedor_id, numero_factura, numero_control,
             fecha, periodo, periodo_manual, estado,
             subtotal, iva_porcentaje, iva_monto, total, notas,
             tasa_dolar, tasa_decimales,
             descuento_tipo, descuento_valor, descuento_monto,
             recargo_tipo, recargo_valor, recargo_monto,
             retencion_iva_pct, retencion_iva_monto,
             updated_at)
        VALUES (
            %L, %L, %L, %L, %L,
            %L, %L, %L, 'borrador',
            %L, 0, %L, %L, COALESCE(%L, ''),
            CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END,
            CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::smallint END,
            NULLIF(%L,''), COALESCE(NULLIF(%L,'')::numeric, 0), COALESCE(NULLIF(%L,'')::numeric, 0),
            NULLIF(%L,''), COALESCE(NULLIF(%L,'')::numeric, 0), COALESCE(NULLIF(%L,'')::numeric, 0),
            %L, %L,
            now()
        )
        ON CONFLICT (id) DO UPDATE SET
            proveedor_id        = EXCLUDED.proveedor_id,
            numero_factura      = EXCLUDED.numero_factura,
            numero_control      = EXCLUDED.numero_control,
            fecha               = EXCLUDED.fecha,
            periodo             = EXCLUDED.periodo,
            periodo_manual      = EXCLUDED.periodo_manual,
            subtotal            = EXCLUDED.subtotal,
            iva_porcentaje      = 0,
            iva_monto           = EXCLUDED.iva_monto,
            total               = EXCLUDED.total,
            notas               = EXCLUDED.notas,
            tasa_dolar          = EXCLUDED.tasa_dolar,
            tasa_decimales      = EXCLUDED.tasa_decimales,
            descuento_tipo      = EXCLUDED.descuento_tipo,
            descuento_valor     = EXCLUDED.descuento_valor,
            descuento_monto     = EXCLUDED.descuento_monto,
            recargo_tipo        = EXCLUDED.recargo_tipo,
            recargo_valor       = EXCLUDED.recargo_valor,
            recargo_monto       = EXCLUDED.recargo_monto,
            retencion_iva_pct   = EXCLUDED.retencion_iva_pct,
            retencion_iva_monto = EXCLUDED.retencion_iva_monto,
            updated_at          = now()
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
        p_factura->>'recargo_tipo',   p_factura->>'recargo_valor',   p_factura->>'recargo_monto',
        v_retencion_iva_pct, v_retencion_iva_monto
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
-- 3. tenant_inventario_factura_get — return retencion_iva_*
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
            'id',                  f.id,
            'empresa_id',          f.empresa_id,
            'proveedor_id',        f.proveedor_id,
            'proveedor_nombre',    pv.nombre,
            'numero_factura',      f.numero_factura,
            'numero_control',      f.numero_control,
            'fecha',               f.fecha,
            'periodo',             f.periodo,
            'periodo_manual',      f.periodo_manual,
            'estado',              f.estado,
            'subtotal',            f.subtotal,
            'iva_porcentaje',      f.iva_porcentaje,
            'iva_monto',           f.iva_monto,
            'total',               f.total,
            'notas',               f.notas,
            'tasa_dolar',          f.tasa_dolar,
            'tasa_decimales',      f.tasa_decimales,
            'descuento_tipo',      f.descuento_tipo,
            'descuento_valor',     f.descuento_valor,
            'descuento_monto',     f.descuento_monto,
            'recargo_tipo',        f.recargo_tipo,
            'recargo_valor',       f.recargo_valor,
            'recargo_monto',       f.recargo_monto,
            'retencion_iva_pct',   f.retencion_iva_pct,
            'retencion_iva_monto', f.retencion_iva_monto,
            'confirmada_at',       f.confirmada_at,
            'created_at',          f.created_at,
            'updated_at',          f.updated_at
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
-- 4. tenant_inventario_facturas_get — list returns retencion_iva_*
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
                'id',                  f.id,
                'empresa_id',          f.empresa_id,
                'proveedor_id',        f.proveedor_id,
                'proveedor_nombre',    pv.nombre,
                'numero_factura',      f.numero_factura,
                'numero_control',      f.numero_control,
                'fecha',               f.fecha,
                'periodo',             f.periodo,
                'periodo_manual',      f.periodo_manual,
                'estado',              f.estado,
                'subtotal',            f.subtotal,
                'iva_porcentaje',      f.iva_porcentaje,
                'iva_monto',           f.iva_monto,
                'total',               f.total,
                'notas',               f.notas,
                'tasa_dolar',          f.tasa_dolar,
                'tasa_decimales',      f.tasa_decimales,
                'descuento_tipo',      f.descuento_tipo,
                'descuento_valor',     f.descuento_valor,
                'descuento_monto',     f.descuento_monto,
                'recargo_tipo',        f.recargo_tipo,
                'recargo_valor',       f.recargo_valor,
                'recargo_monto',       f.recargo_monto,
                'retencion_iva_pct',   f.retencion_iva_pct,
                'retencion_iva_monto', f.retencion_iva_monto,
                'confirmada_at',       f.confirmada_at,
                'created_at',          f.created_at,
                'updated_at',          f.updated_at
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
-- 5. tenant_inventario_libro_compras — add iva_retenido column
-- ---------------------------------------------------------------------------
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
                'iva_retenido',     COALESCE(f.retencion_iva_monto, 0),
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
