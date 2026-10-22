-- Cover the tenant FK on the immutable branch audit table.
create index if not exists shared_company_branch_events_tenant_fk_idx
  on public.shared_company_branch_events(tenant_id);
