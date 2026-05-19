-- =============================================================================
-- 107_admin_tenant_overview_fix_service_role_access.sql
--
-- Fix: la migración 098 recreó `admin_tenant_overview` con
-- `security_invoker = true`. Eso hace que los JOIN internos se evalúen con
-- los privilegios del llamador (service_role), pero `service_role` NO tiene
-- SELECT en `auth.users` (sólo `postgres` lo tiene). Resultado: el endpoint
-- `/api/admin/tenants` devuelve 500 con
--   ERROR 42501: permission denied for table users
--
-- Solución: recrear la vista SIN `security_invoker`, dejando que herede los
-- privilegios del dueño (`postgres`) para resolver el JOIN a `auth.users`.
-- El lockdown introducido por 098 sigue intacto porque la vista mantiene:
--   REVOKE ALL FROM anon, authenticated, public
--   GRANT  SELECT TO   service_role
-- → sólo service_role (vía el backend de Next) puede leerla.
-- =============================================================================

DROP VIEW IF EXISTS public.admin_tenant_overview;

CREATE VIEW public.admin_tenant_overview AS
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
