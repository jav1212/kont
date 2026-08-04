-- Tenant-scoped shared bonifications operations.
CREATE OR REPLACE FUNCTION public.shared_payroll_bonifications_run_save(p_tenant_id uuid,p_run jsonb,p_receipts jsonb,p_status text DEFAULT 'confirmed')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_run_id text:=gen_random_uuid()::text; v_company_id text:=p_run->>'company_id'; v_receipt jsonb; v_employee_id text;
BEGIN
 IF p_status NOT IN ('draft','confirmed') THEN RAISE EXCEPTION 'Invalid bonifications status'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.shared_companies WHERE tenant_id=p_tenant_id AND id=v_company_id) THEN RAISE EXCEPTION 'Company does not belong to tenant'; END IF;
 INSERT INTO public.shared_payroll_bonifications_runs(tenant_id,id,company_id,period_start,period_end,exchange_rate,total_ves,employee_count,line_count,status,confirmed_at)
 VALUES(p_tenant_id,v_run_id,v_company_id,(p_run->>'period_start')::date,(p_run->>'period_end')::date,(p_run->>'exchange_rate')::numeric,(p_run->>'total_ves')::numeric,(p_run->>'employee_count')::integer,(p_run->>'line_count')::integer,p_status,now());
 FOR v_receipt IN SELECT value FROM jsonb_array_elements(COALESCE(p_receipts,'[]'::jsonb)) LOOP
   v_employee_id:=NULLIF(v_receipt->>'employee_id','');
   IF v_employee_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.shared_employees WHERE tenant_id=p_tenant_id AND id=v_employee_id AND company_id=v_company_id) THEN RAISE EXCEPTION 'Employee does not belong to tenant company'; END IF;
   INSERT INTO public.shared_payroll_bonifications_receipts(tenant_id,id,run_id,company_id,employee_id,employee_cedula,employee_name,employee_role,total_ves,bonus_lines)
   VALUES(p_tenant_id,gen_random_uuid()::text,v_run_id,v_company_id,v_employee_id,v_receipt->>'employee_cedula',v_receipt->>'employee_nombre',v_receipt->>'employee_cargo',(v_receipt->>'total_ves')::numeric,COALESCE(v_receipt->'bonus_lines','[]'::jsonb));
 END LOOP;
 RETURN v_run_id;
END; $$;

CREATE OR REPLACE FUNCTION public.shared_payroll_bonifications_runs_by_company(p_tenant_id uuid,p_company_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) FROM (SELECT id,company_id,period_start,period_end,exchange_rate,total_ves,employee_count,line_count,status,confirmed_at,created_at FROM public.shared_payroll_bonifications_runs WHERE tenant_id=p_tenant_id AND company_id=p_company_id)x;
$$;

CREATE OR REPLACE FUNCTION public.shared_payroll_bonifications_receipts_by_run(p_tenant_id uuid,p_run_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at),'[]'::jsonb) FROM (SELECT id,run_id,company_id,employee_id,employee_cedula,employee_name AS employee_nombre,employee_role AS employee_cargo,total_ves,bonus_lines,created_at FROM public.shared_payroll_bonifications_receipts WHERE tenant_id=p_tenant_id AND run_id=p_run_id)x;
$$;

CREATE OR REPLACE FUNCTION public.shared_payroll_bonifications_run_unconfirm(p_tenant_id uuid,p_run_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb;
BEGIN
 UPDATE public.shared_payroll_bonifications_runs SET status='draft',confirmed_at=now() WHERE tenant_id=p_tenant_id AND id=p_run_id RETURNING jsonb_build_object('id',id,'company_id',company_id) INTO v_result;
 IF v_result IS NULL THEN RAISE EXCEPTION 'Bonifications run does not belong to tenant'; END IF;
 RETURN v_result;
END; $$;

REVOKE EXECUTE ON FUNCTION public.shared_payroll_bonifications_run_save(uuid,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_payroll_bonifications_runs_by_company(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_payroll_bonifications_receipts_by_run(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_payroll_bonifications_run_unconfirm(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shared_payroll_bonifications_run_save(uuid,jsonb,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_payroll_bonifications_runs_by_company(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_payroll_bonifications_receipts_by_run(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_payroll_bonifications_run_unconfirm(uuid,text) TO service_role;
