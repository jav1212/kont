-- =============================================================================
-- 008_consolidate_rls_policies.sql
-- Elimina "multiple permissive policies" consolidando las políticas admin+tenant
-- en una sola política por operación (SELECT, INSERT, UPDATE, DELETE).
-- Esto evita que Postgres evalúe múltiples políticas PERMISSIVE por query.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- public.tenants
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenants_self_read"   ON public.tenants;
DROP POLICY IF EXISTS "tenants_self_update" ON public.tenants;
DROP POLICY IF EXISTS "tenants_admin_all"   ON public.tenants;

CREATE POLICY "tenants_select" ON public.tenants
    FOR SELECT USING (
        (SELECT auth.uid()) = id
        OR EXISTS (SELECT 1 FROM public.admin_users WHERE id = (SELECT auth.uid()))
    );

CREATE POLICY "tenants_update" ON public.tenants
    FOR UPDATE USING (
        (SELECT auth.uid()) = id
        OR EXISTS (SELECT 1 FROM public.admin_users WHERE id = (SELECT auth.uid()))
    );

CREATE POLICY "tenants_insert" ON public.tenants
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.admin_users WHERE id = (SELECT auth.uid()))
    );

CREATE POLICY "tenants_delete" ON public.tenants
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.admin_users WHERE id = (SELECT auth.uid()))
    );

-- ---------------------------------------------------------------------------
-- public.payment_requests
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "payment_requests_tenant_read"   ON public.payment_requests;
DROP POLICY IF EXISTS "payment_requests_tenant_insert" ON public.payment_requests;
DROP POLICY IF EXISTS "payment_requests_admin_all"     ON public.payment_requests;

CREATE POLICY "payment_requests_select" ON public.payment_requests
    FOR SELECT USING (
        tenant_id = (SELECT auth.uid())
        OR EXISTS (SELECT 1 FROM public.admin_users WHERE id = (SELECT auth.uid()))
    );

CREATE POLICY "payment_requests_insert" ON public.payment_requests
    FOR INSERT WITH CHECK (
        tenant_id = (SELECT auth.uid())
        OR EXISTS (SELECT 1 FROM public.admin_users WHERE id = (SELECT auth.uid()))
    );

CREATE POLICY "payment_requests_update" ON public.payment_requests
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.admin_users WHERE id = (SELECT auth.uid()))
    );

CREATE POLICY "payment_requests_delete" ON public.payment_requests
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.admin_users WHERE id = (SELECT auth.uid()))
    );

-- ---------------------------------------------------------------------------
-- public.tenant_metrics
-- tenant_metrics solo se escribe via SECURITY DEFINER (triggers/funciones).
-- No se expone INSERT/UPDATE/DELETE a PostgREST para usuarios normales.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_metrics_self_read"  ON public.tenant_metrics;
DROP POLICY IF EXISTS "tenant_metrics_admin_all"  ON public.tenant_metrics;

CREATE POLICY "tenant_metrics_select" ON public.tenant_metrics
    FOR SELECT USING (
        (SELECT auth.uid()) = tenant_id
        OR EXISTS (SELECT 1 FROM public.admin_users WHERE id = (SELECT auth.uid()))
    );
