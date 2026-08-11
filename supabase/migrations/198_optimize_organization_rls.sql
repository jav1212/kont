-- Avoid evaluating auth.uid() once per row in organization read policies.

drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations
for select to authenticated using (
    exists (
        select 1 from public.organization_memberships membership
        where membership.organization_id = organizations.id
          and membership.user_id = (select auth.uid())
          and membership.status = 'active'
    )
);

drop policy if exists organization_memberships_self_read on public.organization_memberships;
create policy organization_memberships_self_read on public.organization_memberships
for select to authenticated using (user_id = (select auth.uid()));
