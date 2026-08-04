-- Tenant-scoped shared ARI declaration operations.
CREATE OR REPLACE FUNCTION public.shared_payroll_ari_get(p_tenant_id uuid,p_company_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.anio_gravable DESC,x.trimestre_gravable DESC),'[]'::jsonb)
 FROM (SELECT id,company_id,employee_id,employee_cedula,taxable_year AS anio_gravable,taxable_quarter AS trimestre_gravable,ut_value AS valor_ut,quarterly_remuneration AS remuneracion_trimestral,use_single_deduction AS usar_desgravamen_unico,education_deduction AS desg_educacion,insurance_deduction AS desg_seguros,medical_deduction AS desg_medicos,interest_deduction AS desg_intereses,family_dependents AS cargas_familiares,excess_withheld AS impuestos_retenidos_de_mas,withholding_percentage AS porcentaje_retencion,updated_at FROM public.shared_payroll_ari_declarations WHERE tenant_id=p_tenant_id AND company_id=p_company_id)x;
$$;
CREATE OR REPLACE FUNCTION public.shared_payroll_ari_upsert(p_tenant_id uuid,p_declaration jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id text:=COALESCE(NULLIF(p_declaration->>'id',''),gen_random_uuid()::text); v_company text:=p_declaration->>'company_id'; v_employee text:=p_declaration->>'employee_id';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.shared_companies WHERE tenant_id=p_tenant_id AND id=v_company) THEN RAISE EXCEPTION 'Company does not belong to tenant'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.shared_employees WHERE tenant_id=p_tenant_id AND id=v_employee AND company_id=v_company) THEN RAISE EXCEPTION 'Employee does not belong to tenant company'; END IF;
 INSERT INTO public.shared_payroll_ari_declarations(tenant_id,id,company_id,employee_id,employee_cedula,taxable_year,taxable_quarter,ut_value,quarterly_remuneration,use_single_deduction,education_deduction,insurance_deduction,medical_deduction,interest_deduction,family_dependents,excess_withheld,withholding_percentage,updated_at)
 VALUES(p_tenant_id,v_id,v_company,v_employee,p_declaration->>'employee_cedula',(p_declaration->>'anio_gravable')::integer,(p_declaration->>'trimestre_gravable')::integer,(p_declaration->>'valor_ut')::numeric,(p_declaration->>'remuneracion_trimestral')::numeric,COALESCE((p_declaration->>'usar_desgravamen_unico')::boolean,true),(p_declaration->>'desg_educacion')::numeric,(p_declaration->>'desg_seguros')::numeric,(p_declaration->>'desg_medicos')::numeric,(p_declaration->>'desg_intereses')::numeric,(p_declaration->>'cargas_familiares')::integer,(p_declaration->>'impuestos_retenidos_de_mas')::numeric,(p_declaration->>'porcentaje_retencion')::numeric,now())
 ON CONFLICT(tenant_id,id) DO UPDATE SET employee_cedula=EXCLUDED.employee_cedula,taxable_year=EXCLUDED.taxable_year,taxable_quarter=EXCLUDED.taxable_quarter,ut_value=EXCLUDED.ut_value,quarterly_remuneration=EXCLUDED.quarterly_remuneration,use_single_deduction=EXCLUDED.use_single_deduction,education_deduction=EXCLUDED.education_deduction,insurance_deduction=EXCLUDED.insurance_deduction,medical_deduction=EXCLUDED.medical_deduction,interest_deduction=EXCLUDED.interest_deduction,family_dependents=EXCLUDED.family_dependents,excess_withheld=EXCLUDED.excess_withheld,withholding_percentage=EXCLUDED.withholding_percentage,updated_at=now()
 WHERE shared_payroll_ari_declarations.tenant_id=p_tenant_id;
END; $$;
CREATE OR REPLACE FUNCTION public.shared_payroll_ari_delete(p_tenant_id uuid,p_id text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ DELETE FROM public.shared_payroll_ari_declarations WHERE tenant_id=p_tenant_id AND id=p_id; $$;
REVOKE EXECUTE ON FUNCTION public.shared_payroll_ari_get(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_payroll_ari_upsert(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_payroll_ari_delete(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shared_payroll_ari_get(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_payroll_ari_upsert(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_payroll_ari_delete(uuid,text) TO service_role;