-- Tenant-scoped shared accounting integration rules and log.

CREATE OR REPLACE FUNCTION public.shared_accounting_integration_rules_get(p_tenant_id uuid,p_company_id text,p_source text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.source,r.id),'[]'::jsonb)
 FROM public.shared_accounting_integration_rules r
 WHERE r.tenant_id=p_tenant_id AND r.company_id=p_company_id AND (p_source IS NULL OR r.source=p_source);
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_integration_rule_save(p_tenant_id uuid,p_rule jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id text:=COALESCE(NULLIF(p_rule->>'id',''),gen_random_uuid()::text); v_company text:=p_rule->>'company_id'; v_debit text:=p_rule->>'debit_account_id'; v_credit text:=p_rule->>'credit_account_id';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.shared_companies WHERE tenant_id=p_tenant_id AND id=v_company) THEN RAISE EXCEPTION 'Company does not belong to tenant'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.shared_accounting_accounts WHERE tenant_id=p_tenant_id AND company_id=v_company AND id=v_debit) OR NOT EXISTS(SELECT 1 FROM public.shared_accounting_accounts WHERE tenant_id=p_tenant_id AND company_id=v_company AND id=v_credit) THEN RAISE EXCEPTION 'Integration accounts do not belong to tenant company'; END IF;
 INSERT INTO public.shared_accounting_integration_rules(tenant_id,id,company_id,source,debit_account_id,credit_account_id,amount_field,description,is_active,updated_at)
 VALUES(p_tenant_id,v_id,v_company,p_rule->>'source',v_debit,v_credit,COALESCE(p_rule->>'amount_field','total'),COALESCE(p_rule->>'description',''),COALESCE((p_rule->>'is_active')::boolean,true),now())
 ON CONFLICT(tenant_id,id) DO UPDATE SET company_id=EXCLUDED.company_id,source=EXCLUDED.source,debit_account_id=EXCLUDED.debit_account_id,credit_account_id=EXCLUDED.credit_account_id,amount_field=EXCLUDED.amount_field,description=EXCLUDED.description,is_active=EXCLUDED.is_active,updated_at=now()
 WHERE shared_accounting_integration_rules.tenant_id=p_tenant_id;
 RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.shared_accounting_integration_rule_delete(p_tenant_id uuid,p_rule_id text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 DELETE FROM public.shared_accounting_integration_rules WHERE tenant_id=p_tenant_id AND id=p_rule_id;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_integration_log_get(p_tenant_id uuid,p_company_id text,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb)
 FROM (SELECT id,company_id,source,source_ref,entry_id,status,error_message,created_at FROM public.shared_accounting_integration_log WHERE tenant_id=p_tenant_id AND company_id=p_company_id ORDER BY created_at DESC LIMIT GREATEST(1,LEAST(COALESCE(p_limit,100),1000))) x;
$$;

CREATE OR REPLACE FUNCTION public.shared_accounting_integration_log_save(p_tenant_id uuid,p_log jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id text:=gen_random_uuid()::text; v_company text:=p_log->>'company_id'; v_entry text:=NULLIF(p_log->>'entry_id','');
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.shared_companies WHERE tenant_id=p_tenant_id AND id=v_company) THEN RAISE EXCEPTION 'Company does not belong to tenant'; END IF;
 IF v_entry IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.shared_accounting_entries WHERE tenant_id=p_tenant_id AND id=v_entry AND company_id=v_company) THEN RAISE EXCEPTION 'Entry does not belong to tenant company'; END IF;
 INSERT INTO public.shared_accounting_integration_log(tenant_id,id,company_id,source,source_ref,entry_id,status,error_message)
 VALUES(p_tenant_id,v_id,v_company,p_log->>'source',p_log->>'source_ref',v_entry,p_log->>'status',NULLIF(p_log->>'error_message',''));
 RETURN v_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.shared_accounting_integration_rules_get(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_integration_rule_save(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_integration_rule_delete(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_integration_log_get(uuid,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_accounting_integration_log_save(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shared_accounting_integration_rules_get(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_integration_rule_save(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_integration_rule_delete(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_integration_log_get(uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_accounting_integration_log_save(uuid,jsonb) TO service_role;