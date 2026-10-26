-- Covers the new self-reference added by accounting chart persistence.
create index if not exists shared_accounting_accounts_counterpart_idx
  on public.shared_accounting_accounts(tenant_id, memorandum_counterpart_id)
  where memorandum_counterpart_id is not null;
