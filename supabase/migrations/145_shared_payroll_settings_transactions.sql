-- Tenant-scoped shared payroll settings operations.
CREATE OR REPLACE FUNCTION public.shared_payroll_settings_get(p_tenant_id uuid, p_company_id text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(payroll_settings, '{}'::jsonb)
    FROM public.shared_companies
    WHERE tenant_id = p_tenant_id
      AND id = p_company_id;
$$;

CREATE OR REPLACE FUNCTION public.shared_payroll_settings_save(
    p_tenant_id uuid,
    p_company_id text,
    p_settings jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.shared_companies
    SET payroll_settings = COALESCE(p_settings, '{}'::jsonb), updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND id = p_company_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Company does not belong to tenant';
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.shared_payroll_settings_get(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_payroll_settings_save(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_payroll_settings_get(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_payroll_settings_save(uuid, text, jsonb) TO service_role;
