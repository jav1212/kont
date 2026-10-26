-- Cover the tenant-scoped company and parent foreign keys added by P3.
create index if not exists shared_accounting_cost_centers_tenant_parent_idx
  on public.shared_accounting_cost_centers(tenant_id,parent_id)
  where parent_id is not null;
create index if not exists shared_accounting_cost_centers_tenant_company_idx
  on public.shared_accounting_cost_centers(tenant_id,company_id);
create index if not exists shared_accounting_attribute_values_tenant_company_idx
  on public.shared_accounting_attribute_values(tenant_id,company_id);
create index if not exists shared_accounting_account_dimensions_tenant_company_idx
  on public.shared_accounting_account_dimensions(tenant_id,company_id);
