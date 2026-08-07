-- Restore precise converted bases for legacy lines without adjustments.
-- Empty strings are treated as no adjustment for imported legacy rows.

update public.shared_inventory_purchase_invoice_items i
set vat_base = case
    when i.currency = 'D' and i.currency_cost is not null and i.dollar_rate is not null and i.dollar_rate > 0
        then i.quantity * i.currency_cost * i.dollar_rate
    else i.quantity * i.unit_cost
end
from public.shared_inventory_purchase_invoices f
where f.tenant_id = i.tenant_id
  and f.id = i.invoice_id
  and f.status = 'confirmada'
  and coalesce(nullif(trim(i.discount_type), ''), '') = ''
  and coalesce(nullif(trim(i.surcharge_type), ''), '') = ''
  and coalesce(nullif(trim(f.discount_type), ''), '') = ''
  and coalesce(nullif(trim(f.surcharge_type), ''), '') = '';

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
