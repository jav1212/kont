-- =============================================================================
-- 059_companies_add_sector_and_inventory_config.sql
-- Adds sector (business type) and inventory_config (custom field definitions,
-- visible columns, defaults) to the companies table in all tenant schemas.
-- Also creates dedicated RPC pair for inventory config get/save, and updates
-- existing company save/update RPCs to include sector.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Backfill — add sector + inventory_config to existing tenant schemas
-- ---------------------------------------------------------------------------
DO $$
DECLARE rec RECORD;
BEGIN
    FOR rec IN SELECT schema_name FROM public.tenants LOOP
        EXECUTE format(
            'ALTER TABLE %I.companies
             ADD COLUMN IF NOT EXISTS sector           text,
             ADD COLUMN IF NOT EXISTS inventory_config  jsonb NOT NULL DEFAULT ''{}''::jsonb',
            rec.schema_name
        );
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Update tenant_company_save to include sector
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_company_save(
    p_user_id  uuid,
    p_id       text,
    p_owner_id text,
    p_name     text,
    p_rif      text DEFAULT NULL,
    p_phone    text DEFAULT NULL,
    p_address  text DEFAULT NULL,
    p_logo_url text DEFAULT NULL,
    p_sector   text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_now timestamptz := now();
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'INSERT INTO %I.companies (id, owner_id, name, rif, phone, address, logo_url, sector, created_at, updated_at)
         VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L)
         ON CONFLICT (id) DO UPDATE SET name = %L, rif = %L, phone = %L, address = %L, logo_url = %L, sector = %L, updated_at = %L',
        v_schema,
        p_id, p_owner_id, p_name, p_rif, p_phone, p_address, p_logo_url, p_sector, v_now, v_now,
        p_name, p_rif, p_phone, p_address, p_logo_url, p_sector, v_now
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Update tenant_company_update to include sector
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
    p_sector           text    DEFAULT NULL
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
             updated_at       = now()
         WHERE id = %L RETURNING row_to_json(companies)',
        v_schema, p_name, p_rif, p_phone, p_address, p_logo_url, p_show_logo_in_pdf, p_sector, p_id
    ) INTO v_result;
    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: get inventory config for a company
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_company_get_inventory_config(
    p_user_id    uuid,
    p_company_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema text;
    v_result jsonb;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    EXECUTE format(
        'SELECT inventory_config FROM %I.companies WHERE id = $1',
        v_schema
    ) INTO v_result USING p_company_id;

    RETURN COALESCE(v_result, '{}'::jsonb);

EXCEPTION
    WHEN undefined_column THEN
        RETURN '{}'::jsonb;
    WHEN OTHERS THEN
        RETURN '{}'::jsonb;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. RPC: save inventory config for a company
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_company_save_inventory_config(
    p_user_id    uuid,
    p_company_id text,
    p_config     jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    EXECUTE format(
        'UPDATE %I.companies
         SET inventory_config = $1,
             updated_at       = now()
         WHERE id = $2',
        v_schema
    ) USING p_config, p_company_id;

EXCEPTION
    WHEN undefined_column THEN
        RETURN;
END;
$$;
