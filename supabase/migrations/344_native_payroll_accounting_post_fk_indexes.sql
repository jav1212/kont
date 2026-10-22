-- Keep all private posting-link foreign keys indexed for source lifecycle checks.
create index if not exists shared_native_payroll_accounting_posts_org_idx
  on public.shared_native_payroll_accounting_posts(organization_id);
create index if not exists shared_native_payroll_accounting_posts_entry_idx
  on public.shared_native_payroll_accounting_posts(tenant_id,journal_entry_id);
create index if not exists shared_native_payroll_accounting_posts_reversal_entry_idx
  on public.shared_native_payroll_accounting_posts(tenant_id,reversal_entry_id)
  where reversal_entry_id is not null;
