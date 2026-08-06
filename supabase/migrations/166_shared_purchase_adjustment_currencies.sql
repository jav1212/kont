-- 166_shared_purchase_adjustment_currencies.sql
-- Preserve the entered currency for purchase invoice adjustments in the shared schema.

alter table public.shared_inventory_purchase_invoices
  add column if not exists discount_currency char(1) not null default 'B',
  add column if not exists surcharge_currency char(1) not null default 'B';

alter table public.shared_inventory_purchase_invoice_items
  add column if not exists discount_currency char(1) not null default 'B',
  add column if not exists surcharge_currency char(1) not null default 'B';

alter table public.shared_inventory_purchase_invoices
  drop constraint if exists shared_purchase_invoices_adjustment_currency_check;
alter table public.shared_inventory_purchase_invoices
  add constraint shared_purchase_invoices_adjustment_currency_check check (discount_currency in ('B','D') and surcharge_currency in ('B','D'));

alter table public.shared_inventory_purchase_invoice_items
  drop constraint if exists shared_purchase_items_adjustment_currency_check;
alter table public.shared_inventory_purchase_invoice_items
  add constraint shared_purchase_items_adjustment_currency_check check (discount_currency in ('B','D') and surcharge_currency in ('B','D'));
