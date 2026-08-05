-- Close the legacy RPC surface for client roles.
-- The server-side backend uses service_role and keeps working.
revoke execute on function public.activate_own_tenant() from public, anon, authenticated;
revoke execute on function public.tenant_employees_get_by_company(uuid, text) from public, anon, authenticated;
revoke execute on function public.tenant_employees_upsert(uuid, jsonb) from public, anon, authenticated;
