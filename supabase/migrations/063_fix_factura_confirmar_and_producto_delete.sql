-- =============================================================================
-- 063_fix_factura_confirmar_and_producto_delete.sql
-- Corrige dos errores reportados en el módulo de inventario:
--
-- 1. inventario_movimientos_tipo_check
--    `tenant_inventario_factura_confirmar` (definida por última vez en 026)
--    seguía insertando el tipo legado 'entrada_compra', pero la migración 037
--    renombró los valores a 'entrada'/'salida'/'devolucion_entrada'/'devolucion_salida'
--    y endureció el CHECK. Al confirmar una factura de compra el INSERT fallaba
--    con el CHECK violado.
--
-- 2. inventario_facturas_compra_items_producto_id_fkey
--    `tenant_inventario_productos_delete` hacía un DELETE físico, pero varias
--    tablas referencian `inventario_productos.id` con ON DELETE RESTRICT
--    (movimientos, items de factura, transformaciones, insumos). Al intentar
--    eliminar un producto con historial la FK lo bloqueaba.
--
--    Solución: si hay historial, hacer soft-delete (`activo = false`) para
--    preservar la trazabilidad contable (kardex, libro de inventarios, etc.).
--    Si no hay historial, hard-delete como antes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. tenant_inventario_factura_confirmar — INSERTa 'entrada' (no 'entrada_compra')
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_confirmar(
    p_user_id    uuid,
    p_factura_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema         text;
    v_factura        record;
    v_item           record;
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
-- 2. tenant_inventario_productos_delete — soft-delete si hay historial
-- ---------------------------------------------------------------------------
-- Contrato:
--   - Retorna jsonb { soft_deleted: boolean }.
--   - soft_deleted=true  → producto marcado activo=false (hay historial).
--   - soft_deleted=false → producto eliminado físicamente.
-- El cambio de RETURNS void → RETURNS jsonb requiere DROP previo.
DROP FUNCTION IF EXISTS public.tenant_inventario_productos_delete(uuid, text);

CREATE FUNCTION public.tenant_inventario_productos_delete(
    p_user_id uuid,
    p_id      text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema  text;
    v_refs    int;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format($q$
        SELECT
            (SELECT COUNT(*) FROM %I.inventario_movimientos              WHERE producto_id        = %L)
          + (SELECT COUNT(*) FROM %I.inventario_facturas_compra_items    WHERE producto_id        = %L)
          + (SELECT COUNT(*) FROM %I.inventario_transformaciones         WHERE producto_salida_id = %L)
          + (SELECT COUNT(*) FROM %I.inventario_transformaciones_insumos WHERE producto_id        = %L)
    $q$,
        v_schema, p_id,
        v_schema, p_id,
        v_schema, p_id,
        v_schema, p_id
    ) INTO v_refs;

    IF v_refs > 0 THEN
        EXECUTE format(
            'UPDATE %I.inventario_productos SET activo = false, updated_at = now() WHERE id = %L',
            v_schema, p_id
        );
        RETURN jsonb_build_object('soft_deleted', true);
    END IF;

    EXECUTE format('DELETE FROM %I.inventario_productos WHERE id = %L', v_schema, p_id);
    RETURN jsonb_build_object('soft_deleted', false);
END;
$$;
