-- Read-only preflight for ADM-004/ADM-006. Run before migration in the authorized development project.
with dependencies(signature) as (
  values
    ('public.assert_user_security_access(uuid,uuid,text,text)'),
    ('public.create_native_company_with_person_nature(uuid,uuid,text,text,text,text,text,text,text)'),
    ('public.configure_native_company_date_format(uuid,uuid,text,integer,text,text,text)'),
    ('public.configure_native_company_monetary_policy(uuid,uuid,text,integer,text,text,jsonb)')
), company_health as (
  select count(*) as companies,
    count(*) filter (where c.organization_id is null or o.legacy_tenant_id is distinct from c.tenant_id) as organization_tenant_mismatches
  from public.shared_companies c left join public.organizations o on o.id=c.organization_id
)
select jsonb_build_object(
  'checked_at',now(),
  'company_health',(select to_jsonb(company_health) from company_health),
  'dependencies',(select jsonb_agg(jsonb_build_object('signature',signature,'installed',to_regprocedure(signature) is not null)) from dependencies),
  'permissions',(select jsonb_agg(code order by code) from public.access_control_permissions where code in ('companies.read','companies.create','companies.update')),
  'sidecars',(select jsonb_build_object('date_formats',to_regclass('public.shared_company_date_formats') is not null,'monetary_policies',to_regclass('public.shared_company_monetary_policies') is not null)),
  'company_version_trigger',(select exists(select 1 from pg_trigger where tgrelid='public.shared_companies'::regclass and tgname='shared_companies_advance_version' and not tgisinternal))
) as preflight;
