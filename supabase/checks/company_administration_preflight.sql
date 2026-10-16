-- Read-only preflight for local proposals 285/286. No RPC invocation or writes.
-- Execute through Supabase MCP against the target environment before deployment.
-- Counts are observations, not proof of authorization or concurrent execution.
with company_health as (
    select count(*) as companies,
        count(*) filter (where c.organization_id is null) as missing_organization,
        count(*) filter (where o.id is null or o.legacy_tenant_id is distinct from c.tenant_id) as tenant_mismatch,
        count(*) filter (where c.proximo_numero_factura_venta is null) as null_sales_counter,
        count(*) filter (where coalesce(c.proximo_numero_factura_venta, 1) not between 1 and 99999999
            or c.proximo_numero_nota_entrega not between 1 and 99999999) as counters_outside_format,
        count(*) filter (where exists (
            select 1 from public.shared_inventory_sales_invoices i
            where i.tenant_id = c.tenant_id and i.company_id = c.id
                and i.invoice_number = lpad(coalesce(c.proximo_numero_factura_venta, 1)::text, 8, '0')
        )) as next_sales_number_occupied,
        count(*) filter (where exists (
            select 1 from public.shared_inventory_sales_invoices i
            where i.tenant_id = c.tenant_id and i.company_id = c.id
                and i.invoice_number = 'NE-' || lpad(c.proximo_numero_nota_entrega::text, 8, '0')
        )) as next_delivery_number_occupied
    from public.shared_companies c
    left join public.organizations o on o.id = c.organization_id
), required_functions(signature) as (
    values ('public.create_native_company(uuid,uuid,text,text,text,text,text,text)'),
        ('public.update_native_company(uuid,uuid,text,integer,jsonb)'),
        ('public.set_native_company_status(uuid,uuid,text,integer,text)'),
        ('public.get_native_company_document_numbering(uuid,uuid,text,integer)'),
        ('public.update_native_company_document_numbering(uuid,uuid,text,integer,integer,integer)')
)
select jsonb_build_object(
    'checked_at', now(),
    'company_health', (select to_jsonb(h) from company_health h),
    'documents', (select count(*) from public.shared_inventory_sales_invoices),
    'duplicate_number_groups', (select count(*) from (
        select 1 from public.shared_inventory_sales_invoices where invoice_number <> ''
        group by tenant_id, company_id, invoice_number having count(*) > 1
    ) duplicates),
    'required_functions', (select jsonb_agg(jsonb_build_object(
        'signature', signature, 'installed', to_regprocedure(signature) is not null
    )) from required_functions),
    'number_unique_index', (select jsonb_agg(jsonb_build_object(
        'definition', pg_get_indexdef(indexrelid), 'valid', indisvalid, 'unique', indisunique
    )) from pg_index where indexrelid = to_regclass('public.shared_sales_invoices_number_idx')),
    'rls', (select jsonb_agg(jsonb_build_object('table', relname, 'enabled', relrowsecurity))
        from pg_class where oid in ('public.shared_companies'::regclass,
            'public.shared_inventory_sales_invoices'::regclass)),
    'legacy_company_privileges', (select jsonb_agg(jsonb_build_object(
        'role', role_name,
        'update', has_table_privilege(role_name, 'public.shared_companies', 'UPDATE'),
        'truncate', has_table_privilege(role_name, 'public.shared_companies', 'TRUNCATE')
    )) from (values ('anon'), ('authenticated')) roles(role_name)),
    'format_boundary', (select jsonb_agg(jsonb_build_object(
        'input', value, 'formatted', lpad(value::text, 8, '0')
    )) from (values (99999999), (100000000), (2147483646)) numbers(value))
) as preflight;
