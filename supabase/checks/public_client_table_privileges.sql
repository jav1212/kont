-- Read-only assertion for migration 306. RLS does not protect TRUNCATE, so
-- anon/authenticated must hold neither TRUNCATE nor MAINTAIN on public tables.
with table_privileges as (
    select n.nspname as schema_name, c.relname as table_name,
        role_name,
        has_table_privilege(role_name, c.oid, 'TRUNCATE') as can_truncate,
        has_table_privilege(role_name, c.oid, 'MAINTAIN') as can_maintain
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) roles(role_name)
    where n.nspname = 'public' and c.relkind in ('r', 'p')
), default_privileges as (
    select d.defaclrole::regrole::text as grantor,
        e.grantee::regrole::text as grantee,
        e.privilege_type
    from pg_default_acl d
    cross join lateral aclexplode(d.defaclacl) e
    where d.defaclnamespace = 'public'::regnamespace
        and d.defaclobjtype = 'r'
        and e.grantee::regrole::text in ('anon', 'authenticated')
        and e.privilege_type in ('TRUNCATE', 'MAINTAIN')
)
select jsonb_build_object(
    'public_table_count', (select count(*) from table_privileges),
    'table_privilege_violations', coalesce((select jsonb_agg(to_jsonb(p)) from table_privileges p where p.can_truncate or p.can_maintain), '[]'::jsonb),
    'default_privilege_violations', coalesce((select jsonb_agg(to_jsonb(d)) from default_privileges d), '[]'::jsonb)
) as privilege_check;
