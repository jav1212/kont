-- ADM-008 smoke: branch changes are isolated to a disposable company fixture.
do $smoke$
declare
  v_actor uuid;
  v_org uuid;
  v_tenant uuid;
  v_company jsonb;
  v_branch jsonb;
  v_replay jsonb;
  v_hash text := gen_random_uuid()::text;
  v_company_id text;
  v_count integer;
begin
  select o.id,m.user_id,o.legacy_tenant_id into v_org,v_actor,v_tenant
  from public.organizations o join public.organization_memberships m on m.organization_id=o.id and m.status='active'
  join public.organization_roles r on r.id=m.role_id and r.organization_id=o.id and r.status='active'
  where o.status='active' and o.legacy_tenant_id is not null
    and exists(select 1 from public.organization_role_permissions rp where rp.role_id=r.id and rp.permission_code='companies.create')
    and exists(select 1 from public.organization_role_permissions rp where rp.role_id=r.id and rp.permission_code='branches.create')
    and exists(select 1 from public.organization_role_permissions rp where rp.role_id=r.id and rp.permission_code='branches.read')
  order by o.id,m.user_id limit 1;
  if not found then raise exception 'SMOKE_NO_BRANCH_ADMIN'; end if;
  begin
    execute 'set local role service_role';
    v_company := public.create_native_company(v_actor,v_org,'adm008-'||v_hash,'ADM008 rollback fixture '||v_hash,null,null,'VE','standard');
    v_company_id := v_company->>'id';
    v_branch := public.create_native_company_branch(v_actor,v_org,v_company_id,'adm008-branch-'||v_hash,'hq','Main Office');
    if v_branch->>'code'<>'HQ' or v_branch->>'name'<>'Main Office' then raise exception 'SMOKE_BRANCH_CREATE'; end if;
    v_replay := public.create_native_company_branch(v_actor,v_org,v_company_id,'adm008-branch-'||v_hash,'HQ','Main Office');
    if v_replay is distinct from v_branch then raise exception 'SMOKE_IDEMPOTENCY'; end if;
    begin
      perform public.create_native_company_branch(v_actor,v_org,v_company_id,'adm008-conflict-'||v_hash,'hq','Another office');
      raise exception 'SMOKE_DUPLICATE_CODE_NOT_REJECTED';
    exception when others then if sqlerrm <> 'COMPANY_BRANCH_ALREADY_EXISTS' then raise; end if; end;
    begin
      perform public.create_native_company_branch(v_actor,v_org,v_company_id,'adm008-branch-'||v_hash,'HQ','Different intent');
      raise exception 'SMOKE_REUSED_KEY_NOT_REJECTED';
    exception when others then if sqlerrm <> 'COMPANY_BRANCH_IDEMPOTENCY_CONFLICT' then raise; end if; end;
    if jsonb_array_length(public.list_native_company_branches(v_actor,v_org,v_company_id))<>1 then raise exception 'SMOKE_LIST'; end if;
    execute 'reset role';
    if not exists(select 1 from public.shared_company_branch_events e where e.branch_id=(v_branch->>'id')::uuid and e.actor_user_id=v_actor and e.action='created') then raise exception 'SMOKE_EVENT'; end if;
    if has_table_privilege('authenticated','public.shared_company_branches','select') or has_table_privilege('anon','public.shared_company_branches','insert') then raise exception 'SMOKE_DIRECT_TABLE_ACCESS'; end if;
    if has_function_privilege('authenticated','public.create_native_company_branch(uuid,uuid,text,text,text,text)','execute') then raise exception 'SMOKE_CLIENT_RPC_ACCESS'; end if;
    raise exception 'ADM008_SMOKE_ROLLBACK';
  exception when others then
    if sqlerrm='ADM008_SMOKE_ROLLBACK' then null; else raise; end if;
  end;
  if exists(select 1 from public.shared_company_branches where tenant_id=v_tenant and company_id=v_company_id)
    or exists(select 1 from public.shared_companies where tenant_id=v_tenant and id=v_company_id and name='ADM008 rollback fixture '||v_hash) then
    raise exception 'SMOKE_FIXTURE_REMAINS';
  end if;
end
$smoke$;
