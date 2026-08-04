-- Tenant-scoped shared accounting period operations.

CREATE OR REPLACE FUNCTION public.shared_accounting_periods_get(p_tenant_id uuid, p_company_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.start_date), '[]'::jsonb)
    FROM public.shared_accounting_periods p
    WHERE p.tenant_id = p_tenant_id AND p.company_id = p_company_id;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_period_find_open_for_date(
    p_tenant_id uuid, p_company_id text, p_date date
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT to_jsonb(p)
    FROM public.shared_accounting_periods p
    WHERE p.tenant_id = p_tenant_id AND p.company_id = p_company_id
      AND p.status = 'open' AND p.start_date <= p_date AND p.end_date >= p_date
    ORDER BY p.start_date LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_period_save(p_tenant_id uuid, p_period jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id text := COALESCE(NULLIF(p_period->>'id', ''), gen_random_uuid()::text);
    v_company_id text := p_period->>'company_id';
    v_start date := (p_period->>'start_date')::date;
    v_end date := (p_period->>'end_date')::date;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.shared_companies WHERE tenant_id=p_tenant_id AND id=v_company_id) THEN
        RAISE EXCEPTION 'Company does not belong to tenant';
    END IF;
    IF v_end < v_start THEN RAISE EXCEPTION 'Period end date cannot precede start date'; END IF;
    IF EXISTS (SELECT 1 FROM public.shared_accounting_periods WHERE tenant_id=p_tenant_id AND id=v_id AND status='closed') THEN
        RAISE EXCEPTION 'Closed accounting period cannot be edited';
    END IF;
    INSERT INTO public.shared_accounting_periods(tenant_id,id,company_id,name,start_date,end_date,status,updated_at)
    VALUES (p_tenant_id,v_id,v_company_id,COALESCE(p_period->>'name',''),v_start,v_end,'open',now())
    ON CONFLICT (tenant_id,id) DO UPDATE SET
      company_id=EXCLUDED.company_id,name=EXCLUDED.name,start_date=EXCLUDED.start_date,
      end_date=EXCLUDED.end_date,updated_at=now()
    WHERE shared_accounting_periods.tenant_id=p_tenant_id AND shared_accounting_periods.status='open';
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_period_close(p_tenant_id uuid, p_period_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.shared_accounting_periods
    SET status='closed', closed_at=now(), updated_at=now()
    WHERE tenant_id=p_tenant_id AND id=p_period_id AND status='open';
    IF NOT FOUND THEN RAISE EXCEPTION 'Open accounting period not found'; END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.shared_accounting_periods_get(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_period_find_open_for_date(uuid,text,date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_period_save(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_period_close(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_accounting_periods_get(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_period_find_open_for_date(uuid,text,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_period_save(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_period_close(uuid,text) TO service_role;