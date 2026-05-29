-- =============================================================================
-- 114_owner_self_membership_backfill.sql
--
-- PROBLEMA
-- --------
-- El frontend resuelve el "tenant activo" SOLO a partir de /api/memberships, que
-- a su vez lista filas de public.tenant_memberships (ver getUserMemberships). Para
-- que a un DUEÑO se le muestre su propio tenant, debe existir una fila de
-- auto-membresia (tenant_id = member_id = owner, role 'owner'). Esas filas se
-- crearon UNA sola vez en un backfill al lanzar el modelo de membresias
-- (mig. 029, todas con created_at = 2026-03-21 21:29:24). NUNCA se creo un
-- mecanismo que las genere para dueños nuevos, asi que todo tenant registrado
-- despues de ese backfill nacio sin auto-membresia.
--
-- Efecto: en un login limpio (sin el hint viejo en localStorage) useActiveTenant
-- recibe lista vacia -> activeTenantId = null -> use-companies no hace fetch ->
-- la lista de empresas aparece vacia. (El bug quedaba enmascarado mientras el
-- navegador conservara kont-active-tenant-id de una sesion previa; al cerrar
-- sesion se borra y el problema se manifiesta.)
--
-- SOLUCION
-- --------
-- 1. Backfill idempotente de la auto-membresia para todo dueño que no la tenga.
-- 2. provision_tenant_schema crea la auto-membresia al aprovisionar un tenant
--    nuevo (ademas de reconciliar esquema, triggers y refrescar metricas).
--
-- Nota: el fix robusto definitivo es de codigo (getUserMemberships deberia
-- sintetizar el tenant propio desde public.tenants aunque no exista la fila),
-- pero este backfill + provisioning resuelve el incidente sin requerir deploy.
--
-- Anterior: 113_reconcile_tenant_triggers.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Backfill: auto-membresia 'owner' para dueños que no la tienen
-- -----------------------------------------------------------------------------
INSERT INTO public.tenant_memberships (tenant_id, member_id, role, invited_by, accepted_at)
SELECT t.id, t.id, 'owner', NULL, COALESCE(t.created_at, now())
FROM public.tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.tenant_id = t.id AND m.member_id = t.id
);

-- -----------------------------------------------------------------------------
-- 2. provision_tenant_schema: crear la auto-membresia para tenants nuevos
--    (mantiene lo de 112/113: reconcile esquema + triggers + refresh metricas)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_tenant_schema(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    v_schema  text;
    v_plan_id uuid;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    SELECT id INTO v_plan_id FROM public.plans WHERE name = 'Emprendedor' LIMIT 1;

    -- Esquema completo (tablas, indices, RLS, grants)
    PERFORM public.reconcile_tenant_schema(p_user_id);

    -- Triggers por-esquema (metricas + historial salarial)
    PERFORM public.reconcile_tenant_triggers(p_user_id);

    -- Registro del tenant (idempotente)
    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;

    -- Auto-membresia del dueño (necesaria para que /api/memberships y el
    -- resolvedor de tenant activo del frontend muestren su propio tenant)
    INSERT INTO public.tenant_memberships (tenant_id, member_id, role, invited_by, accepted_at)
    SELECT p_user_id, p_user_id, 'owner', NULL, now()
    WHERE NOT EXISTS (
        SELECT 1 FROM public.tenant_memberships m
        WHERE m.tenant_id = p_user_id AND m.member_id = p_user_id
    );

    -- Metrica inicial exacta
    PERFORM public.refresh_tenant_metrics(p_user_id);
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.provision_tenant_schema(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.provision_tenant_schema(uuid) TO service_role;
