-- 137_shared_purchase_retention_exports.sql
-- Shared-schema SENIAT retention envelopes.

CREATE OR REPLACE FUNCTION public.shared_inventory_iva_retention_period(
    p_tenant_id uuid,
    p_company_id text,
    p_period text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rif text;
    v_yyyymm text := replace(p_period, '-', '');
    v_rows jsonb;
BEGIN
    SELECT rif INTO v_rif FROM public.shared_companies
    WHERE tenant_id = p_tenant_id AND id = p_company_id;
    IF v_rif IS NULL OR v_rif = '' THEN RAISE EXCEPTION 'Company has no configured RIF'; END IF;
    IF length(v_yyyymm) <> 6 THEN RAISE EXCEPTION 'Invalid period'; END IF;

    WITH base_by_rate AS (
        SELECT f.id, f.invoice_date, f.invoice_number, f.control_number,
               f.vat_retention_percentage, f.vat_retention_receipt_number,
               s.rif supplier_rif, s.name supplier_name,
               CASE i.vat_rate WHEN 'reducida_8' THEN 8 WHEN 'general_16' THEN 16 ELSE 0 END vat_rate,
               COALESCE(SUM(NULLIF(i.vat_base, 0)), SUM(i.total_cost)) taxable_base
        FROM public.shared_inventory_purchase_invoices f
        JOIN public.shared_inventory_suppliers s ON s.tenant_id=f.tenant_id AND s.id=f.supplier_id
        JOIN public.shared_inventory_purchase_invoice_items i ON i.tenant_id=f.tenant_id AND i.invoice_id=f.id
        WHERE f.tenant_id=p_tenant_id AND f.company_id=p_company_id AND f.period=p_period
          AND f.status='confirmada' AND COALESCE(f.vat_retention_percentage,0)>0
          AND COALESCE(f.vat_retention_amount,0)>0 AND i.vat_rate IN ('reducida_8','general_16')
        GROUP BY f.id,f.invoice_date,f.invoice_number,f.control_number,f.vat_retention_percentage,
                 f.vat_retention_receipt_number,s.rif,s.name,i.vat_rate
    ), exempt_by_invoice AS (
        SELECT invoice_id, COALESCE(SUM(NULLIF(vat_base,0)),SUM(total_cost)) exempt_amount
        FROM public.shared_inventory_purchase_invoice_items
        WHERE tenant_id=p_tenant_id AND vat_rate='exenta'
        GROUP BY invoice_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'fecha',b.invoice_date,'tipo_operacion','C','tipo_documento','01',
        'proveedor_rif',b.supplier_rif,'proveedor_nombre',b.supplier_name,
        'numero_factura',coalesce(b.invoice_number,''),'numero_control',coalesce(b.control_number,''),
        'base_imponible',round(b.taxable_base,2),'alicuota',b.vat_rate,
        'iva_monto',round((b.taxable_base*b.vat_rate/100),2),
        'iva_retenido',round((b.taxable_base*b.vat_rate/100*b.vat_retention_percentage/100),2),
        'monto_total_linea',round((b.taxable_base+(b.taxable_base*b.vat_rate/100)),2),
        'monto_exento',round(coalesce(e.exempt_amount,0),2),
        'comprobante',b.vat_retention_receipt_number,'documento_afectado','0','expediente','0'
    ) ORDER BY b.vat_retention_receipt_number,b.vat_rate DESC),'[]'::jsonb)
    INTO v_rows FROM base_by_rate b LEFT JOIN exempt_by_invoice e ON e.invoice_id=b.id;

    RETURN jsonb_build_object('agente_rif',v_rif,'periodo_yyyymm',v_yyyymm,'rows',v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_inventory_islr_retention_period(
    p_tenant_id uuid,
    p_company_id text,
    p_period text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rif text;
    v_yyyymm text := replace(p_period, '-', '');
    v_rows jsonb;
BEGIN
    SELECT rif INTO v_rif FROM public.shared_companies
    WHERE tenant_id=p_tenant_id AND id=p_company_id;
    IF v_rif IS NULL OR v_rif='' THEN RAISE EXCEPTION 'Company has no configured RIF'; END IF;
    IF length(v_yyyymm) <> 6 THEN RAISE EXCEPTION 'Invalid period'; END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'fecha_operacion',f.invoice_date,'proveedor_rif',s.rif,'proveedor_nombre',s.name,
        'numero_factura',coalesce(f.invoice_number,''),'numero_control',coalesce(f.control_number,''),
        'codigo_concepto',f.income_tax_concept,'monto_operacion',round(f.income_tax_base,2),
        'porcentaje',round(f.income_tax_percentage,2),'sustraendo',round(coalesce(f.income_tax_subtrahend,0),2),
        'monto_retenido',round(f.income_tax_amount,2),'comprobante',f.income_tax_receipt_number
    ) ORDER BY f.income_tax_receipt_number),'[]'::jsonb)
    INTO v_rows
    FROM public.shared_inventory_purchase_invoices f
    JOIN public.shared_inventory_suppliers s ON s.tenant_id=f.tenant_id AND s.id=f.supplier_id
    WHERE f.tenant_id=p_tenant_id AND f.company_id=p_company_id AND f.period=p_period
      AND f.status='confirmada' AND f.income_tax_concept IS NOT NULL
      AND coalesce(f.income_tax_amount,0)>0;

    RETURN jsonb_build_object('agente_rif',v_rif,'periodo_yyyymm',v_yyyymm,'rows',v_rows);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.shared_inventory_iva_retention_period(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_inventory_islr_retention_period(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_inventory_iva_retention_period(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_inventory_islr_retention_period(uuid,text,text) TO service_role;
