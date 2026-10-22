-- Covers the complete revision-to-policy foreign key identified by the
-- Supabase performance advisor after migration 289. No business rows change.
create index shared_company_monetary_policy_revisions_parent_idx
    on public.shared_company_monetary_policy_revisions(organization_id, company_id, tenant_id);
