-- =============================================================================
-- 101_inventory_drafts_fix_max_jsonb.sql
-- Fix: las RPCs `tenant_inventario_movimientos_draft_listar_ultimo` y
-- `tenant_inventario_movimientos_draft_get_grupo` (definidas en 087) usan
-- `MAX(d.context)` donde `d.context` es jsonb. Postgres no tiene
-- aggregate `max(jsonb)`, por lo que cualquier llamada falla con:
--   ERROR: function max(jsonb) does not exist
-- y se muestra como toast en el formulario de operaciones (entrada/salida
-- manual de inventario) cada vez que se intenta cargar el último borrador.
--
-- Solución: castear a text para usar `max(text)` y volver a jsonb. Como todas
-- las filas del mismo `draft_group_id` tienen el mismo context (se asigna en
-- el save por grupo), el resultado es estable.
--
-- 087 sigue siendo inmutable; este archivo recrea ambas funciones con la
-- corrección. La firma se mantiene idéntica para no romper REVOKE/GRANT
-- aplicados en 098/099.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. RPC: draft_listar_ultimo (corregida)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_draft_listar_ultimo(
    p_user_id    uuid,
    p_empresa_id text,
    p_kind       text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format($q$
        SELECT jsonb_build_object(
            'draftGroupId', d.draft_group_id,
            'kind',         MAX(d.kind),
            'direction',    MAX(d.direction),
            'ivaMode',      MAX(d.iva_mode),
            'context',      MAX(d.context::text)::jsonb,
            'count',        COUNT(*),
            'totalCantidad', SUM(d.cantidad),
            'updatedAt',    MAX(d.updated_at)
        )
          FROM %I.inventario_movimientos_drafts d
         WHERE d.empresa_id = %L
           AND d.kind = %L
         GROUP BY d.draft_group_id
         ORDER BY MAX(d.updated_at) DESC
         LIMIT 1
    $q$, v_schema, p_empresa_id, p_kind) INTO v_result;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. RPC: draft_get_grupo (corregida)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_draft_get_grupo(
    p_user_id        uuid,
    p_empresa_id     text,
    p_draft_group_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_meta   jsonb;
    v_items  jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format($q$
        SELECT jsonb_build_object(
            'draftGroupId', d.draft_group_id,
            'kind',         MAX(d.kind),
            'direction',    MAX(d.direction),
            'ivaMode',      MAX(d.iva_mode),
            'context',      MAX(d.context::text)::jsonb,
            'fecha',        MAX(d.fecha),
            'updatedAt',    MAX(d.updated_at)
        )
          FROM %I.inventario_movimientos_drafts d
         WHERE d.empresa_id = %L AND d.draft_group_id = %L::uuid
         GROUP BY d.draft_group_id
    $q$, v_schema, p_empresa_id, p_draft_group_id) INTO v_meta;

    IF v_meta IS NULL THEN
        RETURN NULL;
    END IF;

    EXECUTE format($q$
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id',              d.id,
            'productoId',      d.producto_id,
            'tipo',            d.tipo,
            'fecha',           d.fecha,
            'cantidad',        d.cantidad,
            'costoUnitario',   d.costo_unitario,
            'moneda',          d.moneda,
            'costoMoneda',     d.costo_moneda,
            'tasaDolar',       d.tasa_dolar,
            'referencia',      d.referencia,
            'notas',           d.notas,
            'descuentoTipo',   d.descuento_tipo,
            'descuentoValor',  d.descuento_valor,
            'descuentoMonto',  d.descuento_monto,
            'recargoTipo',     d.recargo_tipo,
            'recargoValor',    d.recargo_valor,
            'recargoMonto',    d.recargo_monto,
            'baseIva',         d.base_iva,
            'precioVentaUnitario', d.precio_venta_unitario
        ) ORDER BY d.created_at, d.id), '[]'::jsonb)
          FROM %I.inventario_movimientos_drafts d
         WHERE d.empresa_id = %L AND d.draft_group_id = %L::uuid
    $q$, v_schema, p_empresa_id, p_draft_group_id) INTO v_items;

    RETURN jsonb_build_object('meta', v_meta, 'items', v_items);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reaplicar el lockdown 098: revocar EXECUTE de roles públicos.
--    `CREATE OR REPLACE` no resetea grants, pero blindamos por si las
--    funciones fueron recreadas en otro orden.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.tenant_inventario_movimientos_draft_listar_ultimo(uuid, text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tenant_inventario_movimientos_draft_get_grupo(uuid, text, uuid)    FROM anon, authenticated, PUBLIC;
