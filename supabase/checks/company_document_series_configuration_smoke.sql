-- Reversible ADM-017/018/019 configuration-only RPC smoke. Run only in development.
begin;
set local role service_role;

do $smoke$
declare fixture record; v_key text := replace(gen_random_uuid()::text,'-','');
  v_created jsonb; v_replay jsonb; v_rule jsonb; v_list jsonb; v_series_id uuid;
  v_other jsonb; v_branch record; v_branch_series jsonb;
begin
  select c.organization_id,c.id as company_id,m.user_id as actor_user_id into fixture
  from public.shared_companies c
  join public.organization_memberships m on m.organization_id=c.organization_id and m.status='active'
  join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.status='active'
  join public.organization_role_permissions readp on readp.role_id=r.id and readp.permission_code='companies.read'
  join public.organization_role_permissions updatep on updatep.role_id=r.id and updatep.permission_code='companies.update'
  join public.organization_role_permissions branchcreatep on branchcreatep.role_id=r.id and branchcreatep.permission_code='branches.create'
  where c.organization_id is not null and c.status='active'
  limit 1;
  if not found then raise exception 'SMOKE_NO_AUTHORIZED_FIXTURE'; end if;

  v_created := public.create_native_company_document_series(fixture.actor_user_id,fixture.organization_id,fixture.company_id,
    'adm017-create-'||v_key,'company',null,'sales_invoice','ADM017'||left(v_key,8),'FAC-',1,1000);
  v_series_id := (v_created->>'id')::uuid;
  if v_created->'scope'->>'kind' <> 'company' or v_created->>'documentType' <> 'sales_invoice'
    or v_created->>'nextNumber' <> '1' then raise exception 'SMOKE_CREATE_FAILED'; end if;
  v_replay := public.create_native_company_document_series(fixture.actor_user_id,fixture.organization_id,fixture.company_id,
    'adm017-create-'||v_key,'company',null,'sales_invoice','ADM017'||left(v_key,8),'FAC-',1,1000);
  if v_created is distinct from v_replay then raise exception 'SMOKE_CREATE_REPLAY_FAILED'; end if;
  v_list := public.list_native_company_document_series(fixture.actor_user_id,fixture.organization_id,fixture.company_id,'company',null,'sales_invoice');
  if not exists(select 1 from jsonb_array_elements(v_list) x where x->>'id'=v_series_id::text) then raise exception 'SMOKE_LIST_FAILED'; end if;
  v_rule := public.configure_native_company_document_series_selection_rule(fixture.actor_user_id,fixture.organization_id,fixture.company_id,
    'adm019-rule-'||v_key,'company',null,'sales_invoice',0,'company_default',v_series_id);
  if v_rule->>'version' <> '1' or v_rule->>'defaultSeriesId' <> v_series_id::text then raise exception 'SMOKE_RULE_FAILED'; end if;
  if public.configure_native_company_document_series_selection_rule(fixture.actor_user_id,fixture.organization_id,fixture.company_id,
    'adm019-rule-'||v_key,'company',null,'sales_invoice',0,'company_default',v_series_id) is distinct from v_rule then raise exception 'SMOKE_RULE_REPLAY_FAILED'; end if;
  v_other := public.create_native_company_document_series(fixture.actor_user_id,fixture.organization_id,fixture.company_id,
    'adm018-other-'||v_key,'company',null,'sales_delivery_note','ADM018'||left(v_key,8),null,1,1000);
  begin
    perform public.configure_native_company_document_series_selection_rule(fixture.actor_user_id,fixture.organization_id,fixture.company_id,
      'adm019-wrong-type-'||v_key,'company',null,'sales_invoice',1,'company_default',(v_other->>'id')::uuid);
    raise exception 'SMOKE_EXPECTED_DEFAULT_TYPE_DENIAL';
  exception when raise_exception then if sqlerrm <> 'COMPANY_DOCUMENT_SERIES_NOT_FOUND' then raise; end if; end;
  begin
    perform public.configure_native_company_document_series_selection_rule(fixture.actor_user_id,fixture.organization_id,fixture.company_id,
      'adm019-stale-'||v_key,'company',null,'sales_invoice',0,'company_default',v_series_id);
    raise exception 'SMOKE_EXPECTED_VERSION_CONFLICT';
  exception when raise_exception then if sqlerrm <> 'COMPANY_DOCUMENT_SERIES_VERSION_CONFLICT' then raise; end if; end;
  begin
    perform public.create_native_company_document_series(fixture.actor_user_id,fixture.organization_id,fixture.company_id,
      'adm017-create-'||v_key,'company',null,'sales_invoice','OTHER'||left(v_key,8),null,1,1000);
    raise exception 'SMOKE_EXPECTED_IDEMPOTENCY_CONFLICT';
  exception when raise_exception then if sqlerrm <> 'COMPANY_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT' then raise; end if; end;
  begin
    perform public.create_native_company_document_series(gen_random_uuid(),fixture.organization_id,fixture.company_id,
      'adm017-denied-'||v_key,'company',null,'sales_invoice','DENY'||left(v_key,8),null,1,1000);
    raise exception 'SMOKE_EXPECTED_ACCESS_DENIED';
  exception when raise_exception then if sqlerrm not in ('ORGANIZATIONAL_USER_ACCESS_DENIED','COMPANY_ACCESS_DENIED') then raise; end if; end;
  select * into v_branch from jsonb_to_record(public.create_native_company_branch(fixture.actor_user_id,fixture.organization_id,fixture.company_id,
    'adm018-branch-fixture-'||v_key,'ADM'||left(v_key,8),'ADM 018 branch fixture')) as b(id uuid);
  if v_branch.id is null then raise exception 'SMOKE_BRANCH_CREATE_FAILED'; end if;
  v_branch_series := public.create_native_company_document_series(fixture.actor_user_id,fixture.organization_id,fixture.company_id,
    'adm018-branch-'||v_key,'branch',v_branch.id,'sales_invoice','BR'||left(v_key,8),null,1,1000);
  if v_branch_series->'scope'->>'branchId' <> v_branch.id::text then raise exception 'SMOKE_BRANCH_CREATE_FAILED'; end if;
  begin
    perform public.configure_native_company_document_series_selection_rule(fixture.actor_user_id,fixture.organization_id,fixture.company_id,
      'adm019-branch-wrong-default-'||v_key,'branch',v_branch.id,'sales_invoice',0,'branch_default',v_series_id);
    raise exception 'SMOKE_EXPECTED_DEFAULT_SCOPE_DENIAL';
  exception when raise_exception then if sqlerrm <> 'COMPANY_DOCUMENT_SERIES_NOT_FOUND' then raise; end if; end;
  v_rule := public.configure_native_company_document_series_selection_rule(fixture.actor_user_id,fixture.organization_id,fixture.company_id,
    'adm019-branch-rule-'||v_key,'branch',v_branch.id,'sales_invoice',0,'branch_default',(v_branch_series->>'id')::uuid);
  if v_rule->>'defaultSeriesId' <> v_branch_series->>'id' then raise exception 'SMOKE_BRANCH_RULE_FAILED'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('allocate_native_company_document_series','allocate_native_company_document_number')) then
    raise exception 'SMOKE_ALLOCATION_RPC_MUST_NOT_EXIST';
  end if;
  perform set_config('kontave.adm017_request_key','adm017-create-'||v_key,true);
end
$smoke$;

reset role;

do $audit$
begin
  begin
    update public.shared_company_document_series_events set action='created' where request_id in (
      select id from public.shared_company_document_series_requests
      where idempotency_key=current_setting('kontave.adm017_request_key'));
    raise exception 'SMOKE_EXPECTED_EVENT_IMMUTABLE';
  exception when raise_exception then if sqlerrm <> 'COMPANY_DOCUMENT_SERIES_EVENT_IMMUTABLE' then raise; end if; end;
end
$audit$;

rollback;
