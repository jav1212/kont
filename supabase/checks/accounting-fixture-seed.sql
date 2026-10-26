-- Load after migrations 131 and 140: 131 iterates legacy tenant schemas.
insert into public.tenants(id) values('00000000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.organizations values('00000000-0000-4000-8000-000000000002') on conflict do nothing;
insert into auth.users values('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000099') on conflict do nothing;
insert into public.organization_roles(id,organization_id,code) values('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','owner') on conflict do nothing;
insert into public.organization_memberships(organization_id,user_id,role_id) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004') on conflict do nothing;
insert into public.shared_companies values('00000000-0000-4000-8000-000000000001','J-00000000-0','00000000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.organization_role_permissions(role_id,permission_code)
select '00000000-0000-4000-8000-000000000004',code from public.access_control_permissions where code in('accounting.read','accounting.chart.manage') on conflict do nothing;
