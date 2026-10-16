-- ADM-023 runtime smoke test. All mutations are rolled back by the deliberate
-- sentinel exception; no company or preference remains after this script.
do $smoke$
declare
    v_org uuid;
    v_actor uuid;
    v_tenant uuid;
    v_company_id text;
    v_created jsonb;
    v_first jsonb;
    v_second jsonb;
    v_replay jsonb;
    v_hash text := gen_random_uuid()::text;
    v_name text;
    v_version integer;
    v_current jsonb;
    v_historical jsonb;
    v_direct_read boolean;
    v_direct_write boolean;
begin
    begin
        select o.id, m.user_id, o.legacy_tenant_id
        into v_org, v_actor, v_tenant
        from public.organizations o
        join public.organization_memberships m on m.organization_id = o.id and m.status = 'active'
        join public.organization_roles r on r.id = m.role_id and r.organization_id = o.id and r.status = 'active'
        join public.organization_role_permissions rp on rp.role_id = r.id
            and rp.permission_code in ('companies.create', 'companies.read', 'companies.update')
        where o.status = 'active' and o.legacy_tenant_id is not null
        group by o.id, m.user_id, o.legacy_tenant_id
        having count(distinct rp.permission_code) = 3
        order by o.id, m.user_id limit 1;
        if not found then raise exception 'SMOKE_NO_AUTHORIZED_ACTOR'; end if;

        v_name := 'ADM023 rollback smoke ' || v_hash;
        v_created := public.create_native_company(
            v_actor, v_org, 'adm023-smoke-' || v_hash,
            v_name, null, null, 'VE', 'standard');
        v_company_id := v_created->>'id';
        if v_company_id is null or v_created->>'status' <> 'active' then
            raise exception 'SMOKE_COMPANY_CREATE_FAILED';
        end if;
        if public.get_native_company_date_format(v_actor, v_org, v_company_id, null) is not null then
            raise exception 'SMOKE_UNCONFIGURED_FORMAT_NOT_NULL';
        end if;

        v_first := public.configure_native_company_date_format(
            v_actor, v_org, v_company_id, 0, 'adm023-first-' || v_hash,
            'Initial smoke configuration', 'day_first');
        if (v_first->>'format_version')::integer <> 1 or v_first->>'date_order' <> 'day_first' then
            raise exception 'SMOKE_INITIAL_CONFIGURATION_FAILED';
        end if;
        v_replay := public.configure_native_company_date_format(
            v_actor, v_org, v_company_id, 0, 'adm023-first-' || v_hash,
            'Initial smoke configuration', 'day_first');
        if v_replay is distinct from v_first then raise exception 'SMOKE_IDEMPOTENT_REPLAY_FAILED'; end if;

        v_second := public.configure_native_company_date_format(
            v_actor, v_org, v_company_id, 1, 'adm023-second-' || v_hash,
            'Change display convention', 'year_first');
        if (v_second->>'format_version')::integer <> 2 or v_second->>'date_order' <> 'year_first' then
            raise exception 'SMOKE_REVISION_TWO_FAILED';
        end if;
        v_current := public.get_native_company_date_format(v_actor, v_org, v_company_id, null);
        v_historical := public.get_native_company_date_format(v_actor, v_org, v_company_id, 1);
        if (v_current->>'format_version')::integer <> 2 or v_current->>'date_order' <> 'year_first'
            or v_historical->>'date_order' <> 'day_first' then
            raise exception 'SMOKE_HISTORY_READ_FAILED';
        end if;

        -- A stale expected version, a reused key with changed intent, an
        -- unsupported convention, a missing historical version, and a caller
        -- without read permission all fail with stable expected errors.
        begin
            perform public.configure_native_company_date_format(
                v_actor, v_org, v_company_id, 1, 'adm023-stale-' || v_hash,
                'Stale write attempt', 'month_first');
            raise exception 'SMOKE_EXPECTED_VERSION_CONFLICT_NOT_RAISED';
        exception when others then
            if sqlerrm <> 'COMPANY_DATE_FORMAT_VERSION_CONFLICT' then raise; end if;
        end;
        begin
            perform public.configure_native_company_date_format(
                v_actor, v_org, v_company_id, 0, 'adm023-first-' || v_hash,
                'Changed intent', 'day_first');
            raise exception 'SMOKE_EXPECTED_IDEMPOTENCY_CONFLICT_NOT_RAISED';
        exception when others then
            if sqlerrm <> 'COMPANY_DATE_FORMAT_IDEMPOTENCY_CONFLICT' then raise; end if;
        end;
        begin
            perform public.configure_native_company_date_format(
                v_actor, v_org, v_company_id, 2, 'adm023-invalid-' || v_hash,
                'Invalid convention', 'ambiguous');
            raise exception 'SMOKE_EXPECTED_INVALID_FORMAT_NOT_RAISED';
        exception when others then
            if sqlerrm <> 'COMPANY_DATE_FORMAT_INVALID' then raise; end if;
        end;
        begin
            perform public.get_native_company_date_format(v_actor, v_org, v_company_id, 999);
            raise exception 'SMOKE_EXPECTED_MISSING_REVISION_NOT_RAISED';
        exception when others then
            if sqlerrm <> 'COMPANY_DATE_FORMAT_REVISION_NOT_FOUND' then raise; end if;
        end;
        begin
            perform public.get_native_company_date_format(gen_random_uuid(), v_org, v_company_id, null);
            raise exception 'SMOKE_EXPECTED_ACCESS_DENIED_NOT_RAISED';
        exception when others then
            if sqlerrm <> 'COMPANY_ACCESS_DENIED' then raise; end if;
        end;

        -- Configuration is independent of the legacy company's concurrency token.
        select version into v_version from public.shared_companies
        where organization_id = v_org and tenant_id = v_tenant and id = v_company_id;
        if v_version <> (v_created->>'version')::integer then raise exception 'SMOKE_COMPANY_VERSION_CHANGED'; end if;

        -- Both current and historical preference reads remain available while
        -- the company is suspended, while new configuration is rejected.
        perform public.set_native_company_status(v_actor, v_org, v_company_id, v_version, 'suspended');
        if public.get_native_company_date_format(v_actor, v_org, v_company_id, 1)->>'date_order' <> 'day_first' then
            raise exception 'SMOKE_SUSPENDED_HISTORICAL_READ_FAILED';
        end if;
        begin
            perform public.configure_native_company_date_format(
                v_actor, v_org, v_company_id, 2, 'adm023-suspended-' || v_hash,
                'Suspended company write', 'month_first');
            raise exception 'SMOKE_EXPECTED_SUSPENDED_WRITE_NOT_RAISED';
        exception when others then
            if sqlerrm <> 'COMPANY_TRANSITION_INVALID' then raise; end if;
        end;

        select has_table_privilege('anon', 'public.shared_company_date_formats', 'SELECT'),
               has_table_privilege('authenticated', 'public.shared_company_date_formats', 'INSERT')
        into v_direct_read, v_direct_write;
        if v_direct_read or v_direct_write then raise exception 'SMOKE_TABLE_PRIVILEGE_LEAK'; end if;
        if not (select relrowsecurity from pg_class where oid='public.shared_company_date_formats'::regclass)
            or not (select relrowsecurity from pg_class where oid='public.shared_company_date_format_revisions'::regclass)
            or not (select relrowsecurity from pg_class where oid='public.shared_company_date_format_idempotency'::regclass)
            or not (select relrowsecurity from pg_class where oid='public.shared_company_date_format_events'::regclass)
        then raise exception 'SMOKE_RLS_MISSING'; end if;
        if has_function_privilege('authenticated',
            'public.configure_native_company_date_format(uuid,uuid,text,integer,text,text,text)', 'EXECUTE')
        then raise exception 'SMOKE_RPC_PRIVILEGE_LEAK'; end if;

        raise exception using errcode = 'ZX001', message = 'ADM023_SMOKE_ROLLBACK';
    exception when sqlstate 'ZX001' then
        null; -- Roll back every test fixture and write above.
    end;

    if exists (select 1 from public.shared_companies where name = v_name)
        or exists (select 1 from public.shared_company_date_formats where company_id = v_company_id)
        or exists (select 1 from public.shared_company_date_format_revisions where company_id = v_company_id)
        or exists (select 1 from public.shared_company_date_format_idempotency where company_id = v_company_id)
        or exists (select 1 from public.shared_company_date_format_events where company_id = v_company_id)
    then raise exception 'SMOKE_ROLLBACK_LEFT_FIXTURE'; end if;
    raise notice 'ADM023 smoke passed; test company and all date-format evidence rolled back';
end;
$smoke$;
