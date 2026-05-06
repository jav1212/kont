-- =============================================================================
-- 098_security_p0_lockdown.sql
-- Cierre crítico de la superficie expuesta de seguridad (Fase 0 del plan).
--
-- Operaciones (todas no destructivas — sólo permisos, policies y vistas):
--   1. REVOKE EXECUTE de RPCs `tenant_*`, provision_*, sensitive helpers
--      desde anon/authenticated/public. El backend usa service_role, que
--      mantiene su grant por defecto y por eso la app sigue funcionando.
--   2. DROP de policy `profiles_service_all` (USING true / WITH CHECK true)
--      que efectivamente desactiva RLS en `public.profiles`. Las policies
--      `profiles_select_own` / `profiles_update_own` cubren el caso normal.
--   3. Recrear vista `admin_tenant_overview` con `security_invoker = true`
--      (Postgres 15+) para que el JOIN a `auth.users` se evalúe con los
--      privilegios del consultante (service_role) y no como `postgres`.
--   4. ENABLE RLS + policy `tenant_owner` en las 12 tablas `ventas_*`
--      de los 4 tenants existentes (drift de la mig 094 que olvidó el
--      ENABLE RLS). Las filas existentes quedan intactas.
--
-- Excepciones:
--   * `activate_own_tenant()` no entra en el REVOKE — la app espera que
--     el usuario invitado la pueda llamar con su sesión (auth.uid()).
--     El patrón LIKE 'tenant\_%' no la captura (no empieza con "tenant_").
--   * `tenant_get_schema(uuid)` SÍ se revoca — el código TS la llama
--     siempre con service_role.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. REVOKE EXECUTE en RPCs SECURITY DEFINER expuestas
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef = true
       AND (
         p.proname LIKE 'tenant\_%'   -- RPCs del modelo multi-tenant
         OR p.proname IN (
           'provision_tenant_schema',
           'provision_documents_tables',
           'provision_tenant_drafts_table',
           'refresh_tenant_metrics',
           'is_admin',
           'get_platform_summary',
           '_inv_drafts_install'
         )
       )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, authenticated, public',
      r.nspname, r.proname, r.args
    );
    -- service_role conserva EXECUTE por su grant por defecto.
  END LOOP;
END$$;

-- ---------------------------------------------------------------------------
-- 2. DROP de policy abierta en public.profiles
-- ---------------------------------------------------------------------------
-- profiles_service_all: USING (true) WITH CHECK (true) ALL TO public
-- → se eliminó porque desactiva RLS para anyone. profiles_select_own y
--   profiles_update_own siguen vigentes para el dueño de la fila.
-- → service_role bypassa RLS sin necesidad de policy.
DROP POLICY IF EXISTS profiles_service_all ON public.profiles;

-- ---------------------------------------------------------------------------
-- 3. Recrear admin_tenant_overview con security_invoker = true
-- ---------------------------------------------------------------------------
-- La definición se preserva (incluye member_count y member_of_tenants
-- añadidos en alguna migración no rastreada vía dashboard).
DROP VIEW IF EXISTS public.admin_tenant_overview;

CREATE VIEW public.admin_tenant_overview
WITH (security_invoker = true) AS
SELECT
    t.id                              AS tenant_id,
    u.email,
    p.name                            AS plan_name,
    p.max_companies                   AS plan_max_companies,
    p.max_employees_per_company       AS plan_max_employees,
    t.status,
    t.billing_cycle,
    t.schema_name,
    t.current_period_start,
    t.current_period_end,
    t.last_payment_at,
    t.created_at                      AS tenant_since,
    COALESCE(m.company_count, 0)      AS company_count,
    COALESCE(m.employee_count, 0)     AS employee_count,
    COALESCE(m.payroll_run_count, 0)  AS payroll_run_count,
    m.last_activity_at,
    (
      SELECT count(*)
        FROM public.tenant_memberships tm
       WHERE tm.tenant_id = t.id
         AND tm.member_id <> t.id
         AND tm.revoked_at IS NULL
    )::integer                        AS member_count,
    (
      SELECT string_agg(u2.email::text, ', ' ORDER BY u2.email::text)
        FROM public.tenant_memberships tm2
        JOIN public.tenants t2 ON t2.id = tm2.tenant_id
        JOIN auth.users     u2 ON u2.id = t2.id
       WHERE tm2.member_id = t.id
         AND tm2.tenant_id <> t.id
         AND tm2.revoked_at IS NULL
    )                                 AS member_of_tenants
  FROM public.tenants            t
  JOIN auth.users                u ON u.id = t.id
  JOIN public.plans              p ON p.id = t.plan_id
  LEFT JOIN public.tenant_metrics m ON m.tenant_id = t.id
 ORDER BY t.created_at DESC;

REVOKE ALL    ON public.admin_tenant_overview FROM anon, authenticated, public;
GRANT  SELECT ON public.admin_tenant_overview TO   service_role;

-- ---------------------------------------------------------------------------
-- 4. ENABLE RLS + tenant_owner policy en ventas_* (12 tablas en 4 tenants)
-- ---------------------------------------------------------------------------
-- Mig 094_sales_module creó las tablas pero olvidó habilitar RLS y crear
-- la policy tenant_owner. Backfill no destructivo: las filas existentes
-- quedan intactas, sólo se aplica metadata RLS y se crea la policy.
DO $$
DECLARE
  rec       record;
  v_table   text;
  v_tables  text[] := ARRAY['ventas_clientes','ventas_facturas','ventas_facturas_items'];
BEGIN
  FOR rec IN SELECT id, schema_name FROM public.tenants LOOP
    FOREACH v_table IN ARRAY v_tables LOOP
      -- Solo tocar si la tabla existe en este schema (defensivo).
      IF EXISTS (
        SELECT 1
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = rec.schema_name
           AND c.relname = v_table
      ) THEN
        EXECUTE format(
          'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
          rec.schema_name, v_table
        );
        EXECUTE format(
          'DROP POLICY IF EXISTS tenant_owner ON %I.%I',
          rec.schema_name, v_table
        );
        EXECUTE format(
          'CREATE POLICY tenant_owner ON %I.%I '
          'FOR ALL USING ((SELECT auth.uid()) = %L::uuid)',
          rec.schema_name, v_table, rec.id
        );
      END IF;
    END LOOP;
  END LOOP;
END$$;
