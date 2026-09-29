-- Used only after a provider rejects credentials; the Web never receives this directory.
create or replace function public.account_security_list_active_organizations_for_email(p_email text)
returns uuid[] language sql stable security definer set search_path=public,auth as $$
  select coalesce(array_agg(distinct m.organization_id),'{}'::uuid[])
  from auth.users u join public.organization_memberships m on m.user_id=u.id
  join public.organizations o on o.id=m.organization_id
  where lower(u.email)=lower(trim(p_email)) and m.status='active' and o.status='active'
$$;
revoke all on function public.account_security_list_active_organizations_for_email(text)
  from public,anon,authenticated,service_role;
grant execute on function public.account_security_list_active_organizations_for_email(text) to service_role;
