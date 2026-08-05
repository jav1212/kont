-- Accelerates invited-user tenant resolution without changing authorization.
create index if not exists tenant_memberships_active_member_created_idx
on public.tenant_memberships (member_id, created_at)
where accepted_at is not null and revoked_at is null;
