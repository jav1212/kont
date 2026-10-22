-- Cover the organization foreign key and the company audit lookup. Detected
-- by the Supabase performance advisor after applying company administration.
create index shared_company_administration_events_scope_idx
    on public.shared_company_administration_events(organization_id, company_id, occurred_at desc);
