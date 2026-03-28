-- =============================================================================
-- 047_companies_payroll_settings.sql
-- REQ-005: Company-scoped Payroll calculation settings.
--
-- Adds payroll_settings JSONB column to tenant companies tables,
-- backfills existing tenants, and creates two RPC functions for
-- isolated get/save of payroll settings.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Backfill — add payroll_settings to all existing tenant schemas
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r        record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;
        EXECUTE format(
            $sql$ALTER TABLE %I.companies
                 ADD COLUMN IF NOT EXISTS payroll_settings jsonb NOT NULL DEFAULT '{}'::jsonb$sql$,
            v_schema
        );
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. RPC: get payroll settings for a company
--    Returns the payroll_settings JSONB blob, or '{}' if not set / column
--    not yet provisioned (handles tenants created before this migration).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_company_get_payroll_settings(
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
        'SELECT payroll_settings FROM %I.companies WHERE id = $1',
        v_schema
    ) INTO v_result USING p_company_id;

    RETURN COALESCE(v_result, '{}'::jsonb);

EXCEPTION
    WHEN undefined_column THEN
        -- Column not yet present on this tenant (pre-migration). Return empty.
        RETURN '{}'::jsonb;
    WHEN OTHERS THEN
        RETURN '{}'::jsonb;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC: save payroll settings for a company
--    Overwrites the payroll_settings column with the supplied JSONB blob.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_company_save_payroll_settings(
    p_user_id    uuid,
    p_company_id text,
    p_settings   jsonb
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
         SET payroll_settings = $1,
             updated_at       = now()
         WHERE id = $2',
        v_schema
    ) USING p_settings, p_company_id;

EXCEPTION
    WHEN undefined_column THEN
        -- Column not yet present — silently ignore until tenant is migrated.
        RETURN;
END;
$$;
