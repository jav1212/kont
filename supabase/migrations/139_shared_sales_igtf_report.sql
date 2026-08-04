-- 139_shared_sales_igtf_report.sql
-- Shared-schema IGTF fortnightly report.

CREATE OR REPLACE FUNCTION public.shared_inventory_sales_igtf_fortnight(
    p_tenant_id uuid, p_company_id text, p_year integer, p_month integer, p_fortnight integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_rif text; v_period text; v_start date; v_end date; v_concepts jsonb; v_total numeric(14,2);
BEGIN
    IF p_fortnight NOT IN (1,2) THEN RAISE EXCEPTION 'Fortnight must be 1 or 2'; END IF;
    IF p_month NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Month must be between 1 and 12'; END IF;
    v_period:=to_char(make_date(p_year,p_month,1),'YYYY-MM');
    v_start:=CASE WHEN p_fortnight=1 THEN make_date(p_year,p_month,1) ELSE make_date(p_year,p_month,16) END;
    v_end:=CASE WHEN p_fortnight=1 THEN make_date(p_year,p_month,15) ELSE (make_date(p_year,p_month,1)+interval '1 month'-interval '1 day')::date END;
    SELECT coalesce(nullif(rif,''),id) INTO v_rif FROM public.shared_companies WHERE tenant_id=p_tenant_id AND id=p_company_id;
    IF v_rif IS NULL OR v_rif='' THEN RAISE EXCEPTION 'Company not found'; END IF;
    SELECT coalesce(jsonb_object_agg(concept,jsonb_build_object('cantidad_operaciones',count_ops,'base_imponible_bs',base_bs,'monto_igtf',amount)), '{}'::jsonb),coalesce(sum(amount),0)
    INTO v_concepts,v_total FROM (
        SELECT financial_tax_concept concept,count(*) count_ops,sum(financial_tax_bs_base)::numeric(14,2) base_bs,sum(financial_tax_amount)::numeric(14,2) amount
        FROM public.shared_inventory_sales_invoices WHERE tenant_id=p_tenant_id AND company_id=p_company_id AND status='confirmada'
          AND financial_tax_applies=true AND financial_tax_concept IS NOT NULL AND invoice_date BETWEEN v_start AND v_end
        GROUP BY financial_tax_concept
    ) agg;
    RETURN jsonb_build_object('agente_rif',v_rif,'periodo',v_period,'quincena',p_fortnight,'fecha_inicio',v_start,'fecha_fin',v_end,'conceptos',v_concepts,'total_igtf',v_total);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.shared_inventory_sales_igtf_fortnight(uuid,text,integer,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shared_inventory_sales_igtf_fortnight(uuid,text,integer,integer,integer) TO service_role;
