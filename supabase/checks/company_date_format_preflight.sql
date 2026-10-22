-- Read-only preflight for the proposed ADM-023 date-format migration.
-- Run through Supabase MCP against the authorized development environment.
with requirements(signature) as (
    values
        ('public.assert_company_administration_access(uuid,uuid,text)'),
        ('public.set_native_company_status(uuid,uuid,text,integer,text)')
), health as (
    select count(*) as companies,
        count(*) filter (where c.organization_id is null) as missing_organization,
        count(*) filter (where o.id is null or o.legacy_tenant_id is distinct from c.tenant_id) as tenant_mismatch
    from public.shared_companies c
    left join public.organizations o on o.id = c.organization_id
)
select jsonb_build_object(
    'checked_at', now(),
    'company_health', (select to_jsonb(health) from health),
    'date_format_objects', (select jsonb_agg(name order by name) from (
        select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname in (
            'shared_company_date_formats',
            'shared_company_date_format_revisions',
            'shared_company_date_format_idempotency',
            'shared_company_date_format_events',
            'get_native_company_date_format',
            'configure_native_company_date_format')) existing_objects),
    'required_dependencies', (select jsonb_agg(jsonb_build_object(
        'signature', signature, 'installed', to_regprocedure(signature) is not null)) from requirements),
    'permissions', (select jsonb_agg(code order by code) from public.access_control_permissions
        where code in ('companies.read','companies.update')),
    'company_rls', (select relrowsecurity from pg_class where oid='public.shared_companies'::regclass)
) as preflight;
