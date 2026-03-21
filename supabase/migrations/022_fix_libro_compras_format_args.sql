-- Fix: tenant_inventario_libro_compras tenía 5 %I pero solo 4 v_schema como args.
-- El tercer LEFT JOIN LATERAL (general_16) quedaba sin argumento → "too few arguments for format()"

CREATE OR REPLACE FUNCTION public.tenant_inventario_libro_compras(
    p_user_id    uuid,
    p_empresa_id text,
    p_periodo    text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format($q$
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',               f.id,
                'fecha',            f.fecha,
                'numero_factura',   f.numero_factura,
                'numero_control',   f.numero_control,
                'proveedor_rif',    pv.rif,
                'proveedor_nombre', pv.nombre,
                'base_exenta',      COALESCE(exenta.monto,    0),
                'base_gravada_8',   COALESCE(gravada8.monto,  0),
                'iva_8',            ROUND(COALESCE(gravada8.monto,  0) * 8  / 100, 2),
                'base_gravada_16',  COALESCE(gravada16.monto, 0),
                'iva_16',           ROUND(COALESCE(gravada16.monto, 0) * 16 / 100, 2),
                'total',            f.total
            ) ORDER BY f.fecha ASC, f.numero_factura ASC
        ), '[]'::jsonb)
        FROM %I.inventario_facturas_compra f
        JOIN %I.inventario_proveedores pv ON pv.id = f.proveedor_id
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(i.costo_total), 0) AS monto
            FROM %I.inventario_facturas_compra_items i
            WHERE i.factura_id = f.id AND i.iva_alicuota = 'exenta'
        ) exenta ON true
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(i.costo_total), 0) AS monto
            FROM %I.inventario_facturas_compra_items i
            WHERE i.factura_id = f.id AND i.iva_alicuota = 'reducida_8'
        ) gravada8 ON true
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(i.costo_total), 0) AS monto
            FROM %I.inventario_facturas_compra_items i
            WHERE i.factura_id = f.id AND i.iva_alicuota = 'general_16'
        ) gravada16 ON true
        WHERE f.empresa_id = %L
          AND f.periodo    = %L
          AND f.estado     = 'confirmada'
    $q$,
        v_schema, v_schema, v_schema, v_schema, v_schema,
        p_empresa_id, p_periodo
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
