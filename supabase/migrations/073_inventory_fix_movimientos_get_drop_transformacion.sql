-- =============================================================================
-- 073_inventory_fix_movimientos_get_drop_transformacion.sql
--
-- Hotfix: la migración 071 elimina la columna `transformacion_id` de
-- `inventario_movimientos`, pero la versión vieja de
-- `tenant_inventario_movimientos_get` (definida en 037) todavía la lee dentro
-- de su `jsonb_build_object`. Si 071 quedó aplicada y 070 no, el RPC truena
-- con `column m.transformacion_id does not exist` al listar movimientos.
--
-- Esta migración reaplica la definición correcta del RPC (la misma que trae
-- 070, idempotente vía CREATE OR REPLACE). No depende de que 070 se haya
-- corrido: si ya está, esto es un no-op.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_get(
    p_user_id    uuid,
    p_empresa_id text,
    p_periodo    text DEFAULT NULL
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
                'id',              m.id,
                'empresa_id',      m.empresa_id,
                'producto_id',     m.producto_id,
                'producto_nombre', p.nombre,
                'tipo',            m.tipo,
                'fecha',           m.fecha,
                'periodo',         m.periodo,
                'cantidad',        m.cantidad,
                'costo_unitario',  m.costo_unitario,
                'costo_total',     m.costo_total,
                'saldo_cantidad',  m.saldo_cantidad,
                'referencia',      m.referencia,
                'notas',           m.notas,
                'moneda',          m.moneda,
                'costo_moneda',    m.costo_moneda,
                'tasa_dolar',      m.tasa_dolar,
                'descuento_tipo',  m.descuento_tipo,
                'descuento_valor', m.descuento_valor,
                'descuento_monto', m.descuento_monto,
                'recargo_tipo',    m.recargo_tipo,
                'recargo_valor',   m.recargo_valor,
                'recargo_monto',   m.recargo_monto,
                'base_iva',        m.base_iva,
                'created_at',      m.created_at
            ) ORDER BY m.fecha DESC, m.created_at DESC
        ), '[]'::jsonb)
        FROM %I.inventario_movimientos m
        JOIN %I.inventario_productos p ON p.id = m.producto_id
        WHERE m.empresa_id = %L
        $q$ ||
        CASE WHEN p_periodo IS NOT NULL AND p_periodo <> ''
             THEN format(' AND m.periodo = %L', p_periodo)
             ELSE '' END,
        v_schema, v_schema, p_empresa_id
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
