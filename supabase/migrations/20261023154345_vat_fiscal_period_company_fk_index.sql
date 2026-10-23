-- Covers the (tenant_id, company_id) foreign key to shared_companies; the primary
-- key leads with organization_id and cannot serve company-side lookups.
create index if not exists shared_tax_reporting_periods_company_idx
  on public.shared_tax_reporting_periods(tenant_id, company_id);
