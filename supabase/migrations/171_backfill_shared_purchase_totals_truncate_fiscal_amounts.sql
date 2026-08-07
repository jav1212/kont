-- Reapply the fiscal truncation rule to all existing confirmed itemized
-- purchase invoices. Header-only invoices are not modified.

do $$
declare
    v_invoice record;
begin
    for v_invoice in
        select distinct f.tenant_id, f.id
        from public.shared_inventory_purchase_invoices f
        join public.shared_inventory_purchase_invoice_items i
          on i.tenant_id = f.tenant_id
         and i.invoice_id = f.id
        where f.status = 'confirmada'
    loop
        perform public.shared_inventory_purchase_invoice_recalculate_totals(
            v_invoice.tenant_id,
            v_invoice.id
        );
    end loop;
end;
$$;
