-- ADM-011 smoke: membership, branch scope, selection and audit fixtures roll back.
do $smoke$
declare
  v_admin uuid;
  v_member uuid;
  v_org uuid;
  v_tenant uuid;
  v_member_role uuid;
  v_hash text := gen_random_uuid()::text;
  v_company jsonb;
  v_company_id text;
  v_branch_a jsonb;
  v_branch_b jsonb;
  v_membership jsonb;
  v_selection jsonb;
  v_branches jsonb;
begin
  select o.id, admin.user_id, member.user_id, o.legacy_tenant_id, member.role_id
    into v_org,v_admin,v_member,v_tenant,v_member_role
  from public.organizations o
  join public.organization_memberships admin on admin.organization_id=o.id and admin.status='active'
  join public.organization_roles ar on ar.id=admin.role_id and ar.organization_id=o.id and ar.status='active'
  join public.organization_role_permissions arp on arp.role_id=ar.id and arp.permission_code='branches.assign_users'
  join public.organization_memberships member on member.organization_id=o.id and member.status='active' and member.user_id<>admin.user_id
  join public.organization_roles mr on mr.id=member.role_id and mr.organization_id=o.id and mr.status='active'
  where o.status='active' and o.legacy_tenant_id is not null
    and exists(select 1 from public.organization_role_permissions x where x.role_id=ar.id and x.permission_code='companies.create')
    and exists(select 1 from public.organization_role_permissions x where x.role_id=ar.id and x.permission_code='branches.create')
    and not exists(select 1 from public.organization_role_permissions x where x.role_id=mr.id and x.permission_code='branches.select_any')
  order by o.id,admin.user_id,member.user_id limit 1;
  if not found then raise exception 'SMOKE_NO_ADMIN_AND_MEMBER'; end if;
  begin
    insert into public.organization_role_permissions(role_id,permission_code)
    values(v_member_role,'branches.read'),(v_member_role,'branches.select') on conflict do nothing;
    execute 'set local role service_role';
    v_company := public.create_native_company(v_admin,v_org,'adm011-'||v_hash,'ADM011 membership smoke '||v_hash,null,null,'VE','standard');
    v_company_id := v_company->>'id';
    v_branch_a := public.create_native_company_branch(v_admin,v_org,v_company_id,'adm011-a-'||v_hash,'A','Branch A');
    v_branch_b := public.create_native_company_branch(v_admin,v_org,v_company_id,'adm011-b-'||v_hash,'B','Branch B');

    begin
      perform public.set_native_company_branch_membership(v_member,v_org,v_company_id,
        (v_branch_b->>'id')::uuid,v_member,'active',0);
      raise exception 'SMOKE_UNAUTHORIZED_ASSIGNMENT_ACCEPTED';
    exception when others then if sqlerrm <> 'COMPANY_ACCESS_DENIED' then raise; end if; end;
    v_branches := public.list_native_company_branches(v_member,v_org,v_company_id);
    if jsonb_array_length(v_branches)<>0 then raise exception 'SMOKE_UNASSIGNED_BRANCHES_VISIBLE'; end if;
    begin
      perform public.select_native_company_branch(v_member,v_org,v_company_id,(v_branch_a->>'id')::uuid,0);
      raise exception 'SMOKE_UNASSIGNED_SELECTION_ACCEPTED';
    exception when others then if sqlerrm <> 'COMPANY_BRANCH_ASSIGNMENT_REQUIRED' then raise; end if; end;

    v_membership := public.set_native_company_branch_membership(v_admin,v_org,v_company_id,
      (v_branch_a->>'id')::uuid,v_member,'active',0);
    if v_membership->>'status'<>'active' or v_membership->>'version'<>'1' then raise exception 'SMOKE_ASSIGNMENT'; end if;
    v_branches := public.list_native_company_branches(v_member,v_org,v_company_id);
    if jsonb_array_length(v_branches)<>1 or v_branches->0->>'id' is distinct from v_branch_a->>'id' then
      raise exception 'SMOKE_BRANCH_SCOPE'; end if;
    v_selection := public.select_native_company_branch(v_member,v_org,v_company_id,(v_branch_a->>'id')::uuid,0);
    if v_selection->>'branch_id' is distinct from v_branch_a->>'id' or v_selection->>'version'<>'1' then
      raise exception 'SMOKE_ASSIGNED_SELECTION'; end if;

    v_membership := public.set_native_company_branch_membership(v_admin,v_org,v_company_id,
      (v_branch_a->>'id')::uuid,v_member,'revoked',1);
    if v_membership->>'status'<>'revoked' or v_membership->>'version'<>'2' then raise exception 'SMOKE_REVOCATION'; end if;
    v_selection := public.get_native_company_branch_selection(v_member,v_org,v_company_id);
    if v_selection->>'branch_id' is not null or v_selection->>'version'<>'2' then raise exception 'SMOKE_REVOKED_SELECTION_CLEAR'; end if;
    v_branches := public.list_native_company_branches(v_member,v_org,v_company_id);
    if jsonb_array_length(v_branches)<>0 then raise exception 'SMOKE_REVOKED_BRANCH_VISIBLE'; end if;
    begin
      perform public.set_native_company_branch_membership(v_admin,v_org,v_company_id,
        (v_branch_b->>'id')::uuid,v_member,'active',1);
      raise exception 'SMOKE_WRONG_VERSION_ACCEPTED';
    exception when others then if sqlerrm <> 'COMPANY_BRANCH_MEMBERSHIP_VERSION_CONFLICT' then raise; end if; end;
    execute 'reset role';

    if (select count(*) from public.shared_company_branch_membership_events where tenant_id=v_tenant and company_id=v_company_id)<>2
      then raise exception 'SMOKE_MEMBERSHIP_AUDIT'; end if;
    if (select count(*) from public.shared_company_branch_selection_events where tenant_id=v_tenant and company_id=v_company_id)<>2
      then raise exception 'SMOKE_SELECTION_AUDIT'; end if;
    if has_table_privilege('anon','public.shared_company_branch_memberships','select')
      or has_table_privilege('authenticated','public.shared_company_branch_membership_events','insert') then raise exception 'SMOKE_DIRECT_TABLE_ACCESS'; end if;
    if has_function_privilege('anon','public.set_native_company_branch_membership(uuid,uuid,text,uuid,uuid,text,integer)','execute')
      or has_function_privilege('authenticated','public.list_native_company_branch_memberships(uuid,uuid,text)','execute') then raise exception 'SMOKE_CLIENT_RPC_ACCESS'; end if;
    raise exception 'ADM011_SMOKE_ROLLBACK';
  exception when others then
    if sqlerrm='ADM011_SMOKE_ROLLBACK' then null; else raise; end if;
  end;
  if exists(select 1 from public.shared_company_branch_memberships where tenant_id=v_tenant and company_id=v_company_id)
    or exists(select 1 from public.shared_company_branch_membership_events where tenant_id=v_tenant and company_id=v_company_id)
    or exists(select 1 from public.shared_user_company_branch_selections where tenant_id=v_tenant and company_id=v_company_id)
    or exists(select 1 from public.shared_company_branch_selection_events where tenant_id=v_tenant and company_id=v_company_id)
    or exists(select 1 from public.shared_company_branches where tenant_id=v_tenant and company_id=v_company_id)
    or exists(select 1 from public.shared_companies where tenant_id=v_tenant and id=v_company_id)
    then raise exception 'SMOKE_FIXTURE_REMAINS'; end if;
end
$smoke$;
