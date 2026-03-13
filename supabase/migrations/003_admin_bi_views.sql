-- =============================================================================
-- 003_admin_bi_views.sql
-- Función de inteligencia de negocio para el panel de administración.
-- Devuelve stats por tenant sin depender de schemas dinámicos desde SQL.
-- Los conteos se actualizan mediante una tabla de métricas que cada schema
-- actualiza con triggers (ver 004_tenant_metrics_triggers.sql).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- public.tenant_metrics
-- Tabla de métricas agregadas por tenant — actualizada por triggers en cada
-- schema de tenant. Evita hacer queries dinámicas en tiempo de lectura.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_metrics (
    tenant_id           uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    company_count       int  NOT NULL DEFAULT 0,
    employee_count      int  NOT NULL DEFAULT 0,  -- total en todas las empresas
    payroll_run_count   int  NOT NULL DEFAULT 0,
    last_activity_at    timestamptz NULL,          -- última confirmación de nómina
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Inicializar métricas en 0 cuando se crea un tenant
CREATE OR REPLACE FUNCTION public.init_tenant_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.tenant_metrics (tenant_id)
    VALUES (NEW.id)
    ON CONFLICT (tenant_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_tenant_created_init_metrics ON public.tenants;
CREATE TRIGGER on_tenant_created_init_metrics
    AFTER INSERT ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.init_tenant_metrics();

-- ---------------------------------------------------------------------------
-- public.admin_tenant_overview  (vista)
-- Vista principal del panel admin — joins tenants + plan + metrics + email
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.admin_tenant_overview AS
SELECT
    t.id                        AS tenant_id,
    u.email                     AS email,
    p.name                      AS plan_name,
    p.max_companies             AS plan_max_companies,
    p.max_employees_per_company AS plan_max_employees,
    t.status,
    t.billing_cycle,
    t.schema_name,
    t.current_period_start,
    t.current_period_end,
    t.last_payment_at,
    t.created_at                AS tenant_since,
    COALESCE(m.company_count, 0)     AS company_count,
    COALESCE(m.employee_count, 0)    AS employee_count,
    COALESCE(m.payroll_run_count, 0) AS payroll_run_count,
    m.last_activity_at
FROM public.tenants            t
JOIN auth.users                u ON u.id = t.id
JOIN public.plans              p ON p.id = t.plan_id
LEFT JOIN public.tenant_metrics m ON m.tenant_id = t.id
ORDER BY t.created_at DESC;

-- Solo admins pueden leer esta vista
REVOKE ALL ON public.admin_tenant_overview FROM anon, authenticated;
GRANT SELECT ON public.admin_tenant_overview TO authenticated;
-- La restricción real se aplica via RLS o comprobación is_admin() en el API route.

-- ---------------------------------------------------------------------------
-- public.is_admin(user_id)
-- Helper usado en API routes y políticas para verificar si un usuario es admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users WHERE id = p_user_id
    );
$$;

-- ---------------------------------------------------------------------------
-- public.get_platform_summary()
-- KPIs globales de la plataforma para el dashboard de admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_platform_summary()
RETURNS TABLE (
    total_tenants       bigint,
    active_tenants      bigint,
    trial_tenants       bigint,
    suspended_tenants   bigint,
    total_companies     bigint,
    total_employees     bigint,
    total_payroll_runs  bigint,
    pending_payments    bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT
        COUNT(*)                                           AS total_tenants,
        COUNT(*) FILTER (WHERE t.status = 'active')        AS active_tenants,
        COUNT(*) FILTER (WHERE t.status = 'trial')         AS trial_tenants,
        COUNT(*) FILTER (WHERE t.status = 'suspended')     AS suspended_tenants,
        COALESCE(SUM(m.company_count), 0)                  AS total_companies,
        COALESCE(SUM(m.employee_count), 0)                 AS total_employees,
        COALESCE(SUM(m.payroll_run_count), 0)              AS total_payroll_runs,
        (SELECT COUNT(*) FROM public.payment_requests WHERE status = 'pending') AS pending_payments
    FROM public.tenants t
    LEFT JOIN public.tenant_metrics m ON m.tenant_id = t.id;
$$;
