-- Mutating integration smoke for an explicitly authorized development database.
-- All fixture writes occur in the inner subtransaction and are rolled back by
-- the dedicated ZT001 exception, including on unexpected assertion failures.
-- Existing memberships supply authorization; existing business rows are not edited.
do $smoke$
#variable_conflict use_variable
declare
    scope record;
    other_scope record;
    company jsonb;
    replay jsonb;
    snapshot jsonb;
    invoice jsonb;
    candidate record;
    label text;
    customer_id text := gen_random_uuid()::text;
    key text := 'mcp-company-smoke-' || gen_random_uuid()::text;
    company_id text;
    passed text[] := array[]::text[];
begin
    select o.id as organization_id, o.legacy_tenant_id as tenant_id, m.user_id as actor
    into strict scope
    from public.organizations o
    join public.organization_memberships m on m.organization_id=o.id
    join public.organization_roles r on r.id=m.role_id and r.organization_id=o.id
    where o.status='active' and m.status='active' and r.status='active'
        and o.legacy_tenant_id is not null
        and exists(select 1 from public.organization_role_permissions where role_id=r.id and permission_code='companies.create')
        and exists(select 1 from public.organization_role_permissions where role_id=r.id and permission_code='companies.update')
    order by o.id limit 1;
    select o.id as organization_id, m.user_id as actor into strict other_scope
    from public.organizations o
    join public.organization_memberships m on m.organization_id=o.id
    join public.organization_roles r on r.id=m.role_id and r.organization_id=o.id
    where o.id<>scope.organization_id and o.status='active' and m.status='active' and r.status='active'
        and o.legacy_tenant_id is not null
        and exists(select 1 from public.organization_role_permissions where role_id=r.id and permission_code='companies.update')
    order by o.id limit 1;

    begin
        execute 'set local role service_role';
        company := public.create_native_company(scope.actor,scope.organization_id,key,'MCP disposable company',null,null,'VE','standard');
        company_id := company->>'id';
        if company->>'version'<>'1' or company->>'status'<>'active' then raise exception 'ASSERT_CREATE'; end if;
        passed := array_append(passed,'create_as_service_role');
        replay := public.create_native_company(scope.actor,scope.organization_id,key,'MCP disposable company',null,null,'VE','standard');
        if replay is distinct from company then raise exception 'ASSERT_IDEMPOTENCY'; end if;
        passed := array_append(passed,'create_idempotent');

        snapshot := public.get_native_company_document_numbering(scope.actor,scope.organization_id,company_id,1);
        if snapshot <> '{"sales_invoice_next_number":1,"delivery_note_next_number":1,"company_version":1}'::jsonb then raise exception 'ASSERT_DEFAULTS'; end if;
        passed := array_append(passed,'numbering_defaults');
        snapshot := public.update_native_company_document_numbering(scope.actor,scope.organization_id,company_id,1,15,7);
        if snapshot <> '{"sales_invoice_next_number":15,"delivery_note_next_number":7,"company_version":2}'::jsonb then raise exception 'ASSERT_NUMBER_UPDATE'; end if;
        passed := array_append(passed,'atomic_two_counter_update');
        execute 'reset role';
        if not exists(select 1 from public.shared_company_administration_events
            where shared_company_administration_events.company_id=company_id
                and actor_user_id=scope.actor and action='document_numbering_updated' and previous_version=1 and version=2)
        then raise exception 'ASSERT_AUDIT'; end if;
        passed := array_append(passed,'audit_actor_and_versions');

        insert into public.shared_inventory_customers(tenant_id,id,company_id,rif,name)
        values(scope.tenant_id,customer_id,company_id,'J-00000000-0','MCP disposable customer');
        execute 'set local role service_role';
        invoice := public.shared_inventory_sales_invoice_save(scope.tenant_id,
            jsonb_build_object('empresa_id',company_id,'cliente_id',customer_id,'numero_factura','00000019'),'[]');
        for candidate in select * from (values
            ('idempotency_conflict',format('select public.create_native_company(%L,%L,%L,%L,null,null,%L,%L)',scope.actor,scope.organization_id,key,'Different','VE','standard'),'COMPANY_IDEMPOTENCY_CONFLICT'),
            ('stale_write',format('select public.update_native_company_document_numbering(%L,%L,%L,1,20,null)',scope.actor,scope.organization_id,company_id),'COMPANY_VERSION_CONFLICT'),
            ('stale_read',format('select public.get_native_company_document_numbering(%L,%L,%L,1)',scope.actor,scope.organization_id,company_id),'COMPANY_VERSION_CONFLICT'),
            ('rewind',format('select public.update_native_company_document_numbering(%L,%L,%L,2,14,null)',scope.actor,scope.organization_id,company_id),'COMPANY_DOCUMENT_NUMBER_REWIND'),
            ('occupied_number',format('select public.update_native_company_document_numbering(%L,%L,%L,2,19,null)',scope.actor,scope.organization_id,company_id),'COMPANY_DOCUMENT_NUMBER_IN_USE'),
            ('sales_format_overflow',format('select public.update_native_company_document_numbering(%L,%L,%L,2,100000000,null)',scope.actor,scope.organization_id,company_id),'COMPANY_DOCUMENT_NUMBER_INVALID'),
            ('delivery_format_overflow',format('select public.update_native_company_document_numbering(%L,%L,%L,2,null,100000000)',scope.actor,scope.organization_id,company_id),'COMPANY_DOCUMENT_NUMBER_INVALID'),
            ('empty_patch',format('select public.update_native_company_document_numbering(%L,%L,%L,2,null,null)',scope.actor,scope.organization_id,company_id),'COMPANY_DOCUMENT_NUMBER_INVALID'),
            ('zero_counter',format('select public.update_native_company_document_numbering(%L,%L,%L,2,0,null)',scope.actor,scope.organization_id,company_id),'COMPANY_DOCUMENT_NUMBER_INVALID'),
            ('unknown_actor',format('select public.get_native_company_document_numbering(%L,%L,%L,2)',gen_random_uuid(),scope.organization_id,company_id),'COMPANY_ACCESS_DENIED'),
            ('other_organization',format('select public.get_native_company_document_numbering(%L,%L,%L,2)',other_scope.actor,other_scope.organization_id,company_id),'COMPANY_NOT_FOUND'),
            ('missing_company',format('select public.get_native_company_document_numbering(%L,%L,%L,2)',scope.actor,scope.organization_id,gen_random_uuid()::text),'COMPANY_NOT_FOUND')
        ) checks(name,statement,expected) loop
            begin
                execute candidate.statement;
                raise exception 'EXPECTED_FAILURE_NOT_RAISED: %',candidate.name;
            exception when raise_exception then
                if sqlerrm <> candidate.expected then raise; end if;
            end;
            passed := array_append(passed,candidate.name);
        end loop;

        invoice := public.shared_inventory_sales_invoice_save(scope.tenant_id,
            jsonb_build_object('empresa_id',company_id,'cliente_id',customer_id),'[]');
        if invoice->>'invoice_number'<>'00000015' then raise exception 'ASSERT_SALES_NUMBER'; end if;
        snapshot := public.get_native_company_document_numbering(scope.actor,scope.organization_id,company_id,3);
        if snapshot->>'sales_invoice_next_number'<>'16' then raise exception 'ASSERT_SALES_COUNTER'; end if;
        passed := array_append(passed,'real_sales_rpc_counter_and_version');
        invoice := public.shared_inventory_sales_invoice_save(scope.tenant_id,
            jsonb_build_object('empresa_id',company_id,'cliente_id',customer_id,'tipo_documento','nota_entrega'),'[]');
        if invoice->>'invoice_number'<>'NE-00000007' then raise exception 'ASSERT_DELIVERY_NUMBER'; end if;
        passed := array_append(passed,'real_delivery_rpc_counter_and_version');

        snapshot := public.set_native_company_status(scope.actor,scope.organization_id,company_id,4,'suspended');
        begin
            perform public.update_native_company_document_numbering(scope.actor,scope.organization_id,company_id,5,20,null);
            raise exception 'EXPECTED_SUSPENSION_FAILURE';
        exception when raise_exception then
            if sqlerrm<>'COMPANY_TRANSITION_INVALID' then raise; end if;
        end;
        passed := array_append(passed,'suspended_company_denied');
        snapshot := public.set_native_company_status(scope.actor,scope.organization_id,company_id,5,'active');
        snapshot := public.update_native_company(scope.actor,scope.organization_id,company_id,6,'{"tradeName":"Smoke Updated"}');
        if snapshot->>'version'<>'7' or snapshot->>'trade_name'<>'Smoke Updated' then raise exception 'ASSERT_IDENTITY_UPDATE'; end if;
        passed := array_append(passed,'lifecycle_and_identity_update');

        foreach label in array array['anon','authenticated'] loop
            execute 'reset role';
            execute format('set local role %I',label);
            begin
                perform public.get_native_company_document_numbering(scope.actor,scope.organization_id,company_id,7);
                raise exception 'EXPECTED_PRIVILEGE_FAILURE';
            exception when insufficient_privilege then null;
            end;
            passed := array_append(passed,label||'_rpc_denied');
        end loop;
        execute 'reset role';
        execute 'set local role service_role';
        snapshot := public.update_native_company_document_numbering(scope.actor,scope.organization_id,company_id,7,99999999,99999999);
        invoice := public.shared_inventory_sales_invoice_save(scope.tenant_id,
            jsonb_build_object('empresa_id',company_id,'cliente_id',customer_id),'[]');
        if invoice->>'invoice_number'<>'99999999' then raise exception 'ASSERT_LAST_SALES_NUMBER'; end if;
        passed := array_append(passed,'last_sales_number');
        invoice := public.shared_inventory_sales_invoice_save(scope.tenant_id,
            jsonb_build_object('empresa_id',company_id,'cliente_id',customer_id,'tipo_documento','nota_entrega'),'[]');
        if invoice->>'invoice_number'<>'NE-99999999' then raise exception 'ASSERT_LAST_DELIVERY_NUMBER'; end if;
        passed := array_append(passed,'last_delivery_number');
        foreach label in array array['venta','nota_entrega'] loop
            begin
                perform public.shared_inventory_sales_invoice_save(scope.tenant_id,
                    jsonb_build_object('empresa_id',company_id,'cliente_id',customer_id,'tipo_documento',label),'[]');
                raise exception 'EXPECTED_EXHAUSTION_FAILURE';
            exception when raise_exception then
                if sqlerrm<>'COMPANY_DOCUMENT_NUMBER_EXHAUSTED' then raise; end if;
            end;
            passed := array_append(passed,label||'_exhaustion_denied');
        end loop;
        snapshot := public.get_native_company_document_numbering(scope.actor,scope.organization_id,company_id,10);
        if snapshot <> '{"sales_invoice_next_number":100000000,"delivery_note_next_number":100000000,"company_version":10}'::jsonb then raise exception 'ASSERT_EXHAUSTION_ATOMIC'; end if;
        passed := array_append(passed,'failed_allocations_preserve_counters');
        begin
            update public.shared_companies c set proximo_numero_factura_venta=0
            where c.tenant_id=scope.tenant_id and c.id=company_id;
            raise exception 'EXPECTED_DIRECT_COUNTER_FAILURE';
        exception when raise_exception then
            if sqlerrm<>'COMPANY_DOCUMENT_NUMBER_INVALID' then raise; end if;
        end;
        passed := array_append(passed,'negative_direct_counter_denied');
        execute 'reset role';
        raise exception using errcode='ZT001', message='ROLLBACK_TEST_FIXTURES';
    exception when sqlstate 'ZT001' then null;
    end;
    if exists(select 1 from public.shared_company_creation_requests where idempotency_key=key)
        or exists(select 1 from public.shared_companies c where c.id=company_id and c.tenant_id=scope.tenant_id)
    then raise exception 'ASSERT_FIXTURE_CLEANUP'; end if;
    passed := array_append(passed,'fixtures_rolled_back');
    perform set_config('kontave.company_smoke_result',jsonb_build_object('passed',passed,'count',cardinality(passed))::text,true);
end;
$smoke$;
select current_setting('kontave.company_smoke_result')::jsonb as result;
