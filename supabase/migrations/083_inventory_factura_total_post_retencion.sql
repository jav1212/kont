-- =============================================================================
-- 083_inventory_factura_total_post_retencion.sql
--
-- Cambia la semántica del campo `total` de inventario_facturas_compra: ahora
-- representa el monto efectivamente pagado al proveedor (= subtotal + IVA −
-- retención IVA), no el monto facturado bruto.
--
-- Motivación: el contador prefiere ver en libros y listados el monto que sale
-- de caja, no el bruto facturado. La retención sigue persistida en
-- `retencion_iva_monto`, así que el bruto se puede recomputar como
-- total + retencion_iva_monto cuando se necesite (libro de compras, reportes
-- ISLR/IVA, etc.).
--
-- Cambios:
--   1. tenant_inventario_factura_save:
--        v_total := v_subtotal + v_iva_monto - v_retencion_iva_monto
--   2. Backfill de filas existentes: total ← total − retencion_iva_monto
--      cuando retencion_iva_monto > 0.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. tenant_inventario_factura_save — total = subtotal + IVA − retención
-- ---------------------------------------------------------------------------
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

    -- Retención IVA — pct from frontend, monto recomputed authoritatively here.
    v_retencion_iva_pct  := COALESCE(NULLIF(p_factura->>'retencion_iva_pct','')::numeric, 0);
    IF v_retencion_iva_pct < 0 OR v_retencion_iva_pct > 100 THEN
        RAISE EXCEPTION 'retencion_iva_pct fuera de rango (0–100): %', v_retencion_iva_pct;
    END IF;
    v_retencion_iva_monto := ROUND(v_iva_monto * v_retencion_iva_pct / 100, 2);

    -- Total = lo que efectivamente se gira al proveedor (post-retención).
    v_total := v_subtotal + v_iva_monto - v_retencion_iva_monto;

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
-- 2. Backfill: filas existentes con retención usaban total bruto (pre-retención).
-- Ajustamos a la nueva semántica: total ← total − retencion_iva_monto.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r        record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;
        EXECUTE format($s$
            UPDATE %I.inventario_facturas_compra
               SET total = total - retencion_iva_monto
             WHERE COALESCE(retencion_iva_monto, 0) > 0
        $s$, v_schema);
    END LOOP;
END;
$$;
