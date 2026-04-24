-- =============================================================================
-- 067_producto_delete_tolerate_missing_tables.sql
-- `tenant_inventario_productos_delete` asumía que todo tenant tiene
-- `inventario_transformaciones_insumos`, pero tenants antiguos (provisionados
-- antes de la migración que la introdujo) no la tienen — lo que hacía fallar
-- el delete con:
--   relation "tenant_xxx.inventario_transformaciones_insumos" does not exist
--
-- Fix: chequear la existencia de cada tabla con `to_regclass` antes de
-- contarla. Si no existe, su aporte a las referencias es 0.
-- =============================================================================

DROP FUNCTION IF EXISTS public.tenant_inventario_productos_delete(uuid, text);

CREATE FUNCTION public.tenant_inventario_productos_delete(
    p_user_id uuid,
    p_id      text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_refs   int := 0;
    v_count  int;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    IF to_regclass(format('%I.inventario_movimientos', v_schema)) IS NOT NULL THEN
        EXECUTE format('SELECT COUNT(*) FROM %I.inventario_movimientos WHERE producto_id = %L',
                       v_schema, p_id) INTO v_count;
        v_refs := v_refs + v_count;
    END IF;

    IF to_regclass(format('%I.inventario_facturas_compra_items', v_schema)) IS NOT NULL THEN
        EXECUTE format('SELECT COUNT(*) FROM %I.inventario_facturas_compra_items WHERE producto_id = %L',
                       v_schema, p_id) INTO v_count;
        v_refs := v_refs + v_count;
    END IF;

    IF to_regclass(format('%I.inventario_transformaciones', v_schema)) IS NOT NULL THEN
        EXECUTE format('SELECT COUNT(*) FROM %I.inventario_transformaciones WHERE producto_terminado_id = %L',
                       v_schema, p_id) INTO v_count;
        v_refs := v_refs + v_count;
    END IF;

    IF to_regclass(format('%I.inventario_transformaciones_insumos', v_schema)) IS NOT NULL THEN
        EXECUTE format('SELECT COUNT(*) FROM %I.inventario_transformaciones_insumos WHERE producto_id = %L',
                       v_schema, p_id) INTO v_count;
        v_refs := v_refs + v_count;
    END IF;

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
