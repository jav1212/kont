-- =============================================================================
-- 068_inventory_factura_rate_edit.sql
--
-- Persists the BCV rate and chosen decimal precision at the invoice header
-- level so the values the accountant actually used are stored with the
-- invoice. Adds a `desconfirmar` RPC that reverts movements and flips the
-- invoice back to `borrador` — lets the frontend orchestrate edits of
-- already-confirmed invoices as: unconfirm → save → confirm again.
--
-- Columns added:
--   inventario_facturas_compra.tasa_dolar       numeric(14,6)  -- header-level BCV rate
--   inventario_facturas_compra.tasa_decimales   smallint       -- decimals the user chose
--
-- Functions changed:
--   tenant_inventario_factura_save         -- accept/persist tasa_dolar + tasa_decimales
--   tenant_inventario_factura_get          -- return tasa_dolar + tasa_decimales
--   tenant_inventario_facturas_get         -- return tasa_dolar + tasa_decimales
--
-- Functions added:
--   tenant_inventario_factura_desconfirmar -- revert movements, set estado='borrador'
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Backfill columns on existing tenant schemas
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r        record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;

        EXECUTE format(
            'ALTER TABLE %I.inventario_facturas_compra ADD COLUMN IF NOT EXISTS tasa_dolar numeric(14,6)',
            v_schema
        );
        EXECUTE format(
            'ALTER TABLE %I.inventario_facturas_compra ADD COLUMN IF NOT EXISTS tasa_decimales smallint',
            v_schema
        );
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. tenant_inventario_factura_save — persists tasa_dolar + tasa_decimales
-- ---------------------------------------------------------------------------
-- Keeps all prior behaviour from migration 023: blocks updates to confirmed
-- invoices, recomputes subtotal + IVA from items, replaces item rows. Adds
-- two columns to the upsert.
CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_save(
    p_user_id uuid,
    p_factura jsonb,
    p_items   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema    text;
    v_id        text;
    v_fecha     date;
    v_periodo   text;
    v_subtotal  numeric(14,2);
    v_iva_monto numeric(14,2);
    v_total     numeric(14,2);
    v_item      jsonb;
    v_result    jsonb;
    v_estado    text;
BEGIN
    v_schema  := public.tenant_get_schema(p_user_id);
    v_id      := COALESCE(NULLIF(p_factura->>'id', ''), gen_random_uuid()::text);
    v_fecha   := COALESCE(NULLIF(p_factura->>'fecha', ''), CURRENT_DATE::text)::date;
    v_periodo := to_char(v_fecha, 'YYYY-MM');

    IF NULLIF(p_factura->>'id', '') IS NOT NULL THEN
        EXECUTE format(
            'SELECT estado FROM %I.inventario_facturas_compra WHERE id = %L',
            v_schema, v_id
        ) INTO v_estado;
        IF v_estado = 'confirmada' THEN
            RAISE EXCEPTION 'No se puede modificar una factura confirmada';
        END IF;
    END IF;

    -- Subtotal (siempre en Bs)
    SELECT COALESCE(SUM((item->>'costo_total')::numeric), 0)
    INTO v_subtotal
    FROM jsonb_array_elements(p_items) AS item;

    -- IVA por alícuota
    SELECT ROUND(COALESCE(SUM(
        CASE COALESCE(item->>'iva_alicuota', 'general_16')
            WHEN 'reducida_8' THEN (item->>'costo_total')::numeric * 8  / 100
            WHEN 'general_16' THEN (item->>'costo_total')::numeric * 16 / 100
            ELSE 0
        END
    ), 0), 2)
    INTO v_iva_monto
    FROM jsonb_array_elements(p_items) AS item;

    v_total := v_subtotal + v_iva_monto;

    EXECUTE format($sql$
        INSERT INTO %I.inventario_facturas_compra
            (id, empresa_id, proveedor_id, numero_factura, numero_control,
             fecha, periodo, estado, subtotal, iva_porcentaje, iva_monto, total, notas,
             tasa_dolar, tasa_decimales, updated_at)
        VALUES (
            %L, %L, %L, %L, %L, %L, %L, 'borrador',
            %L, 0, %L, %L, COALESCE(%L, ''),
            CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END,
            CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::smallint END,
            now()
        )
        ON CONFLICT (id) DO UPDATE SET
            proveedor_id    = EXCLUDED.proveedor_id,
            numero_factura  = EXCLUDED.numero_factura,
            numero_control  = EXCLUDED.numero_control,
            fecha           = EXCLUDED.fecha,
            periodo         = EXCLUDED.periodo,
            subtotal        = EXCLUDED.subtotal,
            iva_porcentaje  = 0,
            iva_monto       = EXCLUDED.iva_monto,
            total           = EXCLUDED.total,
            notas           = EXCLUDED.notas,
            tasa_dolar      = EXCLUDED.tasa_dolar,
            tasa_decimales  = EXCLUDED.tasa_decimales,
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
        v_subtotal,
        v_iva_monto,
        v_total,
        p_factura->>'notas',
        p_factura->>'tasa_dolar',     p_factura->>'tasa_dolar',     p_factura->>'tasa_dolar',
        p_factura->>'tasa_decimales', p_factura->>'tasa_decimales', p_factura->>'tasa_decimales'
    ) INTO v_result;

    EXECUTE format('DELETE FROM %I.inventario_facturas_compra_items WHERE factura_id = %L', v_schema, v_id);

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        EXECUTE format($sql$
            INSERT INTO %I.inventario_facturas_compra_items
                (id, factura_id, producto_id, cantidad, costo_unitario, costo_total,
                 iva_alicuota, moneda, costo_moneda, tasa_dolar)
            VALUES (
                gen_random_uuid()::text, %L, %L,
                (%L)::numeric, (%L)::numeric, (%L)::numeric,
                COALESCE(NULLIF(%L,''), 'general_16'),
                COALESCE(NULLIF(%L,''), 'B'),
                CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END,
                CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END
            )
        $sql$,
            v_schema, v_id,
            v_item->>'producto_id',
            v_item->>'cantidad', v_item->>'costo_unitario', v_item->>'costo_total',
            v_item->>'iva_alicuota',
            v_item->>'moneda',
            v_item->>'costo_moneda', v_item->>'costo_moneda', v_item->>'costo_moneda',
            v_item->>'tasa_dolar',   v_item->>'tasa_dolar',   v_item->>'tasa_dolar'
        );
    END LOOP;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. tenant_inventario_factura_get — returns tasa_dolar + tasa_decimales
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
            'estado',           f.estado,
            'subtotal',         f.subtotal,
            'iva_porcentaje',   f.iva_porcentaje,
            'iva_monto',        f.iva_monto,
            'total',            f.total,
            'notas',            f.notas,
            'tasa_dolar',       f.tasa_dolar,
            'tasa_decimales',   f.tasa_decimales,
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
                'tasa_dolar',      i.tasa_dolar
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
-- 4. tenant_inventario_facturas_get — list returns tasa_dolar + tasa_decimales
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
                'estado',           f.estado,
                'subtotal',         f.subtotal,
                'iva_porcentaje',   f.iva_porcentaje,
                'iva_monto',        f.iva_monto,
                'total',            f.total,
                'notas',            f.notas,
                'tasa_dolar',       f.tasa_dolar,
                'tasa_decimales',   f.tasa_decimales,
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
-- 5. tenant_inventario_factura_desconfirmar — revert movements, re-open invoice
-- ---------------------------------------------------------------------------
-- Mirror of the "revert movements" branch inside tenant_inventario_factura_delete
-- (migration 026) but keeps the invoice + items in place. After desconfirmar the
-- invoice is `borrador` and the save RPC will accept updates again.
CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_desconfirmar(
    p_user_id    uuid,
    p_factura_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema         text;
    v_factura        record;
    v_mov            record;
    v_existencia_act numeric(14,4);
    v_costo_prom     numeric(14,4);
    v_new_existencia numeric(14,4);
    v_new_costo_prom numeric(14,4);
    v_result         jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'SELECT * FROM %I.inventario_facturas_compra WHERE id = %L',
        v_schema, p_factura_id
    ) INTO v_factura;

    IF v_factura IS NULL THEN
        RAISE EXCEPTION 'Factura no encontrada';
    END IF;

    IF v_factura.estado <> 'confirmada' THEN
        -- Idempotent: already in borrador, nothing to revert.
        EXECUTE format(
            'SELECT row_to_json(f)::jsonb FROM %I.inventario_facturas_compra f WHERE f.id = %L',
            v_schema, p_factura_id
        ) INTO v_result;
        RETURN v_result;
    END IF;

    -- Revert stock + costo_promedio for each movement tied to this invoice
    FOR v_mov IN
        EXECUTE format(
            'SELECT * FROM %I.inventario_movimientos WHERE factura_compra_id = %L',
            v_schema, p_factura_id
        )
    LOOP
        EXECUTE format(
            'SELECT existencia_actual, costo_promedio FROM %I.inventario_productos WHERE id = %L',
            v_schema, v_mov.producto_id
        ) INTO v_existencia_act, v_costo_prom;

        v_new_existencia := v_existencia_act - v_mov.cantidad;

        IF v_new_existencia > 0 THEN
            v_new_costo_prom := GREATEST(0,
                (v_existencia_act * v_costo_prom - v_mov.cantidad * v_mov.costo_unitario)
                / v_new_existencia
            );
        ELSE
            v_new_costo_prom := 0;
        END IF;

        EXECUTE format(
            'UPDATE %I.inventario_productos SET existencia_actual=%L, costo_promedio=%L, updated_at=now() WHERE id=%L',
            v_schema, v_new_existencia, v_new_costo_prom, v_mov.producto_id
        );
    END LOOP;

    EXECUTE format(
        'DELETE FROM %I.inventario_movimientos WHERE factura_compra_id = %L',
        v_schema, p_factura_id
    );

    EXECUTE format(
        'UPDATE %I.inventario_facturas_compra SET estado=''borrador'', confirmada_at=NULL, updated_at=now() WHERE id=%L',
        v_schema, p_factura_id
    );

    EXECUTE format(
        'SELECT row_to_json(f)::jsonb FROM %I.inventario_facturas_compra f WHERE f.id = %L',
        v_schema, p_factura_id
    ) INTO v_result;

    RETURN v_result;
END;
$$;
