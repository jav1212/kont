-- Native product auxiliary tables are service-role-only by design. Explicit
-- deny policies document that boundary and prevent accidental direct client
-- access if table grants change in a future migration.
drop policy if exists shared_product_barcodes_deny_client_access on public.shared_product_barcodes;
create policy shared_product_barcodes_deny_client_access on public.shared_product_barcodes
  for all to authenticated using(false) with check(false);

drop policy if exists shared_inventory_product_profiles_deny_client_access on public.shared_inventory_product_profiles;
create policy shared_inventory_product_profiles_deny_client_access on public.shared_inventory_product_profiles
  for all to authenticated using(false) with check(false);

create index if not exists shared_inventory_product_profiles_company_idx
  on public.shared_inventory_product_profiles(tenant_id,company_id);
