-- =============================================================================
-- 066_fix_producto_delete_column_name.sql
-- Corrige `tenant_inventario_productos_delete` (definida en 063): referenciaba
-- `inventario_transformaciones.producto_salida_id`, pero la columna canónica
-- en todos los tenants activos es `producto_terminado_id` (ver bootstrap en
-- 013/048 y RPC `tenant_inventario_transformacion_save` en 013, que nunca
-- cambió de nombre). Eliminar un producto fallaba con:
--   column "producto_salida_id" does not exist
-- =============================================================================

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
            (SELECT COUNT(*) FROM %I.inventario_movimientos              WHERE producto_id          = %L)
          + (SELECT COUNT(*) FROM %I.inventario_facturas_compra_items    WHERE producto_id          = %L)
          + (SELECT COUNT(*) FROM %I.inventario_transformaciones         WHERE producto_terminado_id = %L)
          + (SELECT COUNT(*) FROM %I.inventario_transformaciones_insumos WHERE producto_id          = %L)
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
