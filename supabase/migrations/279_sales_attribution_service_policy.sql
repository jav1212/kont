-- RLS stays enabled for the attribution ledger. Only the trusted server role
-- can reach its explicitly granted read/write operations.
create policy shared_inventory_sales_attributions_service_role
  on public.shared_inventory_sales_invoice_attributions
  for all to service_role
  using (true)
  with check (true);
