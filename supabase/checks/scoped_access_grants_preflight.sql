select c.relname, c.relrowsecurity,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
       has_function_privilege('anon', 'public.organization_scoped_grant_has(uuid,uuid,text,text,text,text)', 'EXECUTE') as anon_rpc,
       has_function_privilege('authenticated', 'public.organization_scoped_grant_has(uuid,uuid,text,text,text,text)', 'EXECUTE') as authenticated_rpc,
       has_function_privilege('service_role', 'public.organization_scoped_grant_has(uuid,uuid,text,text,text,text)', 'EXECUTE') as service_rpc
from pg_class c
where c.oid in (
    'public.organization_membership_scoped_grants'::regclass,
    'public.organization_user_allowed_companies'::regclass
)
order by c.relname;
