-- ---------------------------------------------------------------------------
-- 025 — RPC: Eliminar factura de compra (solo borradores)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_delete(
    p_user_id    uuid,
    p_factura_id text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_estado text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    -- Verificar que la factura existe y está en borrador
    EXECUTE format(
        'SELECT estado FROM %I.inventario_facturas_compra WHERE id = %L',
        v_schema, p_factura_id
    ) INTO v_estado;

    IF v_estado IS NULL THEN
        RAISE EXCEPTION 'Factura no encontrada';
    END IF;

    IF v_estado != 'borrador' THEN
        RAISE EXCEPTION 'Solo se pueden eliminar facturas en estado borrador';
    END IF;

    -- Eliminar items primero (cascade debería hacerlo, pero explícito por claridad)
    EXECUTE format(
        'DELETE FROM %I.inventario_facturas_compra_items WHERE factura_id = %L',
        v_schema, p_factura_id
    );

    EXECUTE format(
        'DELETE FROM %I.inventario_facturas_compra WHERE id = %L',
        v_schema, p_factura_id
    );
END;
$$;
