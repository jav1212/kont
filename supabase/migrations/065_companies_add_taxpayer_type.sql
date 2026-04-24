-- =============================================================================
-- 065_companies_add_taxpayer_type.sql
-- Adds taxpayer_type (ordinario | especial) to the companies table in every
-- tenant schema. Default 'ordinario' covers the majority of existing rows.
-- The SENIAT tributary calendar and any other fiscal module (IVA retentions,
-- etc.) read this flag to apply the correct regime.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Backfill — add taxpayer_type to existing tenant schemas
-- ---------------------------------------------------------------------------
DO $$
DECLARE rec RECORD;
BEGIN
    FOR rec IN SELECT schema_name FROM public.tenants LOOP
        EXECUTE format(
            'ALTER TABLE %I.companies
             ADD COLUMN IF NOT EXISTS taxpayer_type text NOT NULL
                 DEFAULT ''ordinario''
                 CHECK (taxpayer_type IN (''ordinario'', ''especial''))',
            rec.schema_name
        );
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Update tenant_company_save to accept taxpayer_type
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_company_save(
    p_user_id        uuid,
    p_id             text,
    p_owner_id       text,
    p_name           text,
    p_rif            text DEFAULT NULL,
    p_phone          text DEFAULT NULL,
    p_address        text DEFAULT NULL,
    p_logo_url       text DEFAULT NULL,
    p_sector         text DEFAULT NULL,
    p_taxpayer_type  text DEFAULT 'ordinario'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_now timestamptz := now();
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'INSERT INTO %I.companies (id, owner_id, name, rif, phone, address, logo_url, sector, taxpayer_type, created_at, updated_at)
         VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)
         ON CONFLICT (id) DO UPDATE SET name = %L, rif = %L, phone = %L, address = %L, logo_url = %L, sector = %L, taxpayer_type = %L, updated_at = %L',
        v_schema,
        p_id, p_owner_id, p_name, p_rif, p_phone, p_address, p_logo_url, p_sector, COALESCE(p_taxpayer_type, 'ordinario'), v_now, v_now,
        p_name, p_rif, p_phone, p_address, p_logo_url, p_sector, COALESCE(p_taxpayer_type, 'ordinario'), v_now
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Update tenant_company_update to accept taxpayer_type
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_company_update(
    p_user_id          uuid,
    p_id               text,
    p_name             text,
    p_rif              text    DEFAULT NULL,
    p_phone            text    DEFAULT NULL,
    p_address          text    DEFAULT NULL,
    p_logo_url         text    DEFAULT NULL,
    p_show_logo_in_pdf boolean DEFAULT NULL,
    p_sector           text    DEFAULT NULL,
    p_taxpayer_type    text    DEFAULT NULL
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
             sector           = COALESCE(%L, sector),
             taxpayer_type    = COALESCE(%L, taxpayer_type),
             updated_at       = now()
         WHERE id = %L RETURNING row_to_json(companies)',
        v_schema, p_name, p_rif, p_phone, p_address, p_logo_url, p_show_logo_in_pdf, p_sector, p_taxpayer_type, p_id
    ) INTO v_result;
    RETURN v_result;
END;
$$;
