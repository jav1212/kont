-- Read-only preflight for migration 363 in the authorized development project.
-- Inspect the result through Supabase MCP before applying any DDL.
with dependencies(signature) as (
  values
    ('public.company_configuration_copy_sections_valid(jsonb)'),
    ('public.copy_native_company_configuration(uuid,uuid,text,integer,text,integer,integer,integer,integer,integer,text,jsonb)'),
    ('public.create_native_company_from_existing(uuid,uuid,text,integer,integer,integer,text,jsonb,jsonb)'),
    ('public.configure_native_company_fiscal_profile(uuid,uuid,text,integer,text,text,text,text)'),
    ('public.company_fiscal_profile_snapshot(public.shared_companies)')
)
select jsonb_build_object(
  'dependencies', (select jsonb_agg(jsonb_build_object('signature',signature,'installed',to_regprocedure(signature) is not null)) from dependencies),
  'fiscalColumns', (select jsonb_agg(column_name order by column_name) from information_schema.columns
    where table_schema='public' and table_name='shared_companies'
      and column_name in ('address','taxpayer_type','person_nature','version')),
  'copyRequests', to_regclass('public.shared_company_configuration_copy_requests') is not null,
  'copyEvents', to_regclass('public.shared_company_configuration_copy_events') is not null,
  'fiscalEvents', to_regclass('public.shared_company_fiscal_profile_events') is not null,
  'companyVersionTrigger', exists(select 1 from pg_trigger
    where tgrelid='public.shared_companies'::regclass and tgname='shared_companies_advance_version' and not tgisinternal),
  'copyRpcServiceRoleOnly', (
    select has_function_privilege('service_role',oid,'EXECUTE')
      and not has_function_privilege('authenticated',oid,'EXECUTE')
      and not has_function_privilege('anon',oid,'EXECUTE')
    from pg_proc where oid=to_regprocedure('public.copy_native_company_configuration(uuid,uuid,text,integer,text,integer,integer,integer,integer,integer,text,jsonb)')
  ),
  'companyCount', (select count(*) from public.shared_companies)
) as preflight;
