-- ─────────────────────────────────────────────────────────────────────────────
-- 039: Eliminar movimiento (reversión de stock) + editar campos meta
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. DELETE — revierte el efecto en existencia_actual y elimina el registro
CREATE OR REPLACE FUNCTION public.tenant_inventario_movimiento_delete(
    p_user_id uuid,
    p_id      text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema       text;
    v_tipo         text;
    v_producto_id  text;
    v_cantidad     numeric(14,4);
    v_tipos_salida text[] := ARRAY['salida','salida_produccion','ajuste_negativo',
                                   'devolucion_entrada','autoconsumo'];
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'SELECT tipo, producto_id, cantidad FROM %I.inventario_movimientos WHERE id = %L',
        v_schema, p_id
    ) INTO v_tipo, v_producto_id, v_cantidad;

    IF v_tipo IS NULL THEN
        RAISE EXCEPTION 'Movimiento no encontrado';
    END IF;

    -- Revertir el efecto en existencia_actual
    IF v_tipo = ANY(v_tipos_salida) THEN
        -- Era una salida (restó stock) → devolver la cantidad
        EXECUTE format(
            'UPDATE %I.inventario_productos SET existencia_actual = existencia_actual + %L, updated_at = now() WHERE id = %L',
            v_schema, v_cantidad, v_producto_id
        );
    ELSE
        -- Era una entrada (sumó stock) → restar la cantidad
        EXECUTE format(
            'UPDATE %I.inventario_productos SET existencia_actual = GREATEST(0, existencia_actual - %L), updated_at = now() WHERE id = %L',
            v_schema, v_cantidad, v_producto_id
        );
    END IF;

    EXECUTE format(
        'DELETE FROM %I.inventario_movimientos WHERE id = %L',
        v_schema, p_id
    );
END;
$$;

-- 2. UPDATE META — actualiza solo campos que no afectan el saldo del inventario
CREATE OR REPLACE FUNCTION public.tenant_inventario_movimiento_update_meta(
    p_user_id    uuid,
    p_id         text,
    p_fecha      date,
    p_referencia text,
    p_notas      text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        $q$UPDATE %I.inventario_movimientos
           SET fecha = %L, referencia = %L, notas = %L
           WHERE id = %L
           RETURNING row_to_json(inventario_movimientos)::jsonb$q$,
        v_schema, p_fecha, p_referencia, p_notas, p_id
    ) INTO v_result;

    IF v_result IS NULL THEN
        RAISE EXCEPTION 'Movimiento no encontrado';
    END IF;

    RETURN v_result;
END;
$$;
