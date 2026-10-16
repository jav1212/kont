-- Register Treasury as an installable module without granting organization access.
-- An administrator must provision its commercial entitlement and installation.
alter table public.module_catalog drop constraint if exists module_catalog_code_check;
alter table public.module_catalog add constraint module_catalog_code_check
  check (code in ('payroll','inventory','accounting','purchases','sales','tools','companies','documents','treasury'));

insert into public.module_catalog(code, name, status, supported_platforms)
values ('treasury', 'Tesorería', 'active', array['web']::text[])
on conflict (code) do update
set name = excluded.name, status = excluded.status, supported_platforms = excluded.supported_platforms;

insert into public.module_capabilities(module_id, capability_code)
select id, 'treasury.management' from public.module_catalog where code = 'treasury'
on conflict do nothing;
