-- Ledger of sales financed by a third party (Cashea): daily financed sales,
-- financier deposits and company settings. Exchange differences are derived
-- from the immutable rate snapshots stored on each row; journal entries are
-- written to the existing accounting tables as drafts by the Web backend.
-- Additive only: no existing table or function changes.

CREATE TABLE IF NOT EXISTS public.shared_financed_sales_settings (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    company_id text NOT NULL,
    financier_name text NOT NULL DEFAULT 'Cashea' CHECK (length(btrim(financier_name)) BETWEEN 1 AND 80),
    upfront_percent numeric(9,4) NOT NULL DEFAULT 60 CHECK (upfront_percent >= 0 AND upfront_percent < 100),
    commission_percent numeric(9,4) NOT NULL DEFAULT 0 CHECK (commission_percent >= 0 AND commission_percent < 100),
    journal_granularity text NOT NULL DEFAULT 'monthly' CHECK (journal_granularity IN ('daily','monthly')),
    -- Role → accounting account id; roles are owned by @kontave/sales.
    accounts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(accounts) = 'object'),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, company_id),
    FOREIGN KEY (tenant_id, company_id) REFERENCES public.shared_companies(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.shared_financed_sales (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    company_id text NOT NULL,
    sale_date date NOT NULL,
    amount_ves numeric(20,2) NOT NULL CHECK (amount_ves > 0),
    upfront_percent numeric(9,4) NOT NULL CHECK (upfront_percent >= 0 AND upfront_percent < 100),
    ves_per_usd numeric(20,8) NOT NULL CHECK (ves_per_usd > 0),
    rate_source text NOT NULL CHECK (rate_source IN ('bcv','manual')),
    note text CHECK (note IS NULL OR length(note) <= 500),
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, company_id) REFERENCES public.shared_companies(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.shared_financier_deposits (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    company_id text NOT NULL,
    deposit_date date NOT NULL,
    amount_ves numeric(20,2) NOT NULL CHECK (amount_ves > 0),
    ves_per_usd numeric(20,8) NOT NULL CHECK (ves_per_usd > 0),
    rate_source text NOT NULL CHECK (rate_source IN ('bcv','manual')),
    commission_percent numeric(9,4) NOT NULL DEFAULT 0 CHECK (commission_percent >= 0 AND commission_percent < 100),
    reference text CHECK (reference IS NULL OR length(reference) <= 120),
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, company_id) REFERENCES public.shared_companies(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS shared_financed_sales_company_date_idx
    ON public.shared_financed_sales(tenant_id, company_id, sale_date);
CREATE INDEX IF NOT EXISTS shared_financier_deposits_company_date_idx
    ON public.shared_financier_deposits(tenant_id, company_id, deposit_date);

-- Writes go through the service-role Web backend after permission checks;
-- members may only read their tenant's rows.
ALTER TABLE public.shared_financed_sales_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_financed_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_financier_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY shared_financed_sales_settings_member_read ON public.shared_financed_sales_settings FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_financed_sales_settings.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL));
CREATE POLICY shared_financed_sales_member_read ON public.shared_financed_sales FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_financed_sales.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL));
CREATE POLICY shared_financier_deposits_member_read ON public.shared_financier_deposits FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_financier_deposits.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL));

REVOKE ALL ON public.shared_financed_sales_settings, public.shared_financed_sales, public.shared_financier_deposits FROM PUBLIC, anon;
GRANT SELECT ON public.shared_financed_sales_settings, public.shared_financed_sales, public.shared_financier_deposits TO authenticated;
GRANT ALL ON public.shared_financed_sales_settings, public.shared_financed_sales, public.shared_financier_deposits TO service_role;

-- Settings use optimistic concurrency: the update applies only when the caller
-- read the current version; the first save inserts version 1.
CREATE OR REPLACE FUNCTION public.shared_financed_sales_settings_save(
    p_tenant_id uuid, p_company_id text, p_expected_version integer, p_settings jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.shared_financed_sales_settings;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.shared_companies WHERE tenant_id=p_tenant_id AND id=p_company_id) THEN
        RAISE EXCEPTION 'SALES_NOT_FOUND';
    END IF;
    IF p_expected_version = 0 THEN
        INSERT INTO public.shared_financed_sales_settings(tenant_id, company_id, financier_name, upfront_percent, commission_percent, journal_granularity, accounts, version)
        VALUES (p_tenant_id, p_company_id, p_settings->>'financier_name', (p_settings->>'upfront_percent')::numeric,
                (p_settings->>'commission_percent')::numeric, p_settings->>'journal_granularity', COALESCE(p_settings->'accounts','{}'::jsonb), 1)
        ON CONFLICT (tenant_id, company_id) DO NOTHING
        RETURNING * INTO v_row;
    ELSE
        UPDATE public.shared_financed_sales_settings SET
            financier_name=p_settings->>'financier_name',
            upfront_percent=(p_settings->>'upfront_percent')::numeric,
            commission_percent=(p_settings->>'commission_percent')::numeric,
            journal_granularity=p_settings->>'journal_granularity',
            accounts=COALESCE(p_settings->'accounts','{}'::jsonb),
            version=version+1,
            updated_at=now()
        WHERE tenant_id=p_tenant_id AND company_id=p_company_id AND version=p_expected_version
        RETURNING * INTO v_row;
    END IF;
    IF v_row.company_id IS NULL THEN RAISE EXCEPTION 'SALES_CONCURRENCY_CONFLICT'; END IF;
    RETURN to_jsonb(v_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.shared_financed_sales_settings_save(uuid,text,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_financed_sales_settings_save(uuid,text,integer,jsonb) TO service_role;
