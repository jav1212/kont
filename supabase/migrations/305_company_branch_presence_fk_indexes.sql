-- Cover the presence row's branch-scope and organization foreign keys.
create index shared_company_branch_presence_branch_fk_idx
  on public.shared_company_branch_presence(branch_id, tenant_id, company_id);
create index shared_company_branch_presence_organization_fk_idx
  on public.shared_company_branch_presence(organization_id);
