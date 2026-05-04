-- =============================================================================
-- 091_inventory_purchase_islr_retention.sql
--
-- Retención ISLR sobre facturas de compra de servicios.
-- Base legal: Decreto 1808 (G.O. 36.203, 12/05/1997) + Anexo 6.1 SENIAT
-- (manual técnico 60.40.40.039). Aplica a SPE cuando pagan honorarios,
-- fletes, alquileres, comisiones, contratistas, publicidad, etc.
--
-- Esta migración:
--   1. Añade columnas ISLR a inventario_facturas_compra (per-tenant).
--   2. Extiende factura_save para aceptar/recomputar el monto ISLR.
--   3. Extiende factura_confirmar para asignar correlativo del comprobante
--      ISLR cuando hay retención.
--   4. Actualiza factura_get y facturas_get para devolver los nuevos campos.
--
-- El número de comprobante ISLR usa formato AAAASSSSSSSS (12 chars: año
-- fiscal + correlativo de 8 dígitos por empresa). Reinicia anualmente —
-- consistente con la práctica venezolana del Art. 24 Decreto 1808.
--
-- Cálculo del monto: el server lee el concepto, % y sustraendo enviados
-- por el frontend (que los obtiene del catálogo TS) y RECOMPUTA monto
-- como `MAX(0, base × pct/100 − sustraendo)`. Mínimos PJD se aplican en
-- frontend por la diversidad de casos (usuario puede forzar retención).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columnas ISLR + correlativo del comprobante (per-tenant)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r        record;
    v_schema text;
    v_has_estado boolean;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;

        -- Tenants legacy con esquema distinto (status/iva_amount) se omiten.
        EXECUTE format($q$
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = %L
                  AND table_name = 'inventario_facturas_compra'
                  AND column_name = 'estado'
            )
        $q$, v_schema) INTO v_has_estado;

        IF NOT v_has_estado THEN
            CONTINUE;
        END IF;

        EXECUTE format($s$
            ALTER TABLE %I.inventario_facturas_compra
                ADD COLUMN IF NOT EXISTS islr_concepto              text,
                ADD COLUMN IF NOT EXISTS islr_porcentaje            numeric(7,4)  DEFAULT 0,
                ADD COLUMN IF NOT EXISTS islr_base_retencion        numeric(14,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS islr_sustraendo            numeric(14,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS islr_monto                 numeric(14,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS islr_unidad_tributaria     numeric(14,2),
                ADD COLUMN IF NOT EXISTS comprobante_islr_numero    text
        $s$, v_schema);

        EXECUTE format($s$
            CREATE UNIQUE INDEX IF NOT EXISTS
                ux_facturas_compra_comprobante_islr
            ON %I.inventario_facturas_compra (empresa_id, comprobante_islr_numero)
            WHERE comprobante_islr_numero IS NOT NULL
        $s$, v_schema);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. tenant_inventario_factura_save — aceptar y persistir campos ISLR
-- ---------------------------------------------------------------------------
-- Reemplazo: superset del save existente (mig 083). El total se recalcula
-- como `subtotal + iva − retenciónIVA − retenciónISLR` para reflejar el
-- monto efectivamente pagado al proveedor.
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
    v_islr_concepto      text;
    v_islr_pct           numeric(7,4);
    v_islr_base          numeric(14,2);
    v_islr_sustraendo    numeric(14,2);
    v_islr_monto         numeric(14,2);
    v_islr_ut            numeric(14,2);
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

    -- Subtotal = Σ base_iva por línea
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

    -- Retención IVA — pct from frontend, monto recomputed authoritatively.
    v_retencion_iva_pct  := COALESCE(NULLIF(p_factura->>'retencion_iva_pct','')::numeric, 0);
    IF v_retencion_iva_pct < 0 OR v_retencion_iva_pct > 100 THEN
        RAISE EXCEPTION 'retencion_iva_pct fuera de rango (0–100): %', v_retencion_iva_pct;
    END IF;
    v_retencion_iva_monto := ROUND(v_iva_monto * v_retencion_iva_pct / 100, 2);

    -- Retención ISLR — el frontend envía concepto, %, base, sustraendo y UT.
    -- El server recomputa monto = MAX(0, base × pct/100 − sustraendo) para
    -- evitar drift entre la UI y el cálculo persistido.
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

    -- Total = lo efectivamente pagado al proveedor (post-retenciones).
    v_total := v_subtotal + v_iva_monto - v_retencion_iva_monto - v_islr_monto;

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
        v_islr_concepto, v_islr_pct, v_islr_base, v_islr_sustraendo, v_islr_monto, v_islr_ut
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
-- 3. tenant_inventario_factura_confirmar — asigna comprobante ISLR
-- ---------------------------------------------------------------------------
-- Superset de la versión 090: además del comprobante IVA, asigna el
-- correlativo del comprobante ISLR cuando islr_monto > 0. Formato
-- AAAASSSSSSSS (12 chars) — año fiscal + correlativo 8 dígitos.
-- Reinicia cada año por empresa.
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
    v_result           jsonb;
    v_periodo_yyyymm   text;
    v_year_yyyy        text;
    v_max_corr_iva     int;
    v_max_corr_islr    int;
    v_comprobante_iva  text;
    v_comprobante_islr text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'SELECT * FROM %I.inventario_facturas_compra WHERE id = %L',
        v_schema, p_factura_id
    ) INTO v_factura;

    IF v_factura IS NULL THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
    IF v_factura.estado = 'confirmada' THEN RAISE EXCEPTION 'La factura ya está confirmada'; END IF;

    -- ── Comprobante IVA (mig 090) ─────────────────────────────────────────
    v_comprobante_iva := v_factura.comprobante_retencion_iva_numero;
    IF COALESCE(v_factura.retencion_iva_pct, 0) > 0
       AND COALESCE(v_factura.retencion_iva_monto, 0) > 0
       AND v_comprobante_iva IS NULL THEN

        v_periodo_yyyymm := REPLACE(v_factura.periodo, '-', '');
        IF length(v_periodo_yyyymm) <> 6 THEN
            RAISE EXCEPTION 'Período inválido para comprobante IVA: %', v_factura.periodo;
        END IF;

        EXECUTE format($q$
            SELECT COALESCE(MAX(SUBSTRING(comprobante_retencion_iva_numero, 7, 8)::int), 0)
              FROM %I.inventario_facturas_compra
             WHERE empresa_id = %L
               AND comprobante_retencion_iva_numero LIKE %L
        $q$,
            v_schema,
            v_factura.empresa_id,
            v_periodo_yyyymm || '%'
        ) INTO v_max_corr_iva;

        v_comprobante_iva := v_periodo_yyyymm || LPAD((v_max_corr_iva + 1)::text, 8, '0');
    END IF;

    -- ── Comprobante ISLR (mig 091) ────────────────────────────────────────
    v_comprobante_islr := v_factura.comprobante_islr_numero;
    IF COALESCE(v_factura.islr_monto, 0) > 0
       AND v_comprobante_islr IS NULL THEN

        v_year_yyyy := SUBSTRING(v_factura.periodo, 1, 4);
        IF length(v_year_yyyy) <> 4 THEN
            RAISE EXCEPTION 'Año inválido para comprobante ISLR: %', v_factura.periodo;
        END IF;

        EXECUTE format($q$
            SELECT COALESCE(MAX(SUBSTRING(comprobante_islr_numero, 5, 8)::int), 0)
              FROM %I.inventario_facturas_compra
             WHERE empresa_id = %L
               AND comprobante_islr_numero LIKE %L
        $q$,
            v_schema,
            v_factura.empresa_id,
            v_year_yyyy || '%'
        ) INTO v_max_corr_islr;

        v_comprobante_islr := v_year_yyyy || LPAD((v_max_corr_islr + 1)::text, 8, '0');
    END IF;

    -- ── Confirmar (estado + ambos comprobantes) ───────────────────────────
    EXECUTE format(
        'UPDATE %I.inventario_facturas_compra
            SET estado                            = ''confirmada'',
                confirmada_at                     = now(),
                comprobante_retencion_iva_numero  = COALESCE(comprobante_retencion_iva_numero, %L),
                comprobante_islr_numero           = COALESCE(comprobante_islr_numero, %L),
                updated_at                        = now()
          WHERE id = %L',
        v_schema, v_comprobante_iva, v_comprobante_islr, p_factura_id
    );

    -- ── Generar movimientos de inventario ────────────────────────────────
    FOR v_item IN
        EXECUTE format(
            'SELECT * FROM %I.inventario_facturas_compra_items WHERE factura_id = %L',
            v_schema, p_factura_id
        )
    LOOP
        EXECUTE format(
            'SELECT existencia_actual, costo_promedio FROM %I.inventario_productos WHERE id = %L',
            v_schema, v_item.producto_id
        ) INTO v_existencia_act, v_costo_prom;

        v_new_existencia := v_existencia_act + v_item.cantidad;

        IF v_existencia_act > 0 THEN
            v_new_costo_prom := (v_existencia_act * v_costo_prom + v_item.cantidad * v_item.costo_unitario)
                                / v_new_existencia;
        ELSE
            v_new_costo_prom := v_item.costo_unitario;
        END IF;

        EXECUTE format(
            'UPDATE %I.inventario_productos SET existencia_actual=%L, costo_promedio=%L, updated_at=now() WHERE id=%L',
            v_schema, v_new_existencia, v_new_costo_prom, v_item.producto_id
        );

        EXECUTE format($sql$
            INSERT INTO %I.inventario_movimientos
                (id, empresa_id, producto_id, tipo, fecha, periodo,
                 cantidad, costo_unitario, costo_total, saldo_cantidad,
                 moneda, costo_moneda, tasa_dolar, referencia, notas, factura_compra_id)
            VALUES (
                gen_random_uuid()::text,
                %L, %L, 'entrada', %L, %L,
                %L, %L, %L, %L,
                %L, %L, %L, %L, '', %L
            )
        $sql$,
            v_schema,
            v_factura.empresa_id, v_item.producto_id,
            v_factura.fecha, v_factura.periodo,
            v_item.cantidad, v_item.costo_unitario,
            v_item.cantidad * v_item.costo_unitario, v_new_existencia,
            v_item.moneda, v_item.costo_moneda, v_item.tasa_dolar,
            COALESCE(v_factura.numero_factura, ''),
            p_factura_id
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
-- 4. tenant_inventario_factura_get — devolver campos ISLR
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
            'id',                                f.id,
            'empresa_id',                        f.empresa_id,
            'proveedor_id',                      f.proveedor_id,
            'proveedor_nombre',                  pv.nombre,
            'numero_factura',                    f.numero_factura,
            'numero_control',                    f.numero_control,
            'fecha',                             f.fecha,
            'periodo',                           f.periodo,
            'periodo_manual',                    f.periodo_manual,
            'estado',                            f.estado,
            'subtotal',                          f.subtotal,
            'iva_porcentaje',                    f.iva_porcentaje,
            'iva_monto',                         f.iva_monto,
            'total',                             f.total,
            'notas',                             f.notas,
            'tasa_dolar',                        f.tasa_dolar,
            'tasa_decimales',                    f.tasa_decimales,
            'descuento_tipo',                    f.descuento_tipo,
            'descuento_valor',                   f.descuento_valor,
            'descuento_monto',                   f.descuento_monto,
            'recargo_tipo',                      f.recargo_tipo,
            'recargo_valor',                     f.recargo_valor,
            'recargo_monto',                     f.recargo_monto,
            'retencion_iva_pct',                 f.retencion_iva_pct,
            'retencion_iva_monto',               f.retencion_iva_monto,
            'comprobante_retencion_iva_numero',  f.comprobante_retencion_iva_numero,
            'islr_concepto',                     f.islr_concepto,
            'islr_porcentaje',                   f.islr_porcentaje,
            'islr_base_retencion',               f.islr_base_retencion,
            'islr_sustraendo',                   f.islr_sustraendo,
            'islr_monto',                        f.islr_monto,
            'islr_unidad_tributaria',            f.islr_unidad_tributaria,
            'comprobante_islr_numero',           f.comprobante_islr_numero,
            'confirmada_at',                     f.confirmada_at,
            'created_at',                        f.created_at,
            'updated_at',                        f.updated_at
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
-- 5. tenant_inventario_facturas_get — listado con campos ISLR
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
                'id',                                f.id,
                'empresa_id',                        f.empresa_id,
                'proveedor_id',                      f.proveedor_id,
                'proveedor_nombre',                  pv.nombre,
                'numero_factura',                    f.numero_factura,
                'numero_control',                    f.numero_control,
                'fecha',                             f.fecha,
                'periodo',                           f.periodo,
                'periodo_manual',                    f.periodo_manual,
                'estado',                            f.estado,
                'subtotal',                          f.subtotal,
                'iva_porcentaje',                    f.iva_porcentaje,
                'iva_monto',                         f.iva_monto,
                'total',                             f.total,
                'notas',                             f.notas,
                'tasa_dolar',                        f.tasa_dolar,
                'tasa_decimales',                    f.tasa_decimales,
                'descuento_tipo',                    f.descuento_tipo,
                'descuento_valor',                   f.descuento_valor,
                'descuento_monto',                   f.descuento_monto,
                'recargo_tipo',                      f.recargo_tipo,
                'recargo_valor',                     f.recargo_valor,
                'recargo_monto',                     f.recargo_monto,
                'retencion_iva_pct',                 f.retencion_iva_pct,
                'retencion_iva_monto',               f.retencion_iva_monto,
                'comprobante_retencion_iva_numero',  f.comprobante_retencion_iva_numero,
                'islr_concepto',                     f.islr_concepto,
                'islr_porcentaje',                   f.islr_porcentaje,
                'islr_base_retencion',               f.islr_base_retencion,
                'islr_sustraendo',                   f.islr_sustraendo,
                'islr_monto',                        f.islr_monto,
                'islr_unidad_tributaria',            f.islr_unidad_tributaria,
                'comprobante_islr_numero',           f.comprobante_islr_numero,
                'confirmada_at',                     f.confirmada_at,
                'created_at',                        f.created_at,
                'updated_at',                        f.updated_at
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
