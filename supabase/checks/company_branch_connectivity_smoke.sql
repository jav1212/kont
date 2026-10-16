-- ADM-013: branch-level online presence, authorized heartbeat and stale expiry.
do $smoke$
declare
  v_admin uuid;
  v_member uuid;
  v_org uuid;
  v_tenant uuid;
  v_member_role uuid;
  v_company jsonb;
  v_company_id text;
  v_branch_a jsonb;
  v_branch_b jsonb;
  v_branch_a_id uuid;
  v_branch_b_id uuid;
  v_client uuid := gen_random_uuid();
  v_hash text := gen_random_uuid()::text;
  v_heartbeat jsonb;
  v_statuses jsonb;
  v_a jsonb;
  v_b jsonb;
begin
  select o.id,admin.user_id,member.user_id,o.legacy_tenant_id,member.role_id
    into v_org,v_admin,v_member,v_tenant,v_member_role
  from public.organizations o
  join public.organization_memberships admin on admin.organization_id=o.id and admin.status='active'
  join public.organization_roles ar on ar.id=admin.role_id and ar.organization_id=o.id and ar.status='active'
  join public.organization_role_permissions arp on arp.role_id=ar.id and arp.permission_code='companies.create'
  join public.organization_memberships member on member.organization_id=o.id and member.status='active' and member.user_id<>admin.user_id
  join public.organization_roles mr on mr.id=member.role_id and mr.organization_id=o.id and mr.status='active'
  where o.status='active' and o.legacy_tenant_id is not null and ar.code in ('owner','admin') and mr.code not in ('owner','admin')
    and exists(select 1 from public.organization_role_permissions x where x.role_id=ar.id and x.permission_code='branches.create')
    and exists(select 1 from public.organization_role_permissions x where x.role_id=ar.id and x.permission_code='branches.assign_users')
    and not exists(select 1 from public.organization_role_permissions x where x.role_id=mr.id and x.permission_code='branches.select_any')
  order by o.id,admin.user_id,member.user_id limit 1;
  if not found then raise exception 'SMOKE_NO_ADMIN_AND_BRANCH_MEMBER'; end if;

  begin
    insert into public.organization_role_permissions(role_id,permission_code)
      values(v_member_role,'branches.read'),(v_member_role,'branches.select'),(v_member_role,'branches.connect') on conflict do nothing;
    execute 'set local role service_role';
    v_company := public.create_native_company(v_admin,v_org,'adm013-'||v_hash,'ADM013 online branches '||v_hash,null,null,'VE','standard');
    v_company_id := v_company->>'id';
    v_branch_a := public.create_native_company_branch(v_admin,v_org,v_company_id,'adm013-a-'||v_hash,'A','Branch A');
    v_branch_b := public.create_native_company_branch(v_admin,v_org,v_company_id,'adm013-b-'||v_hash,'B','Branch B');
    v_branch_a_id := (v_branch_a->>'id')::uuid;
    v_branch_b_id := (v_branch_b->>'id')::uuid;
    perform public.set_native_company_branch_membership(v_admin,v_org,v_company_id,v_branch_a_id,v_member,'active',0);

    v_heartbeat := public.record_native_company_branch_heartbeat(v_member,v_org,v_company_id,v_branch_a_id,v_client);
    if v_heartbeat->>'branchId'<>v_branch_a_id::text or v_heartbeat->>'clientInstanceId'<>v_client::text
      or not (v_heartbeat ? 'lastSeenAt') then raise exception 'SMOKE_HEARTBEAT_ACK'; end if;
    perform public.record_native_company_branch_heartbeat(v_member,v_org,v_company_id,v_branch_a_id,v_client);
    reset role;
    if (select count(*) from public.shared_company_branch_presence where tenant_id=v_tenant and branch_id=v_branch_a_id and user_id=v_member and client_instance_id=v_client)<>1
      then raise exception 'SMOKE_HEARTBEAT_NOT_IDEMPOTENT'; end if;

    v_statuses := public.get_native_company_branch_connectivity(v_admin,v_org,v_company_id);
    select value into v_a from jsonb_array_elements(v_statuses) where value->>'branchId'=v_branch_a_id::text;
    select value into v_b from jsonb_array_elements(v_statuses) where value->>'branchId'=v_branch_b_id::text;
    if v_a->>'online'<>'true' or v_a->>'connectedClientCount'<>'1' or v_a->>'lastSeenAt' is null
      or v_b->>'online'<>'false' or v_b->>'connectedClientCount'<>'0' then raise exception 'SMOKE_ADMIN_BRANCH_STATUS'; end if;

    v_statuses := public.get_native_company_branch_connectivity(v_member,v_org,v_company_id);
    if jsonb_array_length(v_statuses)<>1 or v_statuses->0->>'branchId'<>v_branch_a_id::text
      then raise exception 'SMOKE_MEMBER_BRANCH_FILTER'; end if;
    begin
      perform public.record_native_company_branch_heartbeat(v_member,v_org,v_company_id,v_branch_b_id,gen_random_uuid());
      raise exception 'SMOKE_UNASSIGNED_BRANCH_HEARTBEAT_ACCEPTED';
    exception when others then if sqlerrm<>'COMPANY_BRANCH_CONNECTIVITY_ACCESS_DENIED' then raise; end if; end;

    update public.shared_company_branch_presence set last_seen_at=clock_timestamp()-interval '91 seconds'
    where tenant_id=v_tenant and branch_id=v_branch_a_id and user_id=v_member and client_instance_id=v_client;
    v_statuses := public.get_native_company_branch_connectivity(v_admin,v_org,v_company_id);
    select value into v_a from jsonb_array_elements(v_statuses) where value->>'branchId'=v_branch_a_id::text;
    if v_a->>'online'<>'false' or v_a->>'connectedClientCount'<>'0' or v_a->>'lastSeenAt' is null
      then raise exception 'SMOKE_STALE_BRANCH_HEARTBEAT'; end if;

    if has_table_privilege('anon','public.shared_company_branch_presence','select')
      or has_table_privilege('authenticated','public.shared_company_branch_presence','insert')
      or has_function_privilege('anon','public.record_native_company_branch_heartbeat(uuid,uuid,text,uuid,uuid)','execute')
      or has_function_privilege('authenticated','public.get_native_company_branch_connectivity(uuid,uuid,text)','execute')
      or not has_function_privilege('service_role','public.record_native_company_branch_heartbeat(uuid,uuid,text,uuid,uuid)','execute')
      then raise exception 'SMOKE_BRANCH_CONNECTIVITY_ACL'; end if;
    raise exception 'ADM013_SMOKE_ROLLBACK';
  exception when others then
    if sqlerrm='ADM013_SMOKE_ROLLBACK' then null; else raise; end if;
  end;
  if exists(select 1 from public.shared_company_branch_presence where tenant_id=v_tenant and company_id=v_company_id)
    or exists(select 1 from public.shared_company_branches where tenant_id=v_tenant and company_id=v_company_id)
    or exists(select 1 from public.shared_companies where tenant_id=v_tenant and id=v_company_id)
    then raise exception 'SMOKE_CONNECTIVITY_FIXTURE_REMAINS'; end if;
end
$smoke$;
