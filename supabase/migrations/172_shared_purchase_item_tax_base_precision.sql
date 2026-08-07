-- Preserve four decimals for item tax bases so the final fiscal truncation
-- is applied after, not before, the VAT calculation.

alter table public.shared_inventory_purchase_invoice_items
  alter column vat_base type numeric(14,4)
  using vat_base::numeric;

-- Recover the precise pre-tax line base for legacy lines that have no line or
-- header adjustments. Adjusted lines keep their stored fiscal base because
-- their spread cannot be reconstructed safely without altering the invoice.
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
  and i.discount_type is null
  and i.surcharge_type is null
  and f.discount_type is null
  and f.surcharge_type is null;
