-- =============================================================================
-- 093_inventory_purchase_igtf.sql
--
-- IGTF (Impuesto a las Grandes Transacciones Financieras) sobre facturas de
-- compra pagadas en divisa o cripto. Reforma vigente: G.O. Extraordinaria
-- N° 6.687 del 25/02/2022 + PA SNAT/2022/000013 (G.O. 42.339).
--
-- Alcance en compras: el SPE comprador NO declara IGTF — quien lo entera al
-- SENIAT es el banco intermediario o el proveedor SPE designado como agente
-- de percepción. Aquí lo registramos como gasto (no deducible del ISLR per
-- Art. 18) para trazabilidad contable y conciliación con la factura del
-- proveedor.
--
-- Campos agregados a inventario_facturas_compra:
--   * igtf_aplica           boolean   — flag de la operación
--   * igtf_porcentaje       numeric   — alícuota (3% en divisas/cripto)
--   * igtf_base_divisa      numeric   — monto pagado en USD/cripto
--   * igtf_base_bs          numeric   — base_divisa × tasa_dolar
--   * igtf_monto            numeric   — base_bs × pct/100 (server-resolved)
--
-- El total de la factura recoge IGTF: total = subtotal + iva − retenciones
-- + IGTF (porque el proveedor lo cargó como concepto adicional al monto
-- facturado y forma parte del desembolso).
-- =============================================================================

