-- Read-only preflight for migration 289. Run through MCP before applying it.
with required_functions(signature) as (
    values ('public.assert_company_administration_access(uuid,uuid,text)'),
        ('public.get_native_company_document_numbering(uuid,uuid,text,integer)')
), company_health as (
    select count(*) as companies,
        count(*) filter (where organization_id is null) as missing_organization,
        count(*) filter (where c.status is distinct from 'active') as non_active_companies,
        count(*) filter (where o.id is null or o.legacy_tenant_id is distinct from c.tenant_id)
            as tenant_mismatch
    from public.shared_companies c
    left join public.organizations o on o.id = c.organization_id
)
select jsonb_build_object(
    'checked_at', now(),
    'company_health', (select to_jsonb(company_health) from company_health),
    'policy_tables_already_installed', (select jsonb_agg(relname order by relname)
        from pg_class where relname in (
            'shared_company_monetary_policies', 'shared_company_monetary_policy_revisions',
            'shared_company_monetary_policy_requests', 'shared_company_monetary_policy_events')),
    'required_functions', (select jsonb_agg(jsonb_build_object(
        'signature', signature, 'installed', to_regprocedure(signature) is not null
    )) from required_functions),
    'permissions', (select jsonb_agg(code order by code)
        from public.access_control_permissions
        where code in ('companies.read', 'companies.update')),
    'company_rls', (select relrowsecurity from pg_class
        where oid = 'public.shared_companies'::regclass)
) as preflight;
