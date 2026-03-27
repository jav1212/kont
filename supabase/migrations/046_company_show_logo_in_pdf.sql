-- =============================================================================
-- 046_company_show_logo_in_pdf.sql
-- Agrega show_logo_in_pdf a la tabla companies de cada tenant
-- y actualiza las RPCs de save/update para incluirlo.
-- =============================================================================

-- 1. Agregar columna a todos los schemas de tenant ya provisionados
DO $$
DECLARE rec RECORD;
BEGIN
    FOR rec IN SELECT schema_name FROM public.tenants LOOP
        EXECUTE format(
            'ALTER TABLE %I.companies ADD COLUMN IF NOT EXISTS show_logo_in_pdf boolean NOT NULL DEFAULT false',
            rec.schema_name
        );
    END LOOP;
END;
$$;

-- 2. Actualizar tenant_company_update para incluir el nuevo campo
CREATE OR REPLACE FUNCTION public.tenant_company_update(
    p_user_id          uuid,
    p_id               text,
    p_name             text,
    p_rif              text    DEFAULT NULL,
    p_phone            text    DEFAULT NULL,
    p_address          text    DEFAULT NULL,
    p_logo_url         text    DEFAULT NULL,
    p_show_logo_in_pdf boolean DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'UPDATE %I.companies
         SET name             = %L,
             rif              = %L,
             phone            = %L,
             address          = %L,
             logo_url         = %L,
             show_logo_in_pdf = COALESCE(%L, show_logo_in_pdf),
             updated_at       = now()
         WHERE id = %L RETURNING row_to_json(companies)',
        v_schema, p_name, p_rif, p_phone, p_address, p_logo_url, p_show_logo_in_pdf, p_id
    ) INTO v_result;
    RETURN v_result;
END;
$$;
