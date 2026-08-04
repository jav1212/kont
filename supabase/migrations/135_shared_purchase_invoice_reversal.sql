-- 135_shared_purchase_invoice_reversal.sql
-- Safe shared-schema purchase invoice item imputation and reversal.

CREATE OR REPLACE FUNCTION public.shared_inventory_purchase_invoice_impute_items(
    p_tenant_id uuid,
    p_invoice_id text,
    p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice record;
    v_item jsonb;
    v_item_id text;
    v_net numeric(14,2);
    v_unit numeric(14,4);
    v_ratio numeric;
    v_movement jsonb;
BEGIN
    SELECT * INTO v_invoice
    FROM public.shared_inventory_purchase_invoices
    WHERE tenant_id = p_tenant_id AND id = p_invoice_id
    FOR UPDATE;

    IF v_invoice IS NULL THEN RAISE EXCEPTION 'Purchase invoice not found'; END IF;
    IF v_invoice.status <> 'confirmada' THEN RAISE EXCEPTION 'Only confirmed invoices can receive items'; END IF;
    IF EXISTS (
        SELECT 1 FROM public.shared_inventory_purchase_invoice_items
        WHERE tenant_id = p_tenant_id AND invoice_id = p_invoice_id
    ) THEN
        RAISE EXCEPTION 'Purchase invoice already has items';
    END IF;
    IF jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'At least one purchase item is required';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.shared_inventory_products
            WHERE tenant_id = p_tenant_id AND id = v_item->>'producto_id' AND company_id = v_invoice.company_id
        ) THEN
            RAISE EXCEPTION 'Product does not belong to invoice company';
        END IF;
        IF COALESCE(NULLIF(v_item->>'cantidad', '')::numeric, 0) <= 0 THEN
            RAISE EXCEPTION 'Purchase item quantity must be positive';
        END IF;

        v_item_id := COALESCE(NULLIF(v_item->>'id', ''), gen_random_uuid()::text);
        INSERT INTO public.shared_inventory_purchase_invoice_items (
            tenant_id, id, invoice_id, product_id, quantity, unit_cost, total_cost,
            vat_rate, currency, currency_cost, dollar_rate, discount_type, discount_value,
            discount_amount, surcharge_type, surcharge_value, surcharge_amount, vat_base,
            vat_included, tax_type, tax_value, tax_amount, tax_concept
        ) VALUES (
            p_tenant_id, v_item_id, p_invoice_id, v_item->>'producto_id',
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

        v_net := COALESCE(NULLIF(v_item->>'base_iva', '')::numeric, NULLIF(v_item->>'costo_total', '')::numeric, 0);
        v_unit := v_net / (v_item->>'cantidad')::numeric;
        v_ratio := CASE WHEN NULLIF(v_item->>'costo_total', '')::numeric <> 0
            THEN v_net / (v_item->>'costo_total')::numeric ELSE 1 END;
        v_movement := public.shared_inventory_movement_save(
            p_tenant_id,
            jsonb_build_object(
                'id', gen_random_uuid()::text,
                'empresa_id', v_invoice.company_id,
                'producto_id', v_item->>'producto_id',
                'tipo', 'entrada',
                'fecha', v_invoice.invoice_date::text,
                'cantidad', v_item->>'cantidad',
                'costo_unitario', v_unit,
                'moneda', COALESCE(NULLIF(v_item->>'moneda', ''), 'B'),
                'costo_moneda', CASE WHEN v_item->>'costo_moneda' IS NULL THEN NULL ELSE (v_item->>'costo_moneda')::numeric * v_ratio END,
                'tasa_dolar', NULLIF(v_item->>'tasa_dolar', '')::numeric,
                'referencia', v_invoice.invoice_number,
                'base_iva', v_net
            )
        );
        UPDATE public.shared_inventory_movements
        SET purchase_invoice_id = p_invoice_id
        WHERE tenant_id = p_tenant_id AND id = v_movement->>'id';
    END LOOP;

    RETURN (
        SELECT row_to_json(i)::jsonb
        FROM public.shared_inventory_purchase_invoices i
        WHERE i.tenant_id = p_tenant_id AND i.id = p_invoice_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_inventory_purchase_invoice_unconfirm(
    p_tenant_id uuid,
    p_invoice_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice record;
    v_product record;
    v_move record;
    v_stock numeric(14,4);
    v_average numeric(14,4);
    v_next_stock numeric(14,4);
    v_next_average numeric(14,4);
BEGIN
    SELECT * INTO v_invoice
    FROM public.shared_inventory_purchase_invoices
    WHERE tenant_id = p_tenant_id AND id = p_invoice_id
    FOR UPDATE;

    IF v_invoice IS NULL THEN RAISE EXCEPTION 'Purchase invoice not found'; END IF;
    IF v_invoice.status <> 'confirmada' THEN RAISE EXCEPTION 'Purchase invoice is not confirmed'; END IF;

    CREATE TEMP TABLE IF NOT EXISTS _shared_rebuild_products (product_id text PRIMARY KEY) ON COMMIT DROP;
    INSERT INTO _shared_rebuild_products(product_id)
    SELECT DISTINCT product_id
    FROM public.shared_inventory_movements
    WHERE tenant_id = p_tenant_id AND purchase_invoice_id = p_invoice_id
    ON CONFLICT DO NOTHING;

    DELETE FROM public.shared_inventory_movements
    WHERE tenant_id = p_tenant_id AND purchase_invoice_id = p_invoice_id;

    FOR v_product IN
        SELECT p.* FROM public.shared_inventory_products p
        JOIN _shared_rebuild_products r ON r.product_id = p.id
        WHERE p.tenant_id = p_tenant_id
        FOR UPDATE
    LOOP
        v_stock := 0;
        v_average := 0;
        FOR v_move IN
            SELECT * FROM public.shared_inventory_movements
            WHERE tenant_id = p_tenant_id AND product_id = v_product.id
            ORDER BY date, created_at, id
        LOOP
            IF v_move.type IN ('entrada','ajuste_positivo','devolucion_salida') THEN
                v_next_stock := v_stock + v_move.quantity;
                v_next_average := CASE WHEN v_next_stock > 0
                    THEN ((v_stock * v_average) + v_move.total_cost) / v_next_stock
                    ELSE v_move.unit_cost END;
            ELSE
                v_next_stock := GREATEST(0, v_stock - v_move.quantity);
                v_next_average := v_average;
            END IF;
            UPDATE public.shared_inventory_movements
            SET balance_quantity = v_next_stock
            WHERE tenant_id = p_tenant_id AND id = v_move.id;
            v_stock := v_next_stock;
            v_average := v_next_average;
        END LOOP;
        UPDATE public.shared_inventory_products
        SET current_stock = v_stock, average_cost = v_average, updated_at = now()
        WHERE tenant_id = p_tenant_id AND id = v_product.id;
    END LOOP;

    UPDATE public.shared_inventory_purchase_invoices
    SET status = 'borrador', confirmed_at = NULL, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_invoice_id;

    RETURN (
        SELECT row_to_json(i)::jsonb
        FROM public.shared_inventory_purchase_invoices i
        WHERE i.tenant_id = p_tenant_id AND i.id = p_invoice_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.shared_inventory_purchase_invoice_impute_items(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shared_inventory_purchase_invoice_unconfirm(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_inventory_purchase_invoice_impute_items(uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.shared_inventory_purchase_invoice_unconfirm(uuid,text) TO service_role;
