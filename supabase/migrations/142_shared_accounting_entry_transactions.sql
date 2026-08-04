-- Tenant-scoped shared accounting journal entry operations.

CREATE OR REPLACE FUNCTION public.shared_accounting_entries_get(
    p_tenant_id uuid, p_company_id text, p_period_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.date, x.entry_number), '[]'::jsonb)
    FROM (
        SELECT e.id, e.company_id, e.period_id, e.entry_number, e.entry_date AS date,
               e.description, e.status, e.source, e.source_ref, e.posted_at,
               e.created_at, e.updated_at
        FROM public.shared_accounting_entries e
        WHERE e.tenant_id=p_tenant_id AND e.company_id=p_company_id
          AND (p_period_id IS NULL OR e.period_id=p_period_id)
    ) x;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_entry_with_lines_get(
    p_tenant_id uuid, p_entry_id text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'entry', to_jsonb(e) - 'tenant_id',
        'lines', COALESCE((
            SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)
            FROM (
                SELECT l.id, l.entry_id, l.account_id, a.code AS account_code,
                       a.name AS account_name, l.type, l.amount, l.description, l.created_at
                FROM public.shared_accounting_entry_lines l
                JOIN public.shared_accounting_accounts a
                  ON a.tenant_id=l.tenant_id AND a.id=l.account_id
                WHERE l.tenant_id=p_tenant_id AND l.entry_id=p_entry_id
            ) l
        ), '[]'::jsonb)
    )
    FROM (
        SELECT e.id, e.company_id, e.period_id, e.entry_number, e.entry_date AS date,
               e.description, e.status, e.source, e.source_ref, e.posted_at,
               e.created_at, e.updated_at
        FROM public.shared_accounting_entries e
        WHERE e.tenant_id=p_tenant_id AND e.id=p_entry_id
    ) e;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_entry_save(
    p_tenant_id uuid, p_entry jsonb, p_lines jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id text := COALESCE(NULLIF(p_entry->>'id',''), gen_random_uuid()::text);
    v_company_id text := p_entry->>'company_id';
    v_period_id text := p_entry->>'period_id';
    v_line jsonb;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.shared_companies WHERE tenant_id=p_tenant_id AND id=v_company_id) THEN
        RAISE EXCEPTION 'Company does not belong to tenant';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.shared_accounting_periods WHERE tenant_id=p_tenant_id AND id=v_period_id AND company_id=v_company_id AND status='open') THEN
        RAISE EXCEPTION 'Open accounting period not found';
    END IF;
    IF EXISTS (SELECT 1 FROM public.shared_accounting_entries WHERE tenant_id=p_tenant_id AND id=v_id AND status='posted') THEN
        RAISE EXCEPTION 'Posted accounting entry cannot be edited';
    END IF;
    INSERT INTO public.shared_accounting_entries(
        tenant_id,id,company_id,period_id,entry_number,entry_date,description,status,source,source_ref,updated_at
    ) VALUES (
        p_tenant_id,v_id,v_company_id,v_period_id,
        COALESCE(NULLIF(p_entry->>'entry_number','')::integer, COALESCE((SELECT max(entry_number)+1 FROM public.shared_accounting_entries WHERE tenant_id=p_tenant_id AND company_id=v_company_id AND period_id=v_period_id),1)),
        (p_entry->>'date')::date,COALESCE(p_entry->>'description',''),'draft',COALESCE(NULLIF(p_entry->>'source',''),'manual'),NULLIF(p_entry->>'source_ref',''),now()
    )
    ON CONFLICT (tenant_id,id) DO UPDATE SET
        company_id=EXCLUDED.company_id,period_id=EXCLUDED.period_id,entry_date=EXCLUDED.entry_date,
        description=EXCLUDED.description,source=EXCLUDED.source,source_ref=EXCLUDED.source_ref,updated_at=now()
    WHERE shared_accounting_entries.tenant_id=p_tenant_id AND shared_accounting_entries.status='draft';

    DELETE FROM public.shared_accounting_entry_lines WHERE tenant_id=p_tenant_id AND entry_id=v_id;
    FOR v_line IN SELECT value FROM jsonb_array_elements(COALESCE(p_lines,'[]'::jsonb)) LOOP
        IF NOT EXISTS (SELECT 1 FROM public.shared_accounting_accounts WHERE tenant_id=p_tenant_id AND id=v_line->>'account_id' AND company_id=v_company_id) THEN
            RAISE EXCEPTION 'Account does not belong to tenant company';
        END IF;
        IF (v_line->>'type') NOT IN ('debit','credit') OR COALESCE((v_line->>'amount')::numeric,0) <= 0 THEN
            RAISE EXCEPTION 'Invalid journal entry line';
        END IF;
        INSERT INTO public.shared_accounting_entry_lines(tenant_id,id,entry_id,account_id,type,amount,description)
        VALUES (p_tenant_id,gen_random_uuid()::text,v_id,v_line->>'account_id',v_line->>'type',(v_line->>'amount')::numeric,v_line->>'description');
    END LOOP;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_entry_post(p_tenant_id uuid, p_entry_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry record; v_debit numeric; v_credit numeric;
BEGIN
    SELECT e.* INTO v_entry FROM public.shared_accounting_entries e
    WHERE e.tenant_id=p_tenant_id AND e.id=p_entry_id FOR UPDATE;
    IF v_entry IS NULL OR v_entry.status <> 'draft' THEN RAISE EXCEPTION 'Draft accounting entry not found'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.shared_accounting_periods WHERE tenant_id=p_tenant_id AND id=v_entry.period_id AND status='open') THEN
        RAISE EXCEPTION 'Accounting period is closed';
    END IF;
    SELECT COALESCE(sum(amount) FILTER (WHERE type='debit'),0), COALESCE(sum(amount) FILTER (WHERE type='credit'),0)
    INTO v_debit,v_credit FROM public.shared_accounting_entry_lines WHERE tenant_id=p_tenant_id AND entry_id=p_entry_id;
    IF v_debit=0 OR v_debit<>v_credit THEN RAISE EXCEPTION 'Journal entry must be balanced'; END IF;
    UPDATE public.shared_accounting_entries SET status='posted',posted_at=now(),updated_at=now()
    WHERE tenant_id=p_tenant_id AND id=p_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_entries_delete_by_source(
    p_tenant_id uuid, p_company_id text, p_source text, p_source_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids jsonb;
BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('entry_id',id)), '[]'::jsonb) INTO v_ids
    FROM public.shared_accounting_entries
    WHERE tenant_id=p_tenant_id AND company_id=p_company_id AND source=p_source AND source_ref=p_source_ref;
    DELETE FROM public.shared_accounting_entries
    WHERE tenant_id=p_tenant_id AND company_id=p_company_id AND source=p_source AND source_ref=p_source_ref;
    RETURN v_ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_trial_balance_get(
    p_tenant_id uuid, p_company_id text, p_period_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.account_code), '[]'::jsonb)
    FROM (
        SELECT a.id AS account_id, a.code AS account_code, a.name AS account_name, a.type AS account_type,
               COALESCE(sum(l.amount) FILTER (WHERE l.type='debit'),0) AS total_debit,
               COALESCE(sum(l.amount) FILTER (WHERE l.type='credit'),0) AS total_credit,
               COALESCE(sum(l.amount) FILTER (WHERE l.type='debit'),0)-COALESCE(sum(l.amount) FILTER (WHERE l.type='credit'),0) AS balance
        FROM public.shared_accounting_accounts a
        LEFT JOIN public.shared_accounting_entry_lines l ON l.tenant_id=a.tenant_id AND l.account_id=a.id
        LEFT JOIN public.shared_accounting_entries e ON e.tenant_id=l.tenant_id AND e.id=l.entry_id AND e.status='posted'
        WHERE a.tenant_id=p_tenant_id AND a.company_id=p_company_id
          AND (p_period_id IS NULL OR e.period_id=p_period_id)
        GROUP BY a.id,a.code,a.name,a.type
    ) x;
$$;

REVOKE EXECUTE ON FUNCTION public.shared_accounting_entries_get(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_entry_with_lines_get(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_entry_save(uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_entry_post(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_entries_delete_by_source(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_trial_balance_get(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_accounting_entries_get(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_entry_with_lines_get(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_entry_save(uuid,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_entry_post(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_entries_delete_by_source(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_trial_balance_get(uuid,text,text) TO service_role;