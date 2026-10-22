-- Read-only ADM-024 preflight. Run against the authorized development project.
with required(signature) as (
    values
        ('public.assert_company_administration_access(uuid,uuid,text)'),
        ('public.company_administration_snapshot(public.shared_companies)'),
        ('public.update_native_company(uuid,uuid,text,integer,jsonb)')
), checks as (
    select
        exists(select 1 from information_schema.columns where table_schema='public'
            and table_name='shared_companies' and column_name='logo_url') as company_logo_column,
        exists(select 1 from storage.buckets where id='company-logos') as target_bucket_exists,
        (select count(*) from public.shared_companies) as companies,
        (select count(*) from public.shared_companies c left join public.organizations o
            on o.id=c.organization_id where c.organization_id is null
            or o.id is null or o.legacy_tenant_id is distinct from c.tenant_id) as scope_mismatches,
        (select relrowsecurity from pg_class where oid='public.shared_companies'::regclass) as company_rls,
        (select count(*) from public.access_control_permissions
            where code in ('companies.read','companies.update')) as company_permissions
)
select jsonb_build_object(
    'checked_at', now(),
    'state', (select to_jsonb(checks) from checks),
    'dependencies', (select jsonb_agg(jsonb_build_object(
        'signature',signature,'installed',to_regprocedure(signature) is not null)
        order by signature) from required),
    'target_bucket_policies', (select coalesce(jsonb_agg(jsonb_build_object(
        'policy',policyname,'command',cmd,'roles',roles) order by policyname),'[]'::jsonb)
        from pg_policies where schemaname='storage' and tablename='objects'
            and (qual like '%company-logos%' or with_check like '%company-logos%')),
    'admin_event_action_constraint', (select pg_get_constraintdef(oid)
        from pg_constraint where conrelid='public.shared_company_administration_events'::regclass
            and conname='shared_company_administration_events_action_check')
) as preflight;
