-- Phase 3 of the financed-sales ledger: Treasury reconciliation links on
-- financier deposits and the optional month-end revaluation setting.
-- Additive only: new nullable/defaulted columns, a partial unique index and
-- service-role functions.

ALTER TABLE public.shared_financier_deposits
    ADD COLUMN IF NOT EXISTS bank_entry_id text CHECK (bank_entry_id IS NULL OR length(btrim(bank_entry_id)) BETWEEN 1 AND 128);
-- A bank movement can evidence only one financier deposit of the company.
CREATE UNIQUE INDEX IF NOT EXISTS shared_financier_deposits_bank_entry_uidx
    ON public.shared_financier_deposits(tenant_id, company_id, bank_entry_id) WHERE bank_entry_id IS NOT NULL;

ALTER TABLE public.shared_financed_sales_settings
    ADD COLUMN IF NOT EXISTS revalue_month_end boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.shared_financed_sales_settings_save(
    p_tenant_id uuid, p_company_id text, p_expected_version integer, p_settings jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.shared_financed_sales_settings;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.shared_companies WHERE tenant_id=p_tenant_id AND id=p_company_id) THEN
        RAISE EXCEPTION 'SALES_NOT_FOUND';
    END IF;
    IF p_expected_version = 0 THEN
        INSERT INTO public.shared_financed_sales_settings(tenant_id, company_id, financier_name, upfront_percent, commission_percent, journal_granularity, revalue_month_end, accounts, version)
        VALUES (p_tenant_id, p_company_id, p_settings->>'financier_name', (p_settings->>'upfront_percent')::numeric,
                (p_settings->>'commission_percent')::numeric, p_settings->>'journal_granularity',
                COALESCE((p_settings->>'revalue_month_end')::boolean, false), COALESCE(p_settings->'accounts','{}'::jsonb), 1)
        ON CONFLICT (tenant_id, company_id) DO NOTHING
        RETURNING * INTO v_row;
    ELSE
        UPDATE public.shared_financed_sales_settings SET
            financier_name=p_settings->>'financier_name',
            upfront_percent=(p_settings->>'upfront_percent')::numeric,
            commission_percent=(p_settings->>'commission_percent')::numeric,
            journal_granularity=p_settings->>'journal_granularity',
            revalue_month_end=COALESCE((p_settings->>'revalue_month_end')::boolean, false),
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

-- Applies every link in one transaction; clearing happens before setting so
-- links can move between deposits within the same call.
CREATE OR REPLACE FUNCTION public.shared_financier_deposits_set_bank_links(
    p_tenant_id uuid, p_company_id text, p_links jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer := 0; v_updated integer; v_link jsonb;
BEGIN
    IF jsonb_typeof(p_links) <> 'array' THEN RAISE EXCEPTION 'SALES_FINANCED_COLLECTION_INVALID'; END IF;
    FOR v_link IN SELECT value FROM jsonb_array_elements(p_links) LOOP
        UPDATE public.shared_financier_deposits SET bank_entry_id=NULL
        WHERE tenant_id=p_tenant_id AND company_id=p_company_id AND id=v_link->>'deposit_id';
    END LOOP;
    FOR v_link IN SELECT value FROM jsonb_array_elements(p_links) LOOP
        UPDATE public.shared_financier_deposits SET bank_entry_id=NULLIF(v_link->>'bank_entry_id','')
        WHERE tenant_id=p_tenant_id AND company_id=p_company_id AND id=v_link->>'deposit_id';
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated = 0 THEN RAISE EXCEPTION 'SALES_FINANCED_COLLECTION_INVALID'; END IF;
        v_count := v_count + v_updated;
    END LOOP;
    RETURN v_count;
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'SALES_CONCURRENCY_CONFLICT';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.shared_financed_sales_settings_save(uuid,text,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_financed_sales_settings_save(uuid,text,integer,jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.shared_financier_deposits_set_bank_links(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_financier_deposits_set_bank_links(uuid,text,jsonb) TO service_role;
