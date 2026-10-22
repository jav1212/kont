-- Mutating smoke for the explicitly authorized development environment.
-- All fixtures and the temporary permission revocation are inside the ZT001
-- subtransaction, so the database retains no company, policy, event, receipt,
-- or authorization change after a successful run.
do $smoke$
#variable_conflict use_variable
declare
    scope record;
    other_scope record;
    company jsonb;
    policy jsonb;
    replay jsonb;
    numbering jsonb;
    company_id text;
    label text;
    candidate record;
    policy_input jsonb := '{"operatingCurrency":{"code":"VES","minorUnit":2},"referenceCurrencyCodes":["USD"],"rateSource":"bcv","roundingProfile":"commercial_v1","allowPreviousAvailableDate":false,"maxPreviousDays":0}'::jsonb;
    key text := 'mcp-company-monetary-smoke-' || gen_random_uuid()::text;
    passed text[] := array[]::text[];
begin
    select o.id as organization_id, o.legacy_tenant_id as tenant_id,
        m.user_id as actor, r.id as role_id
    into strict scope
    from public.organizations o
    join public.organization_memberships m on m.organization_id = o.id
    join public.organization_roles r on r.id = m.role_id and r.organization_id = o.id
    where o.status = 'active' and m.status = 'active' and r.status = 'active'
        and o.legacy_tenant_id is not null
        and exists (select 1 from public.organization_role_permissions
            where role_id = r.id and permission_code = 'companies.create')
        and exists (select 1 from public.organization_role_permissions
            where role_id = r.id and permission_code = 'companies.read')
        and exists (select 1 from public.organization_role_permissions
            where role_id = r.id and permission_code = 'companies.update')
    order by o.id limit 1;
    select o.id as organization_id, m.user_id as actor
    into strict other_scope
    from public.organizations o
    join public.organization_memberships m on m.organization_id = o.id
    join public.organization_roles r on r.id = m.role_id and r.organization_id = o.id
    where o.id <> scope.organization_id and o.status = 'active' and m.status = 'active'
        and r.status = 'active' and o.legacy_tenant_id is not null
        and exists (select 1 from public.organization_role_permissions
            where role_id = r.id and permission_code = 'companies.read')
        and exists (select 1 from public.organization_role_permissions
            where role_id = r.id and permission_code = 'companies.update')
    order by o.id limit 1;

    begin
        execute 'set local role service_role';
        company := public.create_native_company(scope.actor, scope.organization_id,
            key, 'MCP monetary disposable company', null, null, 'VE', 'standard');
        company_id := company->>'id';
        passed := array_append(passed, 'fixture_company_created');

        if public.get_native_company_monetary_policy(
            scope.actor, scope.organization_id, company_id, null) is not null
        then raise exception 'ASSERT_UNCONFIGURED_NULL'; end if;
        passed := array_append(passed, 'unconfigured_explicit_null');

        for candidate in select * from (values
            ('sql_null', null::jsonb),
            ('scalar', '"scalar"'::jsonb),
            ('empty_references', jsonb_set(policy_input, '{referenceCurrencyCodes}', '[]'::jsonb)),
            ('missing_rate_source', policy_input - 'rateSource'),
            ('unsupported_reference', jsonb_set(policy_input, '{referenceCurrencyCodes}', '["ABC"]'::jsonb)),
            ('null_rate_source', jsonb_set(policy_input, '{rateSource}', 'null'::jsonb))
        ) invalid_inputs(suffix, payload) loop
            begin
                perform public.configure_native_company_monetary_policy(scope.actor,
                    scope.organization_id, company_id, 0, key || '-invalid-' || candidate.suffix,
                    'Reject invalid policy', candidate.payload);
                raise exception 'EXPECTED_INVALID_POLICY_%', candidate.suffix;
            exception when raise_exception then
                if sqlerrm <> 'COMPANY_MONETARY_POLICY_INVALID' then raise; end if;
            end;
        end loop;
        execute 'reset role';
        if exists (select 1 from public.shared_company_monetary_policy_requests r
            where r.organization_id = scope.organization_id and r.company_id = company_id
                and r.idempotency_key like key || '-invalid-%')
        then raise exception 'ASSERT_FAILED_REQUEST_RECEIPT'; end if;
        execute 'set local role service_role';
        passed := array_append(passed, 'malformed_policies_rejected_without_receipts');

        policy := public.configure_native_company_monetary_policy(scope.actor,
            scope.organization_id, company_id, 0, key || '-policy', 'Initial monetary policy', policy_input);
        if policy->>'policy_version' <> '1' or policy->>'operating_currency_code' <> 'VES'
            or policy->'reference_currency_codes' <> '["USD"]'::jsonb
            or policy->>'rate_source' <> 'bcv' or policy->>'rounding_profile' <> 'commercial_v1'
            or policy->>'allow_previous_available_date' <> 'false'
            or policy->>'max_previous_days' <> '0'
        then raise exception 'ASSERT_CONFIGURATION'; end if;
        passed := array_append(passed, 'configured_version_one');

        replay := public.configure_native_company_monetary_policy(scope.actor,
            scope.organization_id, company_id, 0, key || '-policy', 'Initial monetary policy', policy_input);
        -- RPCs run as service_role, which deliberately has no direct private
        -- table grants. Inspect evidence only after returning to the migration
        -- owner, then restore service_role before the next RPC assertions.
        execute 'reset role';
        if replay is distinct from policy
            or (select count(*) from public.shared_company_monetary_policy_revisions r
                where r.organization_id = scope.organization_id and r.company_id = company_id) <> 1
            or (select count(*) from public.shared_company_monetary_policy_events e
                where e.organization_id = scope.organization_id and e.company_id = company_id) <> 1
        then raise exception 'ASSERT_IDEMPOTENT_REPLAY'; end if;
        passed := array_append(passed, 'idempotent_replay_no_duplicate_evidence');
        execute 'set local role service_role';

        begin
            perform public.configure_native_company_monetary_policy(scope.actor,
                scope.organization_id, company_id, 0, key || '-policy', 'Different reason', policy_input);
            raise exception 'EXPECTED_IDEMPOTENCY_CONFLICT';
        exception when raise_exception then
            if sqlerrm <> 'COMPANY_MONETARY_POLICY_IDEMPOTENCY_CONFLICT' then raise; end if;
        end;
        begin
            perform public.configure_native_company_monetary_policy(scope.actor,
                scope.organization_id, company_id, 0, key || '-stale', 'Stale configuration', policy_input);
            raise exception 'EXPECTED_VERSION_CONFLICT';
        exception when raise_exception then
            if sqlerrm <> 'COMPANY_MONETARY_POLICY_VERSION_CONFLICT' then raise; end if;
        end;
        begin
            perform public.configure_native_company_monetary_policy(scope.actor,
                scope.organization_id, company_id, 1, key || '-invalid', 'Invalid configuration',
                jsonb_set(policy_input, '{referenceCurrencyCodes}', '["USD","USD"]'::jsonb));
            raise exception 'EXPECTED_INVALID_POLICY';
        exception when raise_exception then
            if sqlerrm <> 'COMPANY_MONETARY_POLICY_INVALID' then raise; end if;
        end;
        passed := array_append(passed, 'idempotency_version_and_contract_rejections');

        replay := public.configure_native_company_monetary_policy(scope.actor,
            scope.organization_id, company_id, 1, key || '-policy-eur', 'Enable EUR reference',
            jsonb_set(policy_input, '{referenceCurrencyCodes}', '["EUR","USD"]'::jsonb));
        if replay->>'policy_version' <> '2'
            or replay->'reference_currency_codes' <> '["EUR","USD"]'::jsonb
        then raise exception 'ASSERT_SECOND_REVISION'; end if;
        policy := replay;
        passed := array_append(passed, 'reference_currency_subset_and_second_revision');

        -- service_role may execute the RPCs but must not bypass their private
        -- tables directly, including for a mutating statement.
        begin
            perform 1 from public.shared_company_monetary_policies;
            raise exception 'EXPECTED_SERVICE_TABLE_PRIVILEGE_FAILURE';
        exception when insufficient_privilege then null;
        end;
        begin
            execute 'insert into public.shared_company_monetary_policy_events default values';
            raise exception 'EXPECTED_SERVICE_TABLE_INSERT_PRIVILEGE_FAILURE';
        exception when insufficient_privilege then null;
        end;
        passed := array_append(passed, 'service_role_direct_table_denied');

        execute 'reset role';
        begin
            update public.shared_company_monetary_policy_events e
            set reason = 'tampered'
            where e.organization_id = scope.organization_id and e.company_id = company_id;
            raise exception 'EXPECTED_IMMUTABLE_EVIDENCE_FAILURE';
        exception when raise_exception then
            if sqlerrm <> 'COMPANY_MONETARY_POLICY_EVIDENCE_IMMUTABLE' then raise; end if;
        end;
        begin
            delete from public.shared_companies c
            where c.tenant_id = scope.tenant_id and c.id = company_id;
            raise exception 'EXPECTED_COMPANY_EVIDENCE_RESTRICT_FAILURE';
        exception when foreign_key_violation then null;
        end;
        execute 'set local role service_role';
        passed := array_append(passed, 'evidence_immutable_and_company_delete_restricted');

        replay := public.get_native_company_monetary_policy(
            scope.actor, scope.organization_id, company_id, 1);
        if replay->>'policy_version' <> '1'
            or replay->'reference_currency_codes' <> '["USD"]'::jsonb
        then raise exception 'ASSERT_HISTORICAL_READ'; end if;
        begin
            perform public.get_native_company_monetary_policy(
                scope.actor, scope.organization_id, company_id, 3);
            raise exception 'EXPECTED_REVISION_MISSING';
        exception when raise_exception then
            if sqlerrm <> 'COMPANY_MONETARY_POLICY_REVISION_NOT_FOUND' then raise; end if;
        end;
        passed := array_append(passed, 'current_and_immutable_revision_readable');

        numbering := public.get_native_company_document_numbering(
            scope.actor, scope.organization_id, company_id, 1);
        if numbering->>'company_version' <> '1' then raise exception 'ASSERT_POLICY_DID_NOT_BUMP_COMPANY'; end if;
        numbering := public.update_native_company_document_numbering(
            scope.actor, scope.organization_id, company_id, 1, 9, null);
        if numbering->>'company_version' <> '2'
            or (public.get_native_company_monetary_policy(
                scope.actor, scope.organization_id, company_id, null)->>'policy_version') <> '2'
        then raise exception 'ASSERT_NUMBERING_DID_NOT_BUMP_POLICY'; end if;
        passed := array_append(passed, 'numbering_and_policy_versions_independent');

        numbering := public.set_native_company_status(
            scope.actor, scope.organization_id, company_id, 2, 'suspended');
        begin
            perform public.configure_native_company_monetary_policy(scope.actor,
                scope.organization_id, company_id, 2, key || '-suspended', 'Denied while suspended', policy_input);
            raise exception 'EXPECTED_SUSPENDED_CONFIGURATION_FAILURE';
        exception when raise_exception then
            if sqlerrm <> 'COMPANY_TRANSITION_INVALID' then raise; end if;
        end;
        begin
            perform public.configure_native_company_monetary_policy(scope.actor,
                scope.organization_id, company_id, 1, key || '-policy-eur', 'Enable EUR reference',
                jsonb_set(policy_input, '{referenceCurrencyCodes}', '["EUR","USD"]'::jsonb));
            raise exception 'EXPECTED_SUSPENDED_REPLAY_FAILURE';
        exception when raise_exception then
            if sqlerrm <> 'COMPANY_TRANSITION_INVALID' then raise; end if;
        end;
        replay := public.get_native_company_monetary_policy(
            scope.actor, scope.organization_id, company_id, 1);
        if replay->>'policy_version' <> '1' then raise exception 'ASSERT_SUSPENDED_HISTORY_READ'; end if;
        passed := array_append(passed, 'suspended_mutations_denied_historical_read_allowed');

        begin
            perform public.get_native_company_monetary_policy(
                other_scope.actor, other_scope.organization_id, company_id, null);
            raise exception 'EXPECTED_CROSS_ORGANIZATION_FAILURE';
        exception when raise_exception then
            if sqlerrm <> 'COMPANY_NOT_FOUND' then raise; end if;
        end;
        begin
            perform public.configure_native_company_monetary_policy(
                other_scope.actor, other_scope.organization_id, company_id, 2,
                key || '-cross-organization-write', 'Cross organization write', policy_input);
            raise exception 'EXPECTED_CROSS_ORGANIZATION_WRITE_FAILURE';
        exception when raise_exception then
            if sqlerrm <> 'COMPANY_NOT_FOUND' then raise; end if;
        end;
        begin
            perform public.get_native_company_monetary_policy(
                gen_random_uuid(), scope.organization_id, company_id, null);
            raise exception 'EXPECTED_UNKNOWN_ACTOR_FAILURE';
        exception when raise_exception then
            if sqlerrm <> 'COMPANY_ACCESS_DENIED' then raise; end if;
        end;
        passed := array_append(passed, 'organization_isolation');

        -- The permission row is restored by the inner rollback. This verifies
        -- current authorization without violating the last-owner guard.
        delete from public.organization_role_permissions
        where role_id = scope.role_id and permission_code = 'companies.read';
        begin
            perform public.get_native_company_monetary_policy(
                scope.actor, scope.organization_id, company_id, null);
            raise exception 'EXPECTED_REVOKED_ACCESS_FAILURE';
        exception when raise_exception then
            if sqlerrm <> 'COMPANY_ACCESS_DENIED' then raise; end if;
        end;
        passed := array_append(passed, 'revoked_read_permission_denied');
        delete from public.organization_role_permissions
        where role_id = scope.role_id and permission_code = 'companies.update';
        begin
            perform public.configure_native_company_monetary_policy(scope.actor,
                scope.organization_id, company_id, 1, key || '-policy-eur', 'Enable EUR reference',
                jsonb_set(policy_input, '{referenceCurrencyCodes}', '["EUR","USD"]'::jsonb));
            raise exception 'EXPECTED_REVOKED_REPLAY_WRITE_FAILURE';
        exception when raise_exception then
            if sqlerrm <> 'COMPANY_ACCESS_DENIED' then raise; end if;
        end;
        passed := array_append(passed, 'revoked_update_permission_denied_even_for_replay');
        execute 'reset role';

        foreach label in array array['anon', 'authenticated'] loop
            execute format('set local role %I', label);
            begin
                perform public.get_native_company_monetary_policy(
                    scope.actor, scope.organization_id, company_id, null);
                raise exception 'EXPECTED_RPC_PRIVILEGE_FAILURE';
            exception when insufficient_privilege then null;
            end;
            begin
                perform 1 from public.shared_company_monetary_policies;
                raise exception 'EXPECTED_TABLE_PRIVILEGE_FAILURE';
            exception when insufficient_privilege then null;
            end;
            begin
                execute 'insert into public.shared_company_monetary_policy_events default values';
                raise exception 'EXPECTED_TABLE_INSERT_PRIVILEGE_FAILURE';
            exception when insufficient_privilege then null;
            end;
            begin
                execute 'update public.shared_company_monetary_policies set policy_version = 1 where false';
                raise exception 'EXPECTED_TABLE_UPDATE_PRIVILEGE_FAILURE';
            exception when insufficient_privilege then null;
            end;
            execute 'reset role';
            passed := array_append(passed, label || '_rpc_and_table_denied');
        end loop;
        if not exists (select 1 from public.shared_company_monetary_policy_events e
            where e.organization_id = scope.organization_id and e.company_id = company_id
                and actor_user_id = scope.actor and action = 'configured'
                and e.previous_policy_version = 1 and e.policy_version = 2
                and e.previous_policy->'reference_currency_codes' = '["USD"]'::jsonb
                and e.policy->'reference_currency_codes' = '["EUR","USD"]'::jsonb)
        then raise exception 'ASSERT_AUDIT'; end if;
        passed := array_append(passed, 'audit_actor_reason_and_versions');

        raise exception using errcode = 'ZT001', message = 'ROLLBACK_TEST_FIXTURES';
    exception when sqlstate 'ZT001' then null;
    end;
    if exists (select 1 from public.shared_companies c
        where c.id = company_id and c.tenant_id = scope.tenant_id)
        or exists (select 1 from public.shared_company_monetary_policy_requests
            where organization_id = scope.organization_id and idempotency_key = key || '-policy')
    then raise exception 'ASSERT_FIXTURE_CLEANUP'; end if;
    passed := array_append(passed, 'fixtures_rolled_back');
    perform set_config('kontave.company_monetary_policy_smoke_result',
        jsonb_build_object('passed', passed, 'count', cardinality(passed))::text, true);
end;
$smoke$;
select current_setting('kontave.company_monetary_policy_smoke_result')::jsonb as result;
