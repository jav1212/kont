-- =============================================================================
-- 090_inventory_purchase_iva_retention_correlativo.sql
--
-- Asignación del N° de Comprobante de Retención IVA al confirmar una factura
-- de compra con retención (Providencia SNAT/2025/000054, vigente 01/08/2025).
--
-- Formato: AAAAMMSSSSSSSS (14 chars) — año + mes del período + correlativo
-- secuencial de 8 dígitos que reinicia cada período. Ejemplo: 20210400000082
-- = abril 2021, comprobante #82. El correlativo se asigna por orden de
-- confirmación dentro de la empresa+período.
--
-- Una vez asignado, el número NO se borra al desconfirmar (el contador ya
-- imprimió el comprobante para el proveedor; recrearlo cambiando el N° rompe
-- la trazabilidad). Si la factura se elimina queda un hueco — práctica
-- estándar venezolana, sólo requiere justificación si SENIAT pregunta.
--
-- También expone el RPC `tenant_inventario_retenciones_iva_periodo` que
-- retorna las filas listas para construir el TXT de SENIAT, una fila por
-- (factura, alícuota IVA aplicable) ya que el TXT lo requiere desglosado.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Añadir columna comprobante_retencion_iva_numero (per-tenant)
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
                ADD COLUMN IF NOT EXISTS comprobante_retencion_iva_numero text
        $s$, v_schema);

        -- Índice único por (empresa, número de comprobante) para evitar
        -- duplicados accidentales en caso de carrera entre confirmaciones.
        EXECUTE format($s$
            CREATE UNIQUE INDEX IF NOT EXISTS
                ux_facturas_compra_comprobante_retencion
            ON %I.inventario_facturas_compra (empresa_id, comprobante_retencion_iva_numero)
            WHERE comprobante_retencion_iva_numero IS NOT NULL
        $s$, v_schema);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. tenant_inventario_factura_confirmar — asigna correlativo al confirmar
-- ---------------------------------------------------------------------------
-- Reemplazo total: idéntico a 063 + asignación de comprobante_retencion_iva_numero
-- cuando retencion_iva_pct > 0 y el campo aún no fue asignado (idempotente
-- ante re-confirmación post-desconfirmar).
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
    v_periodo_yyyymm   text;     -- '202604'
    v_max_corr         int;
    v_comprobante      text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'SELECT * FROM %I.inventario_facturas_compra WHERE id = %L',
        v_schema, p_factura_id
    ) INTO v_factura;

    IF v_factura IS NULL THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
    IF v_factura.estado = 'confirmada' THEN RAISE EXCEPTION 'La factura ya está confirmada'; END IF;

    -- ── Asignación del N° de Comprobante de Retención IVA ─────────────────
    -- Sólo si hay retención efectiva (>0) y aún no se asignó un número.
    v_comprobante := v_factura.comprobante_retencion_iva_numero;
    IF COALESCE(v_factura.retencion_iva_pct, 0) > 0
       AND COALESCE(v_factura.retencion_iva_monto, 0) > 0
       AND v_comprobante IS NULL THEN

        -- AAAAMM derivado del período de la factura ('YYYY-MM' → 'YYYYMM').
        v_periodo_yyyymm := REPLACE(v_factura.periodo, '-', '');
        IF length(v_periodo_yyyymm) <> 6 THEN
            RAISE EXCEPTION 'Período inválido para asignar comprobante: %', v_factura.periodo;
        END IF;

        -- Buscar el correlativo máximo emitido en el mismo período/empresa.
        -- Sólo se cuentan números que comienzan con el AAAAMM en cuestión —
        -- ignora cualquier otro número que pudiera haber por error.
        EXECUTE format($q$
            SELECT COALESCE(MAX(SUBSTRING(comprobante_retencion_iva_numero, 7, 8)::int), 0)
              FROM %I.inventario_facturas_compra
             WHERE empresa_id = %L
               AND comprobante_retencion_iva_numero LIKE %L
        $q$,
            v_schema,
            v_factura.empresa_id,
            v_periodo_yyyymm || '%'
        ) INTO v_max_corr;

        v_comprobante := v_periodo_yyyymm || LPAD((v_max_corr + 1)::text, 8, '0');
    END IF;

    -- ── Confirmar factura (estado + comprobante si aplica) ────────────────
    EXECUTE format(
        'UPDATE %I.inventario_facturas_compra
            SET estado                            = ''confirmada'',
                confirmada_at                     = now(),
                comprobante_retencion_iva_numero  = COALESCE(comprobante_retencion_iva_numero, %L),
                updated_at                        = now()
          WHERE id = %L',
        v_schema, v_comprobante, p_factura_id
    );

    -- ── Generar movimientos de inventario por línea ───────────────────────
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
-- 3. tenant_inventario_factura_get / _facturas_get — devolver comprobante
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

