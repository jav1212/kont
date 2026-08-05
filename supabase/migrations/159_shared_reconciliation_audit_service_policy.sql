-- The reconciliation audit is an internal service-role-only ledger.
drop policy if exists shared_schema_reconciliation_audit_service_role
    on public.shared_schema_reconciliation_audit;

create policy shared_schema_reconciliation_audit_service_role
    on public.shared_schema_reconciliation_audit
    for all to service_role
    using (true)
    with check (true);

grant all on table public.shared_schema_reconciliation_audit to service_role;
