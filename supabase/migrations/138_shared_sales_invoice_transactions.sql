-- 138_shared_sales_invoice_transactions.sql
-- Transactional shared-schema sales invoice writes and stock reversal.

ALTER TABLE public.shared_inventory_movements
    ADD COLUMN IF NOT EXISTS sales_invoice_id text;
CREATE INDEX IF NOT EXISTS shared_inventory_movements_sales_invoice_idx
    ON public.shared_inventory_movements(tenant_id, sales_invoice_id);

CREATE OR REPLACE FUNCTION public.shared_inventory_sales_invoice_save(
    p_tenant_id uuid,
    p_invoice jsonb,
    p_items jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id text := COALESCE(NULLIF(p_invoice->>'id',''), gen_random_uuid()::text);
    v_company_id text := p_invoice->>'empresa_id';
    v_customer_id text := p_invoice->>'cliente_id';
    v_item jsonb;
    v_item_id text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.shared_companies WHERE tenant_id=p_tenant_id AND id=v_company_id) THEN
        RAISE EXCEPTION 'Company does not belong to tenant';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.shared_inventory_customers WHERE tenant_id=p_tenant_id AND id=v_customer_id AND company_id=v_company_id) THEN
        RAISE EXCEPTION 'Customer does not belong to tenant company';
    END IF;
    IF EXISTS (SELECT 1 FROM public.shared_inventory_sales_invoices WHERE tenant_id=p_tenant_id AND id=v_id AND status <> 'borrador') THEN
        RAISE EXCEPTION 'Only draft sales invoices can be edited';
    END IF;

    INSERT INTO public.shared_inventory_sales_invoices (
        tenant_id,id,company_id,customer_id,invoice_number,control_number,invoice_date,period,manual_period,
        due_date,payment_terms,status,subtotal,vat_amount,total,notes,dollar_rate,rate_decimals,
        discount_type,discount_value,discount_amount,surcharge_type,surcharge_value,surcharge_amount,
        financial_tax_applies,financial_tax_concept,financial_tax_percentage,financial_tax_currency_base,
        financial_tax_bs_base,updated_at
    ) VALUES (
        p_tenant_id,v_id,v_company_id,v_customer_id,COALESCE(p_invoice->>'numero_factura',''),
        COALESCE(p_invoice->>'numero_control',''),COALESCE(NULLIF(p_invoice->>'fecha',''),CURRENT_DATE::text)::date,
        COALESCE(NULLIF(p_invoice->>'periodo',''),to_char(CURRENT_DATE,'YYYY-MM')),
        COALESCE(NULLIF(p_invoice->>'periodo_manual','')::boolean,false),NULLIF(p_invoice->>'fecha_vencimiento','')::date,
        COALESCE(NULLIF(p_invoice->>'condiciones_pago',''),'contado'),'borrador',
        COALESCE(NULLIF(p_invoice->>'subtotal','')::numeric,0),COALESCE(NULLIF(p_invoice->>'iva_monto','')::numeric,0),
        COALESCE(NULLIF(p_invoice->>'total','')::numeric,0),COALESCE(p_invoice->>'notas',''),
        NULLIF(p_invoice->>'tasa_dolar','')::numeric,NULLIF(p_invoice->>'tasa_decimales','')::smallint,
        NULLIF(p_invoice->>'descuento_tipo',''),NULLIF(p_invoice->>'descuento_valor','')::numeric,
        NULLIF(p_invoice->>'descuento_monto','')::numeric,NULLIF(p_invoice->>'recargo_tipo',''),
        NULLIF(p_invoice->>'recargo_valor','')::numeric,NULLIF(p_invoice->>'recargo_monto','')::numeric,
        COALESCE(NULLIF(p_invoice->>'igtf_percepcion_aplica','')::boolean,false),
        NULLIF(p_invoice->>'igtf_percepcion_concepto',''),NULLIF(p_invoice->>'igtf_percepcion_porcentaje','')::numeric,
        NULLIF(p_invoice->>'igtf_percepcion_base_divisa','')::numeric,NULLIF(p_invoice->>'igtf_percepcion_base_bs','')::numeric,now()
    ) ON CONFLICT (tenant_id,id) DO UPDATE SET
        company_id=EXCLUDED.company_id,customer_id=EXCLUDED.customer_id,invoice_number=EXCLUDED.invoice_number,
        control_number=EXCLUDED.control_number,invoice_date=EXCLUDED.invoice_date,period=EXCLUDED.period,
        manual_period=EXCLUDED.manual_period,due_date=EXCLUDED.due_date,payment_terms=EXCLUDED.payment_terms,
        subtotal=EXCLUDED.subtotal,vat_amount=EXCLUDED.vat_amount,total=EXCLUDED.total,notes=EXCLUDED.notes,
        dollar_rate=EXCLUDED.dollar_rate,rate_decimals=EXCLUDED.rate_decimals,discount_type=EXCLUDED.discount_type,
        discount_value=EXCLUDED.discount_value,discount_amount=EXCLUDED.discount_amount,surcharge_type=EXCLUDED.surcharge_type,
        surcharge_value=EXCLUDED.surcharge_value,surcharge_amount=EXCLUDED.surcharge_amount,
        financial_tax_applies=EXCLUDED.financial_tax_applies,financial_tax_concept=EXCLUDED.financial_tax_concept,
        financial_tax_percentage=EXCLUDED.financial_tax_percentage,financial_tax_currency_base=EXCLUDED.financial_tax_currency_base,
        financial_tax_bs_base=EXCLUDED.financial_tax_bs_base,updated_at=now()
    WHERE shared_inventory_sales_invoices.tenant_id=p_tenant_id AND shared_inventory_sales_invoices.status='borrador';

    DELETE FROM public.shared_inventory_sales_invoice_items WHERE tenant_id=p_tenant_id AND invoice_id=v_id;
    FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) LOOP
        IF NULLIF(v_item->>'producto_id','') IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.shared_inventory_products WHERE tenant_id=p_tenant_id AND id=v_item->>'producto_id' AND company_id=v_company_id
        ) THEN RAISE EXCEPTION 'Product does not belong to invoice company'; END IF;
        IF COALESCE(NULLIF(v_item->>'cantidad','')::numeric,0) <= 0 THEN RAISE EXCEPTION 'Sales item quantity must be positive'; END IF;
        v_item_id := COALESCE(NULLIF(v_item->>'id',''),gen_random_uuid()::text);
        INSERT INTO public.shared_inventory_sales_invoice_items (
            tenant_id,id,invoice_id,product_id,description,quantity,unit_price,line_total,vat_rate,currency,
            currency_price,dollar_rate,discount_type,discount_value,discount_amount,surcharge_type,surcharge_value,
            surcharge_amount,vat_base,vat_included
        ) VALUES (
            p_tenant_id,v_item_id,v_id,NULLIF(v_item->>'producto_id',''),COALESCE(v_item->>'descripcion',''),
            COALESCE(NULLIF(v_item->>'cantidad','')::numeric,0),COALESCE(NULLIF(v_item->>'precio_unitario','')::numeric,0),
            COALESCE(NULLIF(v_item->>'total_linea','')::numeric,0),COALESCE(NULLIF(v_item->>'iva_alicuota',''),'general_16'),
            COALESCE(NULLIF(v_item->>'moneda',''),'B'),NULLIF(v_item->>'precio_moneda','')::numeric,NULLIF(v_item->>'tasa_dolar','')::numeric,
            NULLIF(v_item->>'descuento_tipo',''),NULLIF(v_item->>'descuento_valor','')::numeric,NULLIF(v_item->>'descuento_monto','')::numeric,
            NULLIF(v_item->>'recargo_tipo',''),NULLIF(v_item->>'recargo_valor','')::numeric,NULLIF(v_item->>'recargo_monto','')::numeric,
            NULLIF(v_item->>'base_iva','')::numeric,COALESCE(NULLIF(v_item->>'iva_incluido','')::boolean,false)
        );
    END LOOP;
    RETURN (SELECT row_to_json(i)::jsonb FROM public.shared_inventory_sales_invoices i WHERE i.tenant_id=p_tenant_id AND i.id=v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_inventory_sales_invoice_confirm(
    p_tenant_id uuid, p_invoice_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_invoice record; v_item record; v_product record; v_move jsonb;
BEGIN
    SELECT * INTO v_invoice FROM public.shared_inventory_sales_invoices WHERE tenant_id=p_tenant_id AND id=p_invoice_id FOR UPDATE;
    IF v_invoice IS NULL THEN RAISE EXCEPTION 'Sales invoice not found'; END IF;
    IF v_invoice.status <> 'borrador' THEN RAISE EXCEPTION 'Sales invoice is not a draft'; END IF;
    FOR v_item IN SELECT * FROM public.shared_inventory_sales_invoice_items WHERE tenant_id=p_tenant_id AND invoice_id=p_invoice_id ORDER BY id LOOP
        IF v_item.product_id IS NOT NULL THEN
            SELECT * INTO v_product FROM public.shared_inventory_products WHERE tenant_id=p_tenant_id AND id=v_item.product_id FOR UPDATE;
            IF v_product IS NULL OR v_product.company_id <> v_invoice.company_id THEN RAISE EXCEPTION 'Product does not belong to invoice company'; END IF;
            IF v_product.current_stock < v_item.quantity THEN RAISE EXCEPTION 'Insufficient stock for product %', v_item.product_id; END IF;
            v_move := public.shared_inventory_movement_save(p_tenant_id,jsonb_build_object(
                'id',gen_random_uuid()::text,'empresa_id',v_invoice.company_id,'producto_id',v_item.product_id,'tipo','salida',
                'fecha',v_invoice.invoice_date::text,'cantidad',v_item.quantity,'costo_unitario',v_item.unit_price,
                'moneda',v_item.currency,'costo_moneda',v_item.currency_price,'tasa_dolar',v_item.dollar_rate,
                'referencia',v_invoice.invoice_number,'base_iva',v_item.vat_base));
            UPDATE public.shared_inventory_movements SET sales_invoice_id=p_invoice_id
            WHERE tenant_id=p_tenant_id AND id=v_move->>'id';
        END IF;
    END LOOP;
    UPDATE public.shared_inventory_sales_invoices SET status='confirmada',confirmed_at=now(),updated_at=now()
    WHERE tenant_id=p_tenant_id AND id=p_invoice_id;
    RETURN (SELECT row_to_json(i)::jsonb FROM public.shared_inventory_sales_invoices i WHERE i.tenant_id=p_tenant_id AND i.id=p_invoice_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_inventory_sales_invoice_unconfirm(
    p_tenant_id uuid, p_invoice_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_invoice record; v_product record; v_move record; v_stock numeric(14,4); v_average numeric(14,4); v_next_stock numeric(14,4); v_next_average numeric(14,4);
BEGIN
    SELECT * INTO v_invoice FROM public.shared_inventory_sales_invoices WHERE tenant_id=p_tenant_id AND id=p_invoice_id FOR UPDATE;
    IF v_invoice IS NULL THEN RAISE EXCEPTION 'Sales invoice not found'; END IF;
    IF v_invoice.status <> 'confirmada' THEN RAISE EXCEPTION 'Sales invoice is not confirmed'; END IF;
    CREATE TEMP TABLE IF NOT EXISTS _shared_sales_rebuild_products(product_id text PRIMARY KEY) ON COMMIT DROP;
    INSERT INTO _shared_sales_rebuild_products SELECT DISTINCT product_id FROM public.shared_inventory_movements WHERE tenant_id=p_tenant_id AND sales_invoice_id=p_invoice_id ON CONFLICT DO NOTHING;
    DELETE FROM public.shared_inventory_movements WHERE tenant_id=p_tenant_id AND sales_invoice_id=p_invoice_id;
    FOR v_product IN SELECT p.* FROM public.shared_inventory_products p JOIN _shared_sales_rebuild_products r ON r.product_id=p.id WHERE p.tenant_id=p_tenant_id FOR UPDATE LOOP
        v_stock:=0; v_average:=0;
        FOR v_move IN SELECT * FROM public.shared_inventory_movements WHERE tenant_id=p_tenant_id AND product_id=v_product.id ORDER BY date,created_at,id LOOP
            IF v_move.type IN ('entrada','ajuste_positivo','devolucion_salida') THEN
                v_next_stock:=v_stock+v_move.quantity; v_next_average:=CASE WHEN v_next_stock>0 THEN ((v_stock*v_average)+v_move.total_cost)/v_next_stock ELSE v_move.unit_cost END;
            ELSE v_next_stock:=GREATEST(0,v_stock-v_move.quantity); v_next_average:=v_average; END IF;
            UPDATE public.shared_inventory_movements SET balance_quantity=v_next_stock WHERE tenant_id=p_tenant_id AND id=v_move.id;
            v_stock:=v_next_stock; v_average:=v_next_average;
        END LOOP;
        UPDATE public.shared_inventory_products SET current_stock=v_stock,average_cost=v_average,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_product.id;
    END LOOP;
    UPDATE public.shared_inventory_sales_invoices SET status='borrador',confirmed_at=NULL,updated_at=now() WHERE tenant_id=p_tenant_id AND id=p_invoice_id;
    RETURN (SELECT row_to_json(i)::jsonb FROM public.shared_inventory_sales_invoices i WHERE i.tenant_id=p_tenant_id AND i.id=p_invoice_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_inventory_sales_invoice_delete(p_tenant_id uuid,p_invoice_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
    DELETE FROM public.shared_inventory_sales_invoices WHERE tenant_id=p_tenant_id AND id=p_invoice_id AND status='borrador';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.shared_inventory_sales_invoice_save(uuid,jsonb,jsonb), public.shared_inventory_sales_invoice_confirm(uuid,text), public.shared_inventory_sales_invoice_unconfirm(uuid,text), public.shared_inventory_sales_invoice_delete(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_inventory_sales_invoice_save(uuid,jsonb,jsonb), public.shared_inventory_sales_invoice_confirm(uuid,text), public.shared_inventory_sales_invoice_unconfirm(uuid,text), public.shared_inventory_sales_invoice_delete(uuid,text) TO service_role;
