-- ADM-009 smoke: all selections and disposable company/branch fixtures roll back.
do $smoke$
declare
  v_actor uuid;
  v_org uuid;
  v_tenant uuid;
  v_company_a jsonb;
  v_company_b jsonb;
  v_branch_a jsonb;
  v_branch_a2 jsonb;
  v_branch_b jsonb;
  v_selection jsonb;
  v_hash text := gen_random_uuid()::text;
  v_company_a_id text;
  v_company_b_id text;
  v_count integer;
begin
  select o.id,m.user_id,o.legacy_tenant_id into v_org,v_actor,v_tenant
  from public.organizations o join public.organization_memberships m on m.organization_id=o.id and m.status='active'
  join public.organization_roles r on r.id=m.role_id and r.organization_id=o.id and r.status='active'
  where o.status='active' and o.legacy_tenant_id is not null
    and exists(select 1 from public.organization_role_permissions rp where rp.role_id=r.id and rp.permission_code='companies.create')
    and exists(select 1 from public.organization_role_permissions rp where rp.role_id=r.id and rp.permission_code='branches.create')
    and exists(select 1 from public.organization_role_permissions rp where rp.role_id=r.id and rp.permission_code='branches.read')
    and exists(select 1 from public.organization_role_permissions rp where rp.role_id=r.id and rp.permission_code='branches.select')
  order by o.id,m.user_id limit 1;
  if not found then raise exception 'SMOKE_NO_BRANCH_SELECTOR'; end if;
  begin
    execute 'set local role service_role';
    v_company_a := public.create_native_company(v_actor,v_org,'adm009-a-'||v_hash,'ADM009 branch selection A '||v_hash,null,null,'VE','standard');
    v_company_a_id := v_company_a->>'id';
    v_company_b := public.create_native_company(v_actor,v_org,'adm009-b-'||v_hash,'ADM009 branch selection B '||v_hash,null,null,'VE','standard');
    v_company_b_id := v_company_b->>'id';
    v_branch_a := public.create_native_company_branch(v_actor,v_org,v_company_a_id,'adm009-a-'||v_hash,'HQ','Headquarters');
    v_branch_a2 := public.create_native_company_branch(v_actor,v_org,v_company_a_id,'adm009-a2-'||v_hash,'ANNEX','Annex');
    v_branch_b := public.create_native_company_branch(v_actor,v_org,v_company_b_id,'adm009-b-'||v_hash,'OTHER','Other company');

    v_selection := public.get_native_company_branch_selection(v_actor,v_org,v_company_a_id);
    if v_selection->>'branch_id' is not null or v_selection->>'version'<>'0' then raise exception 'SMOKE_EMPTY_SELECTION'; end if;
    v_selection := public.select_native_company_branch(v_actor,v_org,v_company_a_id,(v_branch_a->>'id')::uuid,0);
    if v_selection->>'branch_id' is distinct from v_branch_a->>'id' or v_selection->>'version'<>'1' then raise exception 'SMOKE_FIRST_SELECTION'; end if;
    v_selection := public.get_native_company_branch_selection(v_actor,v_org,v_company_a_id);
    if v_selection->>'branch_id' is distinct from v_branch_a->>'id' or v_selection->>'version'<>'1' then raise exception 'SMOKE_SELECTION_READBACK'; end if;

    begin
      perform public.select_native_company_branch(v_actor,v_org,v_company_a_id,null,0);
      raise exception 'SMOKE_STALE_VERSION_NOT_REJECTED';
    exception when others then if sqlerrm <> 'COMPANY_BRANCH_SELECTION_VERSION_CONFLICT' then raise; end if; end;
    begin
      perform public.select_native_company_branch(v_actor,v_org,v_company_a_id,(v_branch_b->>'id')::uuid,1);
      raise exception 'SMOKE_CROSS_COMPANY_BRANCH_NOT_REJECTED';
    exception when others then if sqlerrm <> 'COMPANY_BRANCH_NOT_FOUND' then raise; end if; end;

    v_selection := public.select_native_company_branch(v_actor,v_org,v_company_a_id,(v_branch_a2->>'id')::uuid,1);
    if v_selection->>'branch_id' is distinct from v_branch_a2->>'id' or v_selection->>'version'<>'2' then raise exception 'SMOKE_BRANCH_SWITCH'; end if;
    v_selection := public.select_native_company_branch(v_actor,v_org,v_company_a_id,null,2);
    if v_selection->>'branch_id' is not null or v_selection->>'version'<>'3' then raise exception 'SMOKE_CLEAR'; end if;
    v_selection := public.select_native_company_branch(v_actor,v_org,v_company_a_id,null,3);
    if v_selection->>'version'<>'3' then raise exception 'SMOKE_CLEAR_IDEMPOTENT_NOOP'; end if;
    execute 'reset role';

    select count(*) into v_count from public.shared_company_branch_selection_events
      where user_id=v_actor and organization_id=v_org and company_id=v_company_a_id;
    if v_count<>3 then raise exception 'SMOKE_SELECTION_AUDIT'; end if;
    if has_table_privilege('anon','public.shared_user_company_branch_selections','select')
      or has_table_privilege('authenticated','public.shared_user_company_branch_selections','insert') then raise exception 'SMOKE_DIRECT_TABLE_ACCESS'; end if;
    if has_function_privilege('anon','public.select_native_company_branch(uuid,uuid,text,uuid,integer)','execute')
      or has_function_privilege('authenticated','public.get_native_company_branch_selection(uuid,uuid,text)','execute') then raise exception 'SMOKE_CLIENT_RPC_ACCESS'; end if;
    raise exception 'ADM009_SMOKE_ROLLBACK';
  exception when others then
    if sqlerrm='ADM009_SMOKE_ROLLBACK' then null; else raise; end if;
  end;
  if exists(select 1 from public.shared_user_company_branch_selections where tenant_id=v_tenant and user_id=v_actor and company_id=v_company_a_id)
    or exists(select 1 from public.shared_company_branch_selection_events where tenant_id=v_tenant and user_id=v_actor and company_id=v_company_a_id)
    or exists(select 1 from public.shared_companies where tenant_id=v_tenant and id in (v_company_a_id,v_company_b_id)) then
    raise exception 'SMOKE_FIXTURE_REMAINS';
  end if;
end
$smoke$;
