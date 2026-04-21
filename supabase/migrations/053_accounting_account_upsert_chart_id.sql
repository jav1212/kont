-- ============================================================================
-- 053 — Fix tenant_accounting_account_upsert to persist chart_id
--
-- The original function omitted chart_id from both the INSERT and the
-- ON CONFLICT DO UPDATE, so account-to-chart assignments were silently ignored.
-- This migration replaces the function with one that correctly reads and writes
-- chart_id from the p_account JSONB payload.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tenant_accounting_account_upsert(
    p_user_id uuid,
    p_account jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema text;
    v_id     text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    v_id     := coalesce(nullif(p_account->>'id', ''), gen_random_uuid()::text);

    EXECUTE format($q$
        INSERT INTO %I.accounting_accounts
            (id, company_id, chart_id, code, name, type, parent_code, is_active, updated_at)
        VALUES (%L, %L, %L, %L, %L, %L, %L, %L, now())
        ON CONFLICT (company_id, code) DO UPDATE
            SET chart_id    = EXCLUDED.chart_id,
                name        = EXCLUDED.name,
                type        = EXCLUDED.type,
                parent_code = EXCLUDED.parent_code,
                is_active   = EXCLUDED.is_active,
                updated_at  = now()
        RETURNING id
    $q$,
        v_schema, v_id,
        p_account->>'company_id',
        nullif(p_account->>'chart_id', ''),
        p_account->>'code',
        p_account->>'name',
        p_account->>'type',
        p_account->>'parent_code',
        (p_account->>'is_active')::boolean
    ) INTO v_id;

    RETURN v_id;
END;
$$;
