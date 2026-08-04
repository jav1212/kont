-- 134_shared_purchase_invoice_transactions.sql
-- Transactional shared-schema purchase invoice writes for the pilot rollout.

CREATE OR REPLACE FUNCTION public.shared_inventory_purchase_invoice_save(
    p_tenant_id uuid,
    p_invoice jsonb,
    p_items jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id text := COALESCE(NULLIF(p_invoice->>'id', ''), gen_random_uuid()::text);
    v_company_id text := p_invoice->>'empresa_id';
    v_supplier_id text := p_invoice->>'proveedor_id';
    v_status text := COALESCE(NULLIF(p_invoice->>'estado', ''), 'borrador');
    v_item jsonb;
    v_item_id text;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.shared_companies
        WHERE tenant_id = p_tenant_id AND id = v_company_id
    ) THEN
        RAISE EXCEPTION 'Company does not belong to tenant';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.shared_inventory_suppliers
        WHERE tenant_id = p_tenant_id AND id = v_supplier_id AND company_id = v_company_id
    ) THEN
        RAISE EXCEPTION 'Supplier does not belong to tenant company';
    END IF;
    IF v_status NOT IN ('borrador', 'confirmada') THEN
        RAISE EXCEPTION 'Invalid purchase invoice status';
    END IF;

    IF v_status = 'confirmada' THEN
        RAISE EXCEPTION 'Use the confirm function to confirm a purchase invoice';
    END IF;
    IF EXISTS (SELECT 1 FROM public.shared_inventory_purchase_invoices WHERE tenant_id = p_tenant_id AND id = v_id AND status = 'confirmada') THEN
        RAISE EXCEPTION 'Purchase invoice is already confirmed';
    END IF;

    INSERT INTO public.shared_inventory_purchase_invoices (
        tenant_id, id, company_id, supplier_id, invoice_number, invoice_date, period,
        status, subtotal, vat_percentage, vat_amount, total, notes, control_number, dollar_rate, rate_decimals,
        discount_type, discount_value, discount_amount, surcharge_type, surcharge_value,
        surcharge_amount, vat_retention_percentage, income_tax_concept, income_tax_percentage,
        income_tax_base, income_tax_subtrahend, tax_unit_value, financial_tax_applies,
        financial_tax_percentage, financial_tax_currency_base, financial_tax_bs_base,
        taxes, updated_at
    ) VALUES (
        p_tenant_id, v_id, v_company_id, v_supplier_id,
        COALESCE(p_invoice->>'numero_factura', ''),
        COALESCE(NULLIF(p_invoice->>'fecha', ''), CURRENT_DATE::text)::date,
        COALESCE(NULLIF(p_invoice->>'periodo', ''), to_char(CURRENT_DATE, 'YYYY-MM')),
        'borrador', COALESCE(NULLIF(p_invoice->>'subtotal', '')::numeric, 0),
        COALESCE(NULLIF(p_invoice->>'iva_porcentaje', '')::numeric, 16),
        COALESCE(NULLIF(p_invoice->>'iva_monto', '')::numeric, 0),
        COALESCE(NULLIF(p_invoice->>'total', '')::numeric, 0),
        COALESCE(p_invoice->>'notas', ''), COALESCE(p_invoice->>'numero_control', ''),
        NULLIF(p_invoice->>'tasa_dolar', '')::numeric,
        NULLIF(p_invoice->>'tasa_decimales', '')::smallint,
        NULLIF(p_invoice->>'descuento_tipo', ''), NULLIF(p_invoice->>'descuento_valor', '')::numeric,
        NULLIF(p_invoice->>'descuento_monto', '')::numeric,
        NULLIF(p_invoice->>'recargo_tipo', ''), NULLIF(p_invoice->>'recargo_valor', '')::numeric,
        NULLIF(p_invoice->>'recargo_monto', '')::numeric,
        COALESCE(NULLIF(p_invoice->>'retencion_iva_pct', '')::numeric, 0),
        NULLIF(p_invoice->>'islr_concepto', ''), NULLIF(p_invoice->>'islr_porcentaje', '')::numeric,
        NULLIF(p_invoice->>'islr_base_retencion', '')::numeric,
        NULLIF(p_invoice->>'islr_sustraendo', '')::numeric,
        NULLIF(p_invoice->>'islr_unidad_tributaria', '')::numeric,
        COALESCE(NULLIF(p_invoice->>'igtf_aplica', '')::boolean, false),
        COALESCE(NULLIF(p_invoice->>'igtf_porcentaje', '')::numeric, 0),
        COALESCE(NULLIF(p_invoice->>'igtf_base_divisa', '')::numeric, 0),
        COALESCE(NULLIF(p_invoice->>'igtf_base_bs', '')::numeric, 0),
        COALESCE(p_invoice->'impuestos', '[]'::jsonb), now()
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
        company_id = EXCLUDED.company_id,
        supplier_id = EXCLUDED.supplier_id,
        invoice_number = EXCLUDED.invoice_number,
        invoice_date = EXCLUDED.invoice_date,
        period = EXCLUDED.period,
        vat_percentage = EXCLUDED.vat_percentage,
        subtotal = EXCLUDED.subtotal,
        vat_amount = EXCLUDED.vat_amount,
        total = EXCLUDED.total,
        notes = EXCLUDED.notes,
        control_number = EXCLUDED.control_number,
        dollar_rate = EXCLUDED.dollar_rate,
        rate_decimals = EXCLUDED.rate_decimals,
        discount_type = EXCLUDED.discount_type,
        discount_value = EXCLUDED.discount_value,
        discount_amount = EXCLUDED.discount_amount,
        surcharge_type = EXCLUDED.surcharge_type,
        surcharge_value = EXCLUDED.surcharge_value,
        surcharge_amount = EXCLUDED.surcharge_amount,
        vat_retention_percentage = EXCLUDED.vat_retention_percentage,
        income_tax_concept = EXCLUDED.income_tax_concept,
        income_tax_percentage = EXCLUDED.income_tax_percentage,
        income_tax_base = EXCLUDED.income_tax_base,
        income_tax_subtrahend = EXCLUDED.income_tax_subtrahend,
        tax_unit_value = EXCLUDED.tax_unit_value,
        financial_tax_applies = EXCLUDED.financial_tax_applies,
        financial_tax_percentage = EXCLUDED.financial_tax_percentage,
        financial_tax_currency_base = EXCLUDED.financial_tax_currency_base,
        financial_tax_bs_base = EXCLUDED.financial_tax_bs_base,
        taxes = EXCLUDED.taxes,
        updated_at = now()
    WHERE shared_inventory_purchase_invoices.tenant_id = p_tenant_id
      AND shared_inventory_purchase_invoices.status = 'borrador';

    DELETE FROM public.shared_inventory_purchase_invoice_items
    WHERE tenant_id = p_tenant_id AND invoice_id = v_id;

    FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
        v_item_id := COALESCE(NULLIF(v_item->>'id', ''), gen_random_uuid()::text);
        INSERT INTO public.shared_inventory_purchase_invoice_items (
            tenant_id, id, invoice_id, product_id, quantity, unit_cost, total_cost,
            vat_rate, currency, currency_cost, dollar_rate, discount_type, discount_value,
            discount_amount, surcharge_type, surcharge_value, surcharge_amount, vat_base,
            vat_included, tax_type, tax_value, tax_amount, tax_concept
        ) VALUES (
            p_tenant_id, v_item_id, v_id, v_item->>'producto_id',
            (v_item->>'cantidad')::numeric, COALESCE(NULLIF(v_item->>'costo_unitario', '')::numeric, 0),
            COALESCE(NULLIF(v_item->>'costo_total', '')::numeric, 0),
            COALESCE(NULLIF(v_item->>'iva_alicuota', ''), 'general_16'),
            COALESCE(NULLIF(v_item->>'moneda', ''), 'B'),
            NULLIF(v_item->>'costo_moneda', '')::numeric, NULLIF(v_item->>'tasa_dolar', '')::numeric,
            NULLIF(v_item->>'descuento_tipo', ''), NULLIF(v_item->>'descuento_valor', '')::numeric,
            NULLIF(v_item->>'descuento_monto', '')::numeric,
            NULLIF(v_item->>'recargo_tipo', ''), NULLIF(v_item->>'recargo_valor', '')::numeric,
            NULLIF(v_item->>'recargo_monto', '')::numeric,
            NULLIF(v_item->>'base_iva', '')::numeric,
            COALESCE(NULLIF(v_item->>'iva_incluido', '')::boolean, false),
            NULLIF(v_item->>'impuesto_tipo', ''), NULLIF(v_item->>'impuesto_valor', '')::numeric,
            NULLIF(v_item->>'impuesto_monto', '')::numeric, NULLIF(v_item->>'impuesto_concepto', '')
        );
    END LOOP;

    RETURN (
        SELECT row_to_json(i)::jsonb
        FROM public.shared_inventory_purchase_invoices i
        WHERE i.tenant_id = p_tenant_id AND i.id = v_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_inventory_purchase_invoice_confirm(
    p_tenant_id uuid,
    p_invoice_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice record;
    v_item record;
    v_movement jsonb;
    v_net numeric(14,2);
    v_unit numeric(14,4);
    v_ratio numeric;
BEGIN
    SELECT * INTO v_invoice
    FROM public.shared_inventory_purchase_invoices
    WHERE tenant_id = p_tenant_id AND id = p_invoice_id
    FOR UPDATE;

    IF v_invoice IS NULL THEN RAISE EXCEPTION 'Purchase invoice not found'; END IF;
    IF v_invoice.status = 'confirmada' THEN RAISE EXCEPTION 'Purchase invoice is already confirmed'; END IF;

    FOR v_item IN
        SELECT * FROM public.shared_inventory_purchase_invoice_items
        WHERE tenant_id = p_tenant_id AND invoice_id = p_invoice_id
        ORDER BY id
    LOOP
        v_net := COALESCE(NULLIF(v_item.vat_base, 0), v_item.total_cost);
        IF v_item.quantity <= 0 THEN RAISE EXCEPTION 'Purchase item quantity must be positive'; END IF;
        v_unit := v_net / v_item.quantity;
        v_ratio := CASE WHEN v_item.total_cost <> 0 THEN v_net / v_item.total_cost ELSE 1 END;

        v_movement := public.shared_inventory_movement_save(
            p_tenant_id,
            jsonb_build_object(
                'id', gen_random_uuid()::text,
                'empresa_id', v_invoice.company_id,
                'producto_id', v_item.product_id,
                'tipo', 'entrada',
                'fecha', v_invoice.invoice_date::text,
                'cantidad', v_item.quantity,
                'costo_unitario', v_unit,
                'moneda', v_item.currency,
                'costo_moneda', CASE WHEN v_item.currency_cost IS NULL THEN NULL ELSE v_item.currency_cost * v_ratio END,
                'tasa_dolar', v_item.dollar_rate,
                'referencia', v_invoice.invoice_number,
                'base_iva', v_net,
                'factura_compra_id', p_invoice_id
            )
        );

        UPDATE public.shared_inventory_movements
        SET purchase_invoice_id = p_invoice_id
        WHERE tenant_id = p_tenant_id AND id = v_movement->>'id';
    END LOOP;

    UPDATE public.shared_inventory_purchase_invoices
    SET status = 'confirmada', confirmed_at = now(), updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_invoice_id;

    RETURN (
        SELECT row_to_json(i)::jsonb
        FROM public.shared_inventory_purchase_invoices i
        WHERE i.tenant_id = p_tenant_id AND i.id = p_invoice_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.shared_inventory_purchase_invoice_save(uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_inventory_purchase_invoice_confirm(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_inventory_purchase_invoice_save(uuid,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_inventory_purchase_invoice_confirm(uuid,text) TO service_role;
