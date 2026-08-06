-- 165_disable_legacy_tenant_provisioning.sql
-- Ningun flujo de autenticacion puede volver a crear schemas tenant_*.

REVOKE ALL ON FUNCTION public.on_auth_user_created() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.activate_own_tenant() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.provision_tenant_schema(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reconcile_tenant_schema(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.provision_tenant_drafts_table(uuid) FROM PUBLIC, anon, authenticated, service_role;
