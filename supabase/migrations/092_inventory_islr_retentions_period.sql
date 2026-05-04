-- =============================================================================
-- 092_inventory_islr_retentions_period.sql
--
-- RPC para fetch de retenciones ISLR sobre compras del período. Devuelve un
-- envelope { agente_rif, periodo_yyyymm, rows } donde rows incluye una fila
-- por factura confirmada con islr_monto > 0 en el período. El frontend
-- consume esto para construir el XML SENIAT mensual usando el catálogo de
-- conceptos del Anexo 6.1 (Decreto 1808).
--
-- Diferencia con el TXT IVA (mig 090): aquí UNA fila por factura — el XML
-- ISLR no se desglosa por alícuota.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tenant_inventario_islr_retenciones_periodo(
    p_user_id    uuid,
    p_empresa_id text,
    p_periodo    text   -- formato 'YYYY-MM'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_rif    text;
    v_yyyymm text;
    v_rows   jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    v_yyyymm := REPLACE(p_periodo, '-', '');

    IF length(v_yyyymm) <> 6 THEN
        RAISE EXCEPTION 'Período inválido (esperado YYYY-MM): %', p_periodo;
    END IF;

    EXECUTE format(
        'SELECT rif FROM %I.companies WHERE id = %L',
        v_schema, p_empresa_id
    ) INTO v_rif;

    IF v_rif IS NULL OR v_rif = '' THEN
        RAISE EXCEPTION 'La empresa no tiene RIF configurado — requerido por SENIAT';
    END IF;

    EXECUTE format($q$
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'fecha_operacion',  f.fecha,
                'proveedor_rif',    pv.rif,
                'proveedor_nombre', pv.nombre,
                'numero_factura',   COALESCE(f.numero_factura, ''),
                'numero_control',   COALESCE(f.numero_control, ''),
                'codigo_concepto',  f.islr_concepto,
                'monto_operacion',  ROUND(f.islr_base_retencion::numeric, 2),
                'porcentaje',       ROUND(f.islr_porcentaje::numeric, 2),
                'sustraendo',       ROUND(COALESCE(f.islr_sustraendo, 0)::numeric, 2),
                'monto_retenido',   ROUND(f.islr_monto::numeric, 2),
                'comprobante',      f.comprobante_islr_numero
            ) ORDER BY f.comprobante_islr_numero ASC
        ), '[]'::jsonb)
        FROM %I.inventario_facturas_compra f
        JOIN %I.inventario_proveedores pv ON pv.id = f.proveedor_id
        WHERE f.empresa_id    = %L
          AND f.periodo       = %L
          AND f.estado        = 'confirmada'
          AND f.islr_concepto IS NOT NULL
          AND COALESCE(f.islr_monto, 0) > 0
    $q$,
        v_schema, v_schema,
        p_empresa_id, p_periodo
    ) INTO v_rows;

    RETURN jsonb_build_object(
        'agente_rif',     v_rif,
        'periodo_yyyymm', v_yyyymm,
        'rows',           COALESCE(v_rows, '[]'::jsonb)
    );
END;
$$;