-- 1. Columnas IGTF en cada tenant activo
DO $$
DECLARE
    r        record;
    v_schema text;
    v_has_estado boolean;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;
        EXECUTE format($q$
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = %L
                  AND table_name = 'inventario_facturas_compra'
                  AND column_name = 'estado'
            )
        $q$, v_schema) INTO v_has_estado;
        IF NOT v_has_estado THEN CONTINUE; END IF;

        EXECUTE format($s$
            ALTER TABLE %I.inventario_facturas_compra
                ADD COLUMN IF NOT EXISTS igtf_aplica       boolean       DEFAULT false,
                ADD COLUMN IF NOT EXISTS igtf_porcentaje   numeric(5,2)  DEFAULT 0,
                ADD COLUMN IF NOT EXISTS igtf_base_divisa  numeric(14,4) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS igtf_base_bs      numeric(14,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS igtf_monto        numeric(14,2) DEFAULT 0
        $s$, v_schema);
    END LOOP;
END;
$$;

-- 2. tenant_inventario_factura_save — aceptar y persistir IGTF (recompute monto)
CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_save(
    p_user_id uuid, p_factura jsonb, p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    v_islr_concepto      text;
    v_islr_pct           numeric(7,4);
    v_islr_base          numeric(14,2);
    v_islr_sustraendo    numeric(14,2);
    v_islr_monto         numeric(14,2);
    v_islr_ut            numeric(14,2);
    v_igtf_aplica        boolean;
    v_igtf_pct           numeric(5,2);
    v_igtf_base_divisa   numeric(14,4);
    v_igtf_base_bs       numeric(14,2);
    v_igtf_monto         numeric(14,2);
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

    SELECT COALESCE(SUM(COALESCE((item->>'base_iva')::numeric, (item->>'costo_total')::numeric, 0)), 0)
    INTO v_subtotal
    FROM jsonb_array_elements(p_items) AS item;

    SELECT ROUND(COALESCE(SUM(
        CASE COALESCE(item->>'iva_alicuota', 'general_16')
            WHEN 'reducida_8' THEN COALESCE((item->>'base_iva')::numeric, (item->>'costo_total')::numeric, 0) * 8  / 100
            WHEN 'general_16' THEN COALESCE((item->>'base_iva')::numeric, (item->>'costo_total')::numeric, 0) * 16 / 100
            ELSE 0
        END
    ), 0), 2)
    INTO v_iva_monto
    FROM jsonb_array_elements(p_items) AS item;

    v_retencion_iva_pct  := COALESCE(NULLIF(p_factura->>'retencion_iva_pct','')::numeric, 0);
    IF v_retencion_iva_pct < 0 OR v_retencion_iva_pct > 100 THEN
        RAISE EXCEPTION 'retencion_iva_pct fuera de rango (0–100): %', v_retencion_iva_pct;
    END IF;
    v_retencion_iva_monto := ROUND(v_iva_monto * v_retencion_iva_pct / 100, 2);

    -- ISLR
    v_islr_concepto   := NULLIF(p_factura->>'islr_concepto','');
    v_islr_pct        := COALESCE(NULLIF(p_factura->>'islr_porcentaje','')::numeric, 0);
    v_islr_base       := COALESCE(NULLIF(p_factura->>'islr_base_retencion','')::numeric, 0);
    v_islr_sustraendo := COALESCE(NULLIF(p_factura->>'islr_sustraendo','')::numeric, 0);
    v_islr_ut         := NULLIF(p_factura->>'islr_unidad_tributaria','')::numeric;
    IF v_islr_concepto IS NOT NULL AND v_islr_pct > 0 AND v_islr_base > 0 THEN
        v_islr_monto := GREATEST(
            0,
            ROUND(v_islr_base * v_islr_pct / 100, 2) - COALESCE(v_islr_sustraendo, 0)
        );
    ELSE
        v_islr_monto := 0;
    END IF;

    -- IGTF — el frontend envía aplica, pct, base_divisa, base_bs. Server
    -- recomputa monto = ROUND(base_bs × pct/100, 2). Si aplica=false,
    -- todos los campos se setean a 0.
    v_igtf_aplica      := COALESCE((NULLIF(p_factura->>'igtf_aplica',''))::boolean, false);
    v_igtf_pct         := COALESCE(NULLIF(p_factura->>'igtf_porcentaje','')::numeric, 0);
    v_igtf_base_divisa := COALESCE(NULLIF(p_factura->>'igtf_base_divisa','')::numeric, 0);
    v_igtf_base_bs     := COALESCE(NULLIF(p_factura->>'igtf_base_bs','')::numeric, 0);
    IF v_igtf_aplica AND v_igtf_pct > 0 AND v_igtf_base_bs > 0 THEN
        v_igtf_monto := ROUND(v_igtf_base_bs * v_igtf_pct / 100, 2);
    ELSE
        v_igtf_aplica      := false;
        v_igtf_pct         := 0;
        v_igtf_base_divisa := 0;
        v_igtf_base_bs     := 0;
        v_igtf_monto       := 0;
    END IF;

    -- Total: subtotal + iva − ret_iva − ret_islr + igtf (gasto añadido al
    -- desembolso por el proveedor / banco que cobró el impuesto).
    v_total := v_subtotal + v_iva_monto - v_retencion_iva_monto - v_islr_monto + v_igtf_monto;

    EXECUTE format($sql$
        INSERT INTO %I.inventario_facturas_compra
            (id, empresa_id, proveedor_id, numero_factura, numero_control,
             fecha, periodo, periodo_manual, estado,
             subtotal, iva_porcentaje, iva_monto, total, notas,
             tasa_dolar, tasa_decimales,
             descuento_tipo, descuento_valor, descuento_monto,
             recargo_tipo, recargo_valor, recargo_monto,
             retencion_iva_pct, retencion_iva_monto,
             islr_concepto, islr_porcentaje, islr_base_retencion,
             islr_sustraendo, islr_monto, islr_unidad_tributaria,
             igtf_aplica, igtf_porcentaje, igtf_base_divisa, igtf_base_bs, igtf_monto,
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
            %L, %L, %L, %L, %L, %L,
            %L, %L, %L, %L, %L,
            now()
        )
        ON CONFLICT (id) DO UPDATE SET
            proveedor_id           = EXCLUDED.proveedor_id,
            numero_factura         = EXCLUDED.numero_factura,
            numero_control         = EXCLUDED.numero_control,
            fecha                  = EXCLUDED.fecha,
            periodo                = EXCLUDED.periodo,
            periodo_manual         = EXCLUDED.periodo_manual,
            subtotal               = EXCLUDED.subtotal,
            iva_porcentaje         = 0,
            iva_monto              = EXCLUDED.iva_monto,
            total                  = EXCLUDED.total,
            notas                  = EXCLUDED.notas,
            tasa_dolar             = EXCLUDED.tasa_dolar,
            tasa_decimales         = EXCLUDED.tasa_decimales,
            descuento_tipo         = EXCLUDED.descuento_tipo,
            descuento_valor        = EXCLUDED.descuento_valor,
            descuento_monto        = EXCLUDED.descuento_monto,
            recargo_tipo           = EXCLUDED.recargo_tipo,
            recargo_valor          = EXCLUDED.recargo_valor,
            recargo_monto          = EXCLUDED.recargo_monto,
            retencion_iva_pct      = EXCLUDED.retencion_iva_pct,
            retencion_iva_monto    = EXCLUDED.retencion_iva_monto,
            islr_concepto          = EXCLUDED.islr_concepto,
            islr_porcentaje        = EXCLUDED.islr_porcentaje,
            islr_base_retencion    = EXCLUDED.islr_base_retencion,
            islr_sustraendo        = EXCLUDED.islr_sustraendo,
            islr_monto             = EXCLUDED.islr_monto,
            islr_unidad_tributaria = EXCLUDED.islr_unidad_tributaria,
            igtf_aplica            = EXCLUDED.igtf_aplica,
            igtf_porcentaje        = EXCLUDED.igtf_porcentaje,
            igtf_base_divisa       = EXCLUDED.igtf_base_divisa,
            igtf_base_bs           = EXCLUDED.igtf_base_bs,
            igtf_monto             = EXCLUDED.igtf_monto,
            updated_at             = now()
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
        v_retencion_iva_pct, v_retencion_iva_monto,
        v_islr_concepto, v_islr_pct, v_islr_base, v_islr_sustraendo, v_islr_monto, v_islr_ut,
        v_igtf_aplica, v_igtf_pct, v_igtf_base_divisa, v_igtf_base_bs, v_igtf_monto
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

-- 3. tenant_inventario_factura_get — devolver campos IGTF
CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_get(
    p_user_id uuid, p_factura_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema  text;
    v_factura jsonb;
    v_items   jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        $q$SELECT jsonb_build_object(
            'id', f.id, 'empresa_id', f.empresa_id, 'proveedor_id', f.proveedor_id,
            'proveedor_nombre', pv.nombre,
            'numero_factura', f.numero_factura, 'numero_control', f.numero_control,
            'fecha', f.fecha, 'periodo', f.periodo, 'periodo_manual', f.periodo_manual,
            'estado', f.estado,
            'subtotal', f.subtotal, 'iva_porcentaje', f.iva_porcentaje, 'iva_monto', f.iva_monto,
            'total', f.total, 'notas', f.notas,
            'tasa_dolar', f.tasa_dolar, 'tasa_decimales', f.tasa_decimales,
            'descuento_tipo', f.descuento_tipo, 'descuento_valor', f.descuento_valor, 'descuento_monto', f.descuento_monto,
            'recargo_tipo', f.recargo_tipo, 'recargo_valor', f.recargo_valor, 'recargo_monto', f.recargo_monto,
            'retencion_iva_pct', f.retencion_iva_pct, 'retencion_iva_monto', f.retencion_iva_monto,
            'comprobante_retencion_iva_numero', f.comprobante_retencion_iva_numero,
            'islr_concepto', f.islr_concepto, 'islr_porcentaje', f.islr_porcentaje,
            'islr_base_retencion', f.islr_base_retencion, 'islr_sustraendo', f.islr_sustraendo,
            'islr_monto', f.islr_monto, 'islr_unidad_tributaria', f.islr_unidad_tributaria,
            'comprobante_islr_numero', f.comprobante_islr_numero,
            'igtf_aplica', f.igtf_aplica, 'igtf_porcentaje', f.igtf_porcentaje,
            'igtf_base_divisa', f.igtf_base_divisa, 'igtf_base_bs', f.igtf_base_bs, 'igtf_monto', f.igtf_monto,
            'confirmada_at', f.confirmada_at, 'created_at', f.created_at, 'updated_at', f.updated_at
        )
        FROM %I.inventario_facturas_compra f
        JOIN %I.inventario_proveedores pv ON pv.id = f.proveedor_id
        WHERE f.id = %L$q$,
        v_schema, v_schema, p_factura_id
    ) INTO v_factura;

    EXECUTE format(
        $q$SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', i.id, 'factura_id', i.factura_id, 'producto_id', i.producto_id,
                'producto_nombre', p.nombre,
                'cantidad', i.cantidad, 'costo_unitario', i.costo_unitario, 'costo_total', i.costo_total,
                'iva_alicuota', i.iva_alicuota, 'moneda', i.moneda,
                'costo_moneda', i.costo_moneda, 'tasa_dolar', i.tasa_dolar,
                'descuento_tipo', i.descuento_tipo, 'descuento_valor', i.descuento_valor, 'descuento_monto', i.descuento_monto,
                'recargo_tipo', i.recargo_tipo, 'recargo_valor', i.recargo_valor, 'recargo_monto', i.recargo_monto,
                'base_iva', i.base_iva, 'iva_incluido', i.iva_incluido
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

-- 4. tenant_inventario_facturas_get — listado con campos IGTF
CREATE OR REPLACE FUNCTION public.tenant_inventario_facturas_get(
    p_user_id uuid, p_empresa_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        $q$SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', f.id, 'empresa_id', f.empresa_id, 'proveedor_id', f.proveedor_id,
                'proveedor_nombre', pv.nombre,
                'numero_factura', f.numero_factura, 'numero_control', f.numero_control,
                'fecha', f.fecha, 'periodo', f.periodo, 'periodo_manual', f.periodo_manual,
                'estado', f.estado,
                'subtotal', f.subtotal, 'iva_porcentaje', f.iva_porcentaje, 'iva_monto', f.iva_monto,
                'total', f.total, 'notas', f.notas,
                'tasa_dolar', f.tasa_dolar, 'tasa_decimales', f.tasa_decimales,
                'descuento_tipo', f.descuento_tipo, 'descuento_valor', f.descuento_valor, 'descuento_monto', f.descuento_monto,
                'recargo_tipo', f.recargo_tipo, 'recargo_valor', f.recargo_valor, 'recargo_monto', f.recargo_monto,
                'retencion_iva_pct', f.retencion_iva_pct, 'retencion_iva_monto', f.retencion_iva_monto,
                'comprobante_retencion_iva_numero', f.comprobante_retencion_iva_numero,
                'islr_concepto', f.islr_concepto, 'islr_porcentaje', f.islr_porcentaje,
                'islr_base_retencion', f.islr_base_retencion, 'islr_sustraendo', f.islr_sustraendo,
                'islr_monto', f.islr_monto, 'islr_unidad_tributaria', f.islr_unidad_tributaria,
                'comprobante_islr_numero', f.comprobante_islr_numero,
                'igtf_aplica', f.igtf_aplica, 'igtf_porcentaje', f.igtf_porcentaje,
                'igtf_base_divisa', f.igtf_base_divisa, 'igtf_base_bs', f.igtf_base_bs, 'igtf_monto', f.igtf_monto,
                'confirmada_at', f.confirmada_at, 'created_at', f.created_at, 'updated_at', f.updated_at
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
