-- Atomic shared accounting chart and account operations.

CREATE OR REPLACE FUNCTION public.shared_accounting_charts_get(
    p_tenant_id uuid,
    p_company_id text
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.name), '[]'::jsonb)
    FROM (
        SELECT c.id, c.company_id, c.name, count(a.id)::integer AS account_count,
               c.created_at, c.updated_at
        FROM public.shared_accounting_charts c
        LEFT JOIN public.shared_accounting_accounts a
          ON a.tenant_id = c.tenant_id AND a.chart_id = c.id
        WHERE c.tenant_id = p_tenant_id AND c.company_id = p_company_id
        GROUP BY c.id, c.company_id, c.name, c.created_at, c.updated_at
    ) x;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_chart_save(
    p_tenant_id uuid,
    p_chart jsonb
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id text := COALESCE(NULLIF(p_chart->>'id', ''), gen_random_uuid()::text);
    v_company_id text := p_chart->>'company_id';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.shared_companies WHERE tenant_id = p_tenant_id AND id = v_company_id) THEN
        RAISE EXCEPTION 'Company does not belong to tenant';
    END IF;
    INSERT INTO public.shared_accounting_charts(tenant_id, id, company_id, name, updated_at)
    VALUES (p_tenant_id, v_id, v_company_id, COALESCE(p_chart->>'name', ''), now())
    ON CONFLICT (tenant_id, id) DO UPDATE SET
        company_id = EXCLUDED.company_id, name = EXCLUDED.name, updated_at = now()
    WHERE shared_accounting_charts.tenant_id = p_tenant_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_chart_delete(
    p_tenant_id uuid,
    p_chart_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.shared_accounting_charts
    WHERE tenant_id = p_tenant_id AND id = p_chart_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_chart_import(
    p_tenant_id uuid,
    p_company_id text,
    p_name text,
    p_accounts jsonb
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_chart_id text := gen_random_uuid()::text;
    v_account jsonb;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.shared_companies WHERE tenant_id = p_tenant_id AND id = p_company_id) THEN
        RAISE EXCEPTION 'Company does not belong to tenant';
    END IF;
    INSERT INTO public.shared_accounting_charts(tenant_id, id, company_id, name)
    VALUES (p_tenant_id, v_chart_id, p_company_id, p_name);
    FOR v_account IN SELECT value FROM jsonb_array_elements(COALESCE(p_accounts, '[]'::jsonb)) LOOP
        INSERT INTO public.shared_accounting_accounts(
            tenant_id, id, company_id, chart_id, code, name, type, parent_code, is_group
        ) VALUES (
            p_tenant_id, COALESCE(NULLIF(v_account->>'id', ''), gen_random_uuid()::text), p_company_id,
            v_chart_id, v_account->>'code', v_account->>'name', v_account->>'type',
            NULLIF(v_account->>'parent_code', ''), COALESCE((v_account->>'is_group')::boolean, false)
        );
    END LOOP;
    RETURN v_chart_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_accounts_get(
    p_tenant_id uuid,
    p_company_id text
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.code), '[]'::jsonb)
    FROM public.shared_accounting_accounts a
    WHERE a.tenant_id = p_tenant_id AND a.company_id = p_company_id;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_account_upsert(
    p_tenant_id uuid,
    p_account jsonb
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id text := COALESCE(NULLIF(p_account->>'id', ''), gen_random_uuid()::text);
    v_company_id text := p_account->>'company_id';
    v_chart_id text := NULLIF(p_account->>'chart_id', '');
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.shared_companies WHERE tenant_id = p_tenant_id AND id = v_company_id) THEN
        RAISE EXCEPTION 'Company does not belong to tenant';
    END IF;
    IF v_chart_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.shared_accounting_charts
        WHERE tenant_id = p_tenant_id AND id = v_chart_id AND company_id = v_company_id
    ) THEN
        RAISE EXCEPTION 'Chart does not belong to tenant company';
    END IF;
    INSERT INTO public.shared_accounting_accounts(
        tenant_id, id, company_id, chart_id, code, name, type, parent_code,
        is_active, is_group, opening_balance, updated_at
    ) VALUES (
        p_tenant_id, v_id, v_company_id, v_chart_id, p_account->>'code', p_account->>'name',
        p_account->>'type', NULLIF(p_account->>'parent_code', ''),
        COALESCE((p_account->>'is_active')::boolean, true),
        COALESCE((p_account->>'is_group')::boolean, false),
        COALESCE(NULLIF(p_account->>'saldo_inicial', '')::numeric, 0), now()
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
        company_id = EXCLUDED.company_id, chart_id = EXCLUDED.chart_id, code = EXCLUDED.code,
        name = EXCLUDED.name, type = EXCLUDED.type, parent_code = EXCLUDED.parent_code,
        is_active = EXCLUDED.is_active, is_group = EXCLUDED.is_group,
        opening_balance = EXCLUDED.opening_balance, updated_at = now()
    WHERE shared_accounting_accounts.tenant_id = p_tenant_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_account_delete(
    p_tenant_id uuid,
    p_account_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.shared_accounting_accounts
    WHERE tenant_id = p_tenant_id AND id = p_account_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.shared_accounting_charts_get(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_chart_save(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_chart_delete(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_chart_import(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_accounts_get(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_account_upsert(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_account_delete(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_accounting_charts_get(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_chart_save(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_chart_delete(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_chart_import(uuid,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_accounts_get(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_account_upsert(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_account_delete(uuid,text) TO service_role;