-- ---------------------------------------------------------------------------
-- 4. tenant_inventario_retenciones_iva_periodo
-- ---------------------------------------------------------------------------
-- Devuelve un envelope { agente_rif, rows } donde rows es una lista de
-- entradas (factura confirmada con retención × alícuota IVA con base > 0)
-- para construir el TXT SENIAT. El TXT espera 1 línea por alícuota aplicada
-- en una factura — facturas multi-tasa generan múltiples líneas.
--
-- agente_rif viene siempre, incluso cuando rows = []. Esto permite emitir el
-- "TXT en cero" (período sin operaciones, declaración igualmente obligatoria).
--
-- Cada fila trae además:
--   * AAAAMM derivado del período
--   * monto exento de la factura (sólo informativo, mismo en cada línea)
--   * monto retenido prorrateado a la alícuota
--
-- Ordenación: por número de comprobante asc (= orden cronológico de
-- confirmación), para que la fila índice del TXT sea coherente.
CREATE OR REPLACE FUNCTION public.tenant_inventario_retenciones_iva_periodo(
    p_user_id    uuid,
    p_empresa_id text,
    p_periodo    text   -- formato 'YYYY-MM'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_rif    text;
    v_yyyymm text;
    v_rows   jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    v_yyyymm := REPLACE(p_periodo, '-', '');

    IF length(v_yyyymm) <> 6 THEN
        RAISE EXCEPTION 'Período inválido (esperado YYYY-MM): %', p_periodo;
    END IF;

    -- RIF de la empresa retenedora.
    EXECUTE format(
        'SELECT rif FROM %I.companies WHERE id = %L',
        v_schema, p_empresa_id
    ) INTO v_rif;

    IF v_rif IS NULL OR v_rif = '' THEN
        RAISE EXCEPTION 'La empresa no tiene RIF configurado — requerido por SENIAT';
    END IF;

    -- Para cada factura confirmada con retención IVA en el período, una fila
    -- por alícuota aplicada (8% o 16%) cuya base sea > 0.
    EXECUTE format($q$
        WITH base_por_alicuota AS (
            SELECT
                f.id                                AS factura_id,
                f.fecha                             AS fecha,
                f.numero_factura                    AS numero_factura,
                f.numero_control                    AS numero_control,
                f.iva_monto                         AS iva_monto_total,
                f.retencion_iva_pct                 AS retencion_pct,
                f.retencion_iva_monto               AS retencion_monto_total,
                f.comprobante_retencion_iva_numero  AS comprobante,
                pv.rif                              AS proveedor_rif,
                pv.nombre                           AS proveedor_nombre,
                CASE i.iva_alicuota
                    WHEN 'reducida_8' THEN 8
                    WHEN 'general_16' THEN 16
                    ELSE 0
                END                                 AS alicuota,
                COALESCE(SUM(NULLIF(i.base_iva, 0)),
                         SUM(i.costo_total))        AS base_imponible,
                COALESCE(SUM(NULLIF(i.base_iva, 0)),
                         SUM(i.costo_total)) *
                    CASE i.iva_alicuota
                        WHEN 'reducida_8' THEN 0.08
                        WHEN 'general_16' THEN 0.16
                        ELSE 0
                    END                              AS iva_alicuota_monto
            FROM %I.inventario_facturas_compra f
            JOIN %I.inventario_proveedores pv ON pv.id = f.proveedor_id
            JOIN %I.inventario_facturas_compra_items i ON i.factura_id = f.id
            WHERE f.empresa_id              = %L
              AND f.periodo                 = %L
              AND f.estado                  = 'confirmada'
              AND COALESCE(f.retencion_iva_pct, 0) > 0
              AND COALESCE(f.retencion_iva_monto, 0) > 0
              AND i.iva_alicuota IN ('reducida_8', 'general_16')
            GROUP BY f.id, f.fecha, f.numero_factura, f.numero_control,
                     f.iva_monto, f.retencion_iva_pct, f.retencion_iva_monto,
                     f.comprobante_retencion_iva_numero,
                     pv.rif, pv.nombre, i.iva_alicuota
        ),
        exento_por_factura AS (
            SELECT
                i.factura_id,
                COALESCE(SUM(NULLIF(i.base_iva, 0)),
                         SUM(i.costo_total)) AS monto_exento
            FROM %I.inventario_facturas_compra_items i
            WHERE i.iva_alicuota = 'exenta'
            GROUP BY i.factura_id
        )
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'fecha',                b.fecha,
                'tipo_operacion',       'C',
                'tipo_documento',       '01',
                'proveedor_rif',        b.proveedor_rif,
                'proveedor_nombre',     b.proveedor_nombre,
                'numero_factura',       COALESCE(b.numero_factura, ''),
                'numero_control',       COALESCE(b.numero_control, ''),
                'base_imponible',       ROUND(b.base_imponible::numeric, 2),
                'alicuota',             b.alicuota,
                'iva_monto',            ROUND(b.iva_alicuota_monto::numeric, 2),
                'iva_retenido',         ROUND((b.iva_alicuota_monto * b.retencion_pct / 100)::numeric, 2),
                'monto_total_linea',    ROUND((b.base_imponible + b.iva_alicuota_monto)::numeric, 2),
                'monto_exento',         ROUND(COALESCE(e.monto_exento, 0)::numeric, 2),
                'comprobante',          b.comprobante,
                'documento_afectado',   '0',
                'expediente',           '0'
            ) ORDER BY b.comprobante ASC, b.alicuota DESC
        ), '[]'::jsonb)
        FROM base_por_alicuota b
        LEFT JOIN exento_por_factura e ON e.factura_id = b.factura_id
    $q$,
        v_schema, v_schema, v_schema,
        p_empresa_id, p_periodo,
        v_schema
    ) INTO v_rows;

    RETURN jsonb_build_object(
        'agente_rif',     v_rif,
        'periodo_yyyymm', v_yyyymm,
        'rows',           COALESCE(v_rows, '[]'::jsonb)
    );
END;
$$;
