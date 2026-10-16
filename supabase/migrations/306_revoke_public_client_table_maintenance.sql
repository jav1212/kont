-- Row-level security does not constrain TRUNCATE. Remove table-maintenance
-- privileges from API roles while preserving legacy CRUD grants governed by RLS.
-- The deployment role is postgres. A separate supabase_admin default ACL is
-- intentionally not altered because this migration role is not its member.
do $migration$
declare
    v_table record;
begin
    for v_table in
        select n.nspname as schema_name, c.relname as table_name
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
    loop
        execute format(
            'revoke truncate, maintain on table %I.%I from anon, authenticated',
            v_table.schema_name, v_table.table_name
        );
    end loop;

    execute 'alter default privileges for role postgres in schema public revoke truncate, maintain on tables from anon, authenticated';
end;
$migration$;
