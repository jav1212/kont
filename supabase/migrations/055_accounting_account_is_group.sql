-- ============================================================================
-- 055 — Update tenant_accounting_account_upsert to include is_group
--
-- This migration updates the upsert function to correctly accept and
-- persist the is_group boolean from the p_account JSONB payload.
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
            (id, company_id, chart_id, code, name, type, parent_code, is_active, is_group, saldo_inicial, updated_at)
        VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, now())
        ON CONFLICT (company_id, code) DO UPDATE
            SET chart_id      = EXCLUDED.chart_id,
                name          = EXCLUDED.name,
                type          = EXCLUDED.type,
                parent_code   = EXCLUDED.parent_code,
                is_active     = EXCLUDED.is_active,
                is_group      = EXCLUDED.is_group,
                saldo_inicial = EXCLUDED.saldo_inicial,
                updated_at    = now()
        RETURNING id
    $q$,
        v_schema, v_id,
        p_account->>'company_id',
        nullif(p_account->>'chart_id', ''),
        p_account->>'code',
        p_account->>'name',
        p_account->>'type',
        p_account->>'parent_code',
        (p_account->>'is_active')::boolean,
        COALESCE((p_account->>'is_group')::boolean, false),
        coalesce((p_account->>'saldo_inicial')::numeric, 0)
    ) INTO v_id;

    RETURN v_id;
END;
$$;
