-- 117_inventory_purchase_confirm_net_cost.sql
--
-- DEFECTO CONTABLE CORREGIDO: la confirmación de facturas de compra cargaba al
-- inventario el costo BRUTO de lista (cantidad × costo_unitario), ignorando el
-- descuento comercial de la factura. Resultado: inventario sobrevalorado y costo
-- promedio inflado en cada compra con descuento.
--
-- Según NIC 2 / VEN-NIF, el costo de adquisición del inventario es la mercancía
-- NETA de descuentos comerciales y de IVA recuperable. El sistema YA calcula y
-- almacena ese neto por línea en `inventario_facturas_compra_items.base_iva`
-- (es la misma base que tenant_inventario_factura_save usa para el subtotal:
--  subtotal = Σ COALESCE(base_iva, costo_total)). El único punto que leía el
-- bruto era la confirmación.
--
-- FIX (quirúrgico): tenant_inventario_factura_confirmar usa el costo NETO
-- (COALESCE(base_iva, costo_total)) como base para:
--   • el movimiento de entrada (costo_unitario, costo_total, costo_moneda)
--   • el recálculo del costo promedio
-- El costo en divisa (costo_moneda) se escala por el mismo factor neto/bruto, de
-- modo que se preserva la invariante costo_unitario = costo_moneda × tasa_dolar.
--
-- COMPATIBILIDAD: para líneas sin descuento base_iva == costo_total (verificado),
-- así que el COALESCE es inocuo y el comportamiento es idéntico al anterior.
-- Para facturas heredadas con base_iva NULL se cae a costo_total (bruto = neto).
-- Sólo cambia el resultado donde realmente hubo descuento (o IVA incluido en
-- precio), que es justamente lo que se busca corregir.
--
-- Esta migración SOLO afecta confirmaciones futuras. Las facturas ya confirmadas
-- con costo bruto se corrigen reprocesándolas (desconfirmar → confirmar), que
-- ahora reaplica la base neta de forma consistente con el kardex.
--
-- Migraciones aplicadas son inmutables: esta función reemplaza la definición de
-- la 091 (última versión previa) vía CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_confirmar(p_user_id uuid, p_factura_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Costo neto de inventario (mercancía sin descuento ni IVA recuperable).
    v_neto_bs          numeric(14,2);
    v_bruto_bs         numeric(14,2);
    v_ratio            numeric;
    v_costo_unit       numeric;
    v_costo_moneda     numeric;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'SELECT * FROM %I.inventario_facturas_compra WHERE id = %L',
        v_schema, p_factura_id
    ) INTO v_factura;

    IF v_factura IS NULL THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
    IF v_factura.estado = 'confirmada' THEN RAISE EXCEPTION 'La factura ya está confirmada'; END IF;

    -- Comprobante IVA
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

    -- Comprobante ISLR
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

        -- ── Base de costo NETA (descuento comercial / IVA ya descontados) ──────
        -- base_iva es el neto por línea; costo_total es el bruto de lista.
        v_bruto_bs := COALESCE(NULLIF(v_item.costo_total, 0), v_item.cantidad * v_item.costo_unitario);
        v_neto_bs  := COALESCE(v_item.base_iva, v_item.costo_total, v_item.cantidad * v_item.costo_unitario);
        v_ratio    := CASE WHEN v_bruto_bs IS NOT NULL AND v_bruto_bs <> 0
                           THEN v_neto_bs / v_bruto_bs
                           ELSE 1 END;
        v_costo_unit   := CASE WHEN COALESCE(v_item.cantidad, 0) <> 0
                               THEN v_neto_bs / v_item.cantidad
                               ELSE v_item.costo_unitario END;
        v_costo_moneda := v_item.costo_moneda * v_ratio;  -- NULL-safe; preserva costo_unit = costo_moneda × tasa

        v_new_existencia := v_existencia_act + v_item.cantidad;

        IF v_existencia_act > 0 THEN
            v_new_costo_prom := (v_existencia_act * v_costo_prom + v_neto_bs)
                                / v_new_existencia;
        ELSE
            v_new_costo_prom := v_costo_unit;
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
            v_item.cantidad, v_costo_unit,
            v_neto_bs, v_new_existencia,
            v_item.moneda, v_costo_moneda, v_item.tasa_dolar,
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
$function$;

-- Permisos: igual que el resto de RPCs tenant_* (defensa en profundidad, mig. 098).
REVOKE EXECUTE ON FUNCTION public.tenant_inventario_factura_confirmar(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.tenant_inventario_factura_confirmar(uuid, text) TO service_role;
