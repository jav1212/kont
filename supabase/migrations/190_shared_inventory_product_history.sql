-- Product purchase and invoiced-sale history for the shared inventory schema.
-- Values in VES are canonical; source_amount/source_currency preserve the
-- amount entered on the original document.

CREATE INDEX IF NOT EXISTS shared_purchase_items_product_invoice_idx
    ON public.shared_inventory_purchase_invoice_items(tenant_id, product_id, invoice_id);

CREATE INDEX IF NOT EXISTS shared_sales_items_product_invoice_idx
    ON public.shared_inventory_sales_invoice_items(tenant_id, product_id, invoice_id);

CREATE OR REPLACE FUNCTION public.shared_inventory_product_history(
    p_tenant_id uuid,
    p_company_id text,
    p_product_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_product_exists boolean;
    v_latest_purchase jsonb;
    v_points jsonb;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.shared_inventory_products
        WHERE tenant_id = p_tenant_id AND company_id = p_company_id AND id = p_product_id
    ) INTO v_product_exists;

    IF NOT v_product_exists THEN
        RAISE EXCEPTION 'Product not found';
    END IF;

    SELECT to_jsonb(x) INTO v_latest_purchase
    FROM (
        SELECT
            f.invoice_date AS date,
            i.currency AS currency,
            COALESCE(i.currency_cost, i.unit_cost) AS source_amount,
            i.unit_cost AS ves_amount,
            i.dollar_rate AS exchange_rate,
            i.quantity,
            f.invoice_number AS reference,
            f.id AS invoice_id
        FROM public.shared_inventory_purchase_invoice_items i
        JOIN public.shared_inventory_purchase_invoices f
          ON f.tenant_id = i.tenant_id AND f.id = i.invoice_id
        WHERE i.tenant_id = p_tenant_id
          AND f.company_id = p_company_id
          AND i.product_id = p_product_id
          AND f.status = 'confirmada'
        ORDER BY f.invoice_date DESC, COALESCE(f.confirmed_at, f.updated_at) DESC, i.created_at DESC
        LIMIT 1
    ) x;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.date, x.created_at), '[]'::jsonb)
    INTO v_points
    FROM (
        SELECT
            'purchase'::text AS kind,
            f.invoice_date AS date,
            i.created_at,
            i.currency AS currency,
            COALESCE(i.currency_cost, i.unit_cost) AS source_amount,
            i.unit_cost AS ves_amount,
            i.dollar_rate AS exchange_rate,
            i.quantity,
            f.invoice_number AS reference,
            f.id AS document_id
        FROM public.shared_inventory_purchase_invoice_items i
        JOIN public.shared_inventory_purchase_invoices f
          ON f.tenant_id = i.tenant_id AND f.id = i.invoice_id
        WHERE i.tenant_id = p_tenant_id
          AND f.company_id = p_company_id
          AND i.product_id = p_product_id
          AND f.status = 'confirmada'

        UNION ALL

        SELECT
            'sale'::text AS kind,
            f.invoice_date AS date,
            i.created_at,
            i.currency AS currency,
            COALESCE(i.currency_price, i.unit_price) AS source_amount,
            i.unit_price AS ves_amount,
            i.dollar_rate AS exchange_rate,
            i.quantity,
            f.invoice_number AS reference,
            f.id AS document_id
        FROM public.shared_inventory_sales_invoice_items i
        JOIN public.shared_inventory_sales_invoices f
          ON f.tenant_id = i.tenant_id AND f.id = i.invoice_id
        WHERE i.tenant_id = p_tenant_id
          AND f.company_id = p_company_id
          AND i.product_id = p_product_id
          AND f.status = 'confirmada'
    ) x;

    RETURN jsonb_build_object(
        'latestPurchase', COALESCE(v_latest_purchase, 'null'::jsonb),
        'points', v_points
    );
END;
$$;

REVOKE ALL ON FUNCTION public.shared_inventory_product_history(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shared_inventory_product_history(uuid, text, text) TO authenticated;
