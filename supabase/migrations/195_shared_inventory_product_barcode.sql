-- Optional scanner-facing product identifier. It is distinct from the internal
-- product code and unique only inside a company.
alter table public.shared_inventory_products
    add column if not exists barcode text;

alter table public.shared_inventory_products
    drop constraint if exists shared_inventory_products_barcode_format_check;

alter table public.shared_inventory_products
    add constraint shared_inventory_products_barcode_format_check
    check (barcode is null or (barcode = btrim(barcode) and length(barcode) between 1 and 128));

create unique index if not exists shared_inventory_products_company_barcode_uidx
    on public.shared_inventory_products (tenant_id, company_id, barcode)
    where barcode is not null and barcode <> '';
