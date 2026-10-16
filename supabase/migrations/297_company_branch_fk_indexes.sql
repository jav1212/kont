-- Cover each new FK from the referencing side. These tables are intentionally
-- empty today; the indexes protect future scoped deletes and branch retention.
create index if not exists shared_company_branches_org_fk_idx
  on public.shared_company_branches(organization_id, tenant_id);
create index if not exists shared_company_branch_events_org_fk_idx
  on public.shared_company_branch_events(organization_id, tenant_id);
create index if not exists shared_company_branch_events_branch_fk_idx
  on public.shared_company_branch_events(branch_id);
drop index if exists public.shared_company_branch_events_scope_idx;
