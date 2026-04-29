-- =============================================================================
-- 082_inventory_set_existencia.sql
--
-- RPC dedicada para resetear directamente la existencia actual de un producto
-- SIN crear movimientos en el kardex. Se usa por el "generador de ajustes"
-- (/inventory/adjustments/generator) cuando el contador necesita cuadrar el
-- saldo declarado contra un objetivo (ej: 80% de Entradas Bs o Ventas S/IVA Bs)
-- después de que las salidas ya se generaron.
--
-- Esto NO se hace vía `tenant_inventario_productos_upsert` porque ese upsert
-- intencionalmente excluye `existencia_actual` del DO UPDATE para evitar que
-- el frontend pise el saldo al editar metadata. Aquí, en cambio, la operación
-- ES tocar el saldo, así que necesita una RPC propia.
--
-- - Sólo modifica `existencia_actual`. `costo_promedio` se preserva.
-- - No registra movimiento. El kardex queda intacto.
-- - Después del ajuste, la existencia ya no deriva de inicial+entradas-salidas.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tenant_inventario_productos_set_existencia(
    p_user_id      uuid,
    p_empresa_id   text,
    p_producto_id  text,
    p_existencia   numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    IF p_existencia IS NULL OR p_existencia < 0 THEN
        RAISE EXCEPTION 'p_existencia debe ser >= 0';
    END IF;

    EXECUTE format($sql$
        UPDATE %I.inventario_productos
        SET existencia_actual = (%L)::numeric,
            updated_at        = now()
        WHERE id = %L
          AND empresa_id = %L
        RETURNING row_to_json(inventario_productos)
    $sql$,
        v_schema,
        p_existencia,
        p_producto_id,
        p_empresa_id
    ) INTO v_result;

    IF v_result IS NULL THEN
        RAISE EXCEPTION 'Producto no encontrado: %', p_producto_id;
    END IF;

    RETURN v_result;
END;
$$;
