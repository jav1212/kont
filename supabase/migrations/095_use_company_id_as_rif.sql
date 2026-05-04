-- =============================================================================
-- 095_use_company_id_as_rif.sql
--
-- Fix: companies.id IS the RIF (per repo convention — see CLAUDE.md). Existing
-- RPCs query the separate `rif` column, which was added later and is null for
-- legacy companies → false "RIF no configurado" errors. This migration:
--
--   1. Backfills companies.rif from companies.id where rif is null/empty
--      across every tenant schema.
--   2. Patches tenant_ventas_igtf_quincena to use COALESCE(NULLIF(rif,''), id)
--      so future legacy data keeps working.
-- =============================================================================

-- 1. Backfill across every tenant schema
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        EXECUTE format(
            'UPDATE %I.companies SET rif = id WHERE rif IS NULL OR rif = ''''',
            r.schema_name
        );
    END LOOP;
END $$;

-- 2. Patch tenant_ventas_igtf_quincena
CREATE OR REPLACE FUNCTION public.tenant_ventas_igtf_quincena(
    p_user_id   uuid,
    p_empresa_id text,
    p_year      integer,
    p_month     integer,
    p_quincena  integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_schema   text;
    v_rif      text;
    v_periodo  text;
    v_start    date;
    v_end      date;
    v_rows     jsonb;
    v_total    numeric(14,2);
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    IF p_quincena NOT IN (1, 2) THEN
        RAISE EXCEPTION 'Quincena inválida (esperado 1 o 2): %', p_quincena;
    END IF;
    IF p_month < 1 OR p_month > 12 THEN
        RAISE EXCEPTION 'Mes inválido (1-12): %', p_month;
    END IF;
    v_periodo := to_char(make_date(p_year, p_month, 1), 'YYYY-MM');
    IF p_quincena = 1 THEN
        v_start := make_date(p_year, p_month, 1);
        v_end   := make_date(p_year, p_month, 15);
    ELSE
        v_start := make_date(p_year, p_month, 16);
        v_end   := (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date;
    END IF;
    -- companies.id IS the RIF (per repo convention); fall back when rif column is empty.
    EXECUTE format(
        'SELECT COALESCE(NULLIF(rif, ''''), id) FROM %I.companies WHERE id = %L',
        v_schema, p_empresa_id
    ) INTO v_rif;
    IF v_rif IS NULL OR v_rif = '' THEN
        RAISE EXCEPTION 'Empresa no encontrada: %', p_empresa_id;
    END IF;
    EXECUTE format($q$
        SELECT
            COALESCE(jsonb_object_agg(concepto, jsonb_build_object(
                'cantidad_operaciones', cant,
                'base_imponible_bs',    base_bs,
                'monto_igtf',           monto_igtf
            )), '{}'::jsonb),
            COALESCE(SUM(monto_igtf), 0)
        FROM (
            SELECT
                igtf_percepcion_concepto AS concepto,
                COUNT(*)                 AS cant,
                SUM(igtf_percepcion_base_bs)::numeric(14,2) AS base_bs,
                SUM(igtf_percepcion_monto)::numeric(14,2)   AS monto_igtf
            FROM %I.ventas_facturas
            WHERE empresa_id = %L
              AND estado = 'confirmada'
              AND igtf_percepcion_aplica = true
              AND igtf_percepcion_concepto IS NOT NULL
              AND fecha BETWEEN %L AND %L
            GROUP BY igtf_percepcion_concepto
        ) agg
    $q$, v_schema, p_empresa_id, v_start, v_end) INTO v_rows, v_total;
    RETURN jsonb_build_object(
        'agente_rif',      v_rif,
        'periodo',         v_periodo,
        'quincena',        p_quincena,
        'fecha_inicio',    v_start,
        'fecha_fin',       v_end,
        'conceptos',       v_rows,
        'total_igtf',      v_total
    );
END;
$function$;
