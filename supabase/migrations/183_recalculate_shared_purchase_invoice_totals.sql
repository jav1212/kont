-- Recalculate shared purchase invoices after source-currency fiscal rounding correction.
-- The shared function is already the single calculation engine; this backfills stored headers
DO $$
DECLARE
    v_invoice record;
BEGIN
    FOR v_invoice IN
        SELECT tenant_id, id
        FROM public.shared_inventory_purchase_invoices
    LOOP
        PERFORM public.shared_inventory_purchase_invoice_recalculate_totals(v_invoice.tenant_id, v_invoice.id);
    END LOOP;
END;
$$;
