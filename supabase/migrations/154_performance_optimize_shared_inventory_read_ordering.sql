-- Match the most frequent tenant/company list ordering patterns.
create index if not exists shared_inventory_products_company_name_idx
on public.shared_inventory_products (tenant_id, company_id, name);

create index if not exists shared_purchase_invoices_company_date_idx
on public.shared_inventory_purchase_invoices (tenant_id, company_id, invoice_date desc);
