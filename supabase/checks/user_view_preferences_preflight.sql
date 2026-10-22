-- Read-only post-migration check for ADM-043/044 owner isolation and RPC ACL.
select jsonb_build_object(
    'table_exists', to_regclass('public.user_view_preferences') is not null,
    'rls_enabled', (select relrowsecurity from pg_class where oid = to_regclass('public.user_view_preferences')),
    'owner_read_policy', exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'user_view_preferences'
            and policyname = 'user_view_preferences_owner_read' and cmd = 'SELECT'
    ),
    'anon_select', has_table_privilege('anon', 'public.user_view_preferences', 'SELECT'),
    'authenticated_select', has_table_privilege('authenticated', 'public.user_view_preferences', 'SELECT'),
    'authenticated_insert', has_table_privilege('authenticated', 'public.user_view_preferences', 'INSERT'),
    'authenticated_update', has_table_privilege('authenticated', 'public.user_view_preferences', 'UPDATE'),
    'authenticated_delete', has_table_privilege('authenticated', 'public.user_view_preferences', 'DELETE'),
    'anon_rpc_execute', has_function_privilege('anon', 'public.update_user_view_preferences(text,text[],text[],integer)', 'EXECUTE'),
    'authenticated_rpc_execute', has_function_privilege('authenticated', 'public.update_user_view_preferences(text,text[],text[],integer)', 'EXECUTE'),
    'stored_view_count', (select count(*) from public.user_view_preferences)
) as user_view_preferences_preflight;
