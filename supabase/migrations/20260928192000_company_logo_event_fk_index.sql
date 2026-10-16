-- Covers the tenant/company foreign key used to preserve logo audit evidence.
create index shared_company_logo_events_company_fk_idx
    on public.shared_company_logo_events(tenant_id, company_id);
