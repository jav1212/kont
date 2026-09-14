-- Repair only missing reference rates on invoices already linked to complete
-- CSV source rows. A conflicting source, changed identity, or existing rate is
-- deliberately left untouched. This never recalculates totals or posts stock.
with source_rates as (
  select l.tenant_id, l.invoice_id,
    case when (l.source_header->>'exchangeRate') ~ '^[0-9]{1,8}(\.[0-9]{1,4})?$'
      then (l.source_header->>'exchangeRate')::numeric end as rate
  from public.shared_inventory_purchase_import_lines l
  join public.shared_inventory_purchase_import_batches b
    on b.tenant_id=l.tenant_id and b.id=l.batch_id
  join public.shared_inventory_purchase_invoices f
    on f.tenant_id=l.tenant_id and f.id=l.invoice_id and f.company_id=b.company_id
  where l.source_header->>'sourceFormat'='complete'
    and f.calculation_basis='source_bs'
    and coalesce(f.currency_code,'VES')='VES'
    and f.dollar_rate is null
    and f.invoice_number=l.source_header->>'documentNumber'
    and f.invoice_date::text=l.source_header->>'date'
), unambiguous_rates as (
  select tenant_id, invoice_id, min(rate) as rate
  from source_rates
  group by tenant_id, invoice_id
  having count(*)=count(rate) and count(distinct rate)=1 and min(rate)>0
)
update public.shared_inventory_purchase_invoices f
set dollar_rate=r.rate, rate_decimals=4, updated_at=now()
from unambiguous_rates r
where f.tenant_id=r.tenant_id and f.id=r.invoice_id and f.dollar_rate is null;
