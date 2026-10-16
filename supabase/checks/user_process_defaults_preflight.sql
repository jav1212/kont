select c.relname, c.relrowsecurity,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_delete,
       has_function_privilege('anon', 'public.update_user_process_defaults(text,jsonb,integer)', 'EXECUTE') as anon_rpc,
       has_function_privilege('authenticated', 'public.update_user_process_defaults(text,jsonb,integer)', 'EXECUTE') as authenticated_rpc,
       (select count(*) from public.user_process_defaults) as persisted_rows
from pg_class c where c.oid = 'public.user_process_defaults'::regclass;
