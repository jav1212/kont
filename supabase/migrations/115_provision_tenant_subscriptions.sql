-- =============================================================================
-- 115_provision_tenant_subscriptions.sql
--
-- PROBLEMA
-- --------
-- Tras 112/113/114 todo tenant nuevo nace con esquema completo, triggers,
-- auto-membresia del dueño y metricas exactas. Pero sigue faltando UNA pieza
-- para que "funcione igual que oficinakm11": las SUSCRIPCIONES de modulos.
--
-- El sidebar y los guards de cada modulo (useModuleAccess) solo conceden acceso
-- si existe una fila en public.tenant_subscriptions con status 'trial' o 'active'
-- para ese producto. provision_tenant_schema NUNCA creo esas filas, asi que todo
-- tenant nuevo nace SIN ningun modulo visible. Las pocas cuentas que si tienen
-- modulos (oficinakm11, panaderia, hjmolina) recibieron sus suscripciones a mano
-- desde el panel admin; el resto (15 de 18 tenants) quedo con 0 suscripciones.
--
-- El usuario de referencia oficinakm11 tiene los 3 modulos accesibles
-- (payroll/inventory active, accounting trial -> los 3 con hasAccess=true).
--
-- SOLUCION
-- --------
-- 1. provision_tenant_schema crea una suscripcion 'trial' por cada producto de
--    public.products al aprovisionar un tenant nuevo (idempotente: respeta la
--    unique (tenant_id, product_id)). 'trial' da acceso identico a los 3 modulos
--    sin marcar al tenant como pagador (el default del panel admin tambien es
--    'trial'). NO toca tenants.status.
-- 2. Backfill idempotente: crea las suscripciones 'trial' faltantes para TODOS
--    los tenants existentes (no-op para los que ya las tienen).
--
-- Anterior: 114_owner_self_membership_backfill.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. provision_tenant_schema: ahora tambien crea suscripciones trial de modulos
--    (mantiene lo de 112/113/114: esquema + triggers + tenant + auto-membresia
--     + refresh metricas)
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

    -- Suscripciones de modulos en 'trial' (una por cada producto). Sin esto el
    -- sidebar / useModuleAccess no muestra ningun modulo. Idempotente: la unique
    -- (tenant_id, product_id) evita duplicados al re-aprovisionar.
    INSERT INTO public.tenant_subscriptions (tenant_id, product_id, status)
    SELECT p_user_id, pr.id, 'trial'
    FROM public.products pr
    ON CONFLICT (tenant_id, product_id) DO NOTHING;

    -- Metrica inicial exacta
    PERFORM public.refresh_tenant_metrics(p_user_id);
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.provision_tenant_schema(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.provision_tenant_schema(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Backfill: suscripciones 'trial' faltantes para todos los tenants existentes
--    (no-op para los que ya tienen la fila de ese producto)
-- -----------------------------------------------------------------------------
INSERT INTO public.tenant_subscriptions (tenant_id, product_id, status)
SELECT t.id, pr.id, 'trial'
FROM public.tenants t
CROSS JOIN public.products pr
WHERE NOT EXISTS (
    SELECT 1 FROM public.tenant_subscriptions s
    WHERE s.tenant_id = t.id AND s.product_id = pr.id
);
