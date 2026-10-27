CREATE OR REPLACE FUNCTION public.shared_accounting_chart_save(
    p_tenant_id uuid,
    p_chart jsonb
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'ACCOUNTING_LEGACY_WRITER_RETIRED';
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
    RAISE EXCEPTION 'ACCOUNTING_LEGACY_WRITER_RETIRED';
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
BEGIN
    RAISE EXCEPTION 'ACCOUNTING_LEGACY_WRITER_RETIRED';
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_account_upsert(
    p_tenant_id uuid,
    p_account jsonb
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'ACCOUNTING_LEGACY_WRITER_RETIRED';
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
    RAISE EXCEPTION 'ACCOUNTING_LEGACY_WRITER_RETIRED';
END;
$$;
