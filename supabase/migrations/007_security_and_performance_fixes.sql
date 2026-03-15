-- =============================================================================
-- 007_security_and_performance_fixes.sql
-- Corrige todos los advisories de seguridad y rendimiento detectados:
--
--  [ERROR]  1. RLS desactivado en public.tenant_metrics
--  [ERROR]  2. Vista admin_tenant_overview expone auth.users a `authenticated`
--  [WARN]   3. search_path mutable en fn_record_salary_change,
--              fn_record_initial_salary, is_admin, get_platform_summary,
--              sync_metrics (schema tenant)
--  [WARN]   4. auth_rls_initplan — auth.uid() sin SELECT en políticas RLS
--              (public.tenants, payment_requests, admin_users + schemas tenant)
--  [INFO]   5. FK sin índice: payment_requests.plan_id, reviewed_by
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Habilitar RLS en public.tenant_metrics + políticas
--    La tabla sólo la escribe SECURITY DEFINER (triggers/funciones internas).
--    Usuarios autenticados sólo leen su propia fila; admins hacen todo.
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenant_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_metrics_self_read" ON public.tenant_metrics
    FOR SELECT USING ((SELECT auth.uid()) = tenant_id);

CREATE POLICY "tenant_metrics_admin_all" ON public.tenant_metrics
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.admin_users WHERE id = (SELECT auth.uid()))
    );

-- ---------------------------------------------------------------------------
-- 2. Revocar SELECT sobre admin_tenant_overview de `authenticated`
--    Las rutas admin usan service_role (ServerSupabaseSource), no el JWT
--    del usuario. Exponer la vista al rol authenticated es innecesario.
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.admin_tenant_overview FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fijar search_path en funciones con path mutable
-- ---------------------------------------------------------------------------

-- 3a. fn_record_salary_change (trigger)
CREATE OR REPLACE FUNCTION public.fn_record_salary_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.salario_mensual IS DISTINCT FROM NEW.salario_mensual
    OR OLD.moneda          IS DISTINCT FROM NEW.moneda
    THEN
        EXECUTE format(
            'INSERT INTO %I.employee_salary_history
               (employee_cedula, company_id, salario_mensual, moneda, fecha_desde)
             VALUES ($1, $2, $3, $4, $5)',
            TG_TABLE_SCHEMA
        ) USING NEW.cedula, NEW.company_id, NEW.salario_mensual, NEW.moneda, CURRENT_DATE;
    END IF;
    RETURN NEW;
END;
$$;

-- 3b. fn_record_initial_salary (trigger)
CREATE OR REPLACE FUNCTION public.fn_record_initial_salary()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    EXECUTE format(
        'INSERT INTO %I.employee_salary_history
           (employee_cedula, company_id, salario_mensual, moneda, fecha_desde)
         VALUES ($1, $2, $3, $4, $5)',
        TG_TABLE_SCHEMA
    ) USING NEW.cedula, NEW.company_id, NEW.salario_mensual, NEW.moneda,
            COALESCE(NEW.fecha_ingreso, CURRENT_DATE);
    RETURN NEW;
END;
$$;

-- 3c. is_admin
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users WHERE id = p_user_id
    );
$$;

-- 3d. get_platform_summary
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
SET search_path = public, pg_temp
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

-- ---------------------------------------------------------------------------
-- 4a. Corregir auth_rls_initplan en public.tenants
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenants_self_read"   ON public.tenants;
DROP POLICY IF EXISTS "tenants_self_update" ON public.tenants;
DROP POLICY IF EXISTS "tenants_admin_all"   ON public.tenants;

CREATE POLICY "tenants_self_read" ON public.tenants
    FOR SELECT USING ((SELECT auth.uid()) = id);

CREATE POLICY "tenants_self_update" ON public.tenants
    FOR UPDATE USING ((SELECT auth.uid()) = id);

CREATE POLICY "tenants_admin_all" ON public.tenants
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.admin_users WHERE id = (SELECT auth.uid()))
    );

-- ---------------------------------------------------------------------------
-- 4b. Corregir auth_rls_initplan en public.payment_requests
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "payment_requests_tenant_read"   ON public.payment_requests;
DROP POLICY IF EXISTS "payment_requests_tenant_insert" ON public.payment_requests;
DROP POLICY IF EXISTS "payment_requests_admin_all"     ON public.payment_requests;

CREATE POLICY "payment_requests_tenant_read" ON public.payment_requests
    FOR SELECT USING (tenant_id = (SELECT auth.uid()));

CREATE POLICY "payment_requests_tenant_insert" ON public.payment_requests
    FOR INSERT WITH CHECK (tenant_id = (SELECT auth.uid()));

CREATE POLICY "payment_requests_admin_all" ON public.payment_requests
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.admin_users WHERE id = (SELECT auth.uid()))
    );

-- ---------------------------------------------------------------------------
-- 4c. Corregir auth_rls_initplan en public.admin_users
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_users_self" ON public.admin_users;

CREATE POLICY "admin_users_self" ON public.admin_users
    FOR SELECT USING ((SELECT auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- 4d. Corregir políticas tenant_owner en schemas existentes
--     + arreglar search_path de sync_metrics
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    rec       record;
    v_user_id uuid;
BEGIN
    FOR rec IN SELECT id, schema_name FROM public.tenants LOOP
        v_user_id := rec.id;

        -- Recrear políticas con (select auth.uid())
        EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.companies',               rec.schema_name);
        EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.employees',               rec.schema_name);
        EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.employee_salary_history', rec.schema_name);
        EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.payroll_runs',            rec.schema_name);
        EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.payroll_receipts',        rec.schema_name);

        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.companies               FOR ALL USING ((SELECT auth.uid()) = %L::uuid)',
            rec.schema_name, v_user_id);
        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.employees               FOR ALL USING ((SELECT auth.uid()) = %L::uuid)',
            rec.schema_name, v_user_id);
        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.employee_salary_history FOR ALL USING ((SELECT auth.uid()) = %L::uuid)',
            rec.schema_name, v_user_id);
        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.payroll_runs            FOR ALL USING ((SELECT auth.uid()) = %L::uuid)',
            rec.schema_name, v_user_id);
        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.payroll_receipts        FOR ALL USING ((SELECT auth.uid()) = %L::uuid)',
            rec.schema_name, v_user_id);

        -- Recrear sync_metrics con SET search_path
        EXECUTE format(
            'CREATE OR REPLACE FUNCTION %I.sync_metrics() '
            'RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER '
            'SET search_path = public, pg_temp AS '
            '$body$ BEGIN PERFORM public.refresh_tenant_metrics(%L::uuid); RETURN NULL; END; $body$',
            rec.schema_name, v_user_id
        );
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4e. Actualizar provision_tenant_schema para futuros tenants
--     - (select auth.uid()) en políticas RLS
--     - SET search_path en sync_metrics
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_tenant_schema(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema  text;
    v_plan_id uuid;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    SELECT id INTO v_plan_id FROM public.plans WHERE name = 'Emprendedor' LIMIT 1;

    -- 1. Schema + permisos
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon', v_schema);

    -- 2. companies
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.companies (
            id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            owner_id    text        NOT NULL,
            name        text        NOT NULL,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema);

    -- 3. employees
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.employees (
            id              text          PRIMARY KEY,
            company_id      text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            cedula          text          NOT NULL,
            nombre          text          NOT NULL,
            cargo           text          NOT NULL DEFAULT '',
            salario_mensual numeric(14,2) NOT NULL DEFAULT 0,
            moneda          varchar(3)    NOT NULL DEFAULT 'VES',
            estado          text          NOT NULL DEFAULT 'activo',
            fecha_ingreso   date,
            created_at      timestamptz   NOT NULL DEFAULT now(),
            updated_at      timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS employees_company_idx ON %I.employees(company_id)', v_schema);

    -- 4. employee_salary_history
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.employee_salary_history (
            id              uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
            employee_cedula text          NOT NULL,
            company_id      text          NOT NULL,
            salario_mensual numeric(12,2) NOT NULL,
            moneda          varchar(3)    NOT NULL DEFAULT 'VES',
            fecha_desde     date          NOT NULL DEFAULT CURRENT_DATE,
            created_at      timestamptz   DEFAULT now()
        )
    $tbl$, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_salary_history_emp ON %I.employee_salary_history (company_id, employee_cedula, fecha_desde DESC)', v_schema);

    -- 5. payroll_runs
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.payroll_runs (
            id            text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id    text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            period_start  date          NOT NULL,
            period_end    date          NOT NULL,
            exchange_rate numeric(14,4) NOT NULL,
            status        text          NOT NULL DEFAULT 'confirmed',
            confirmed_at  timestamptz   NOT NULL DEFAULT now(),
            created_at    timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_runs_company_idx ON %I.payroll_runs(company_id)', v_schema);

    -- 6. payroll_receipts
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.payroll_receipts (
            id               text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            run_id           text          NOT NULL REFERENCES %I.payroll_runs(id) ON DELETE CASCADE,
            company_id       text          NOT NULL REFERENCES %I.companies(id),
            employee_id      text          NOT NULL,
            employee_cedula  text          NOT NULL,
            employee_nombre  text          NOT NULL,
            employee_cargo   text          NOT NULL DEFAULT '',
            monthly_salary   numeric(14,2) NOT NULL DEFAULT 0,
            total_earnings   numeric(14,2) NOT NULL DEFAULT 0,
            total_deductions numeric(14,2) NOT NULL DEFAULT 0,
            total_bonuses    numeric(14,2) NOT NULL DEFAULT 0,
            net_pay          numeric(14,2) NOT NULL DEFAULT 0,
            calculation_data jsonb         NOT NULL DEFAULT '{}',
            created_at       timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_run_idx     ON %I.payroll_receipts(run_id)',     v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_company_idx ON %I.payroll_receipts(company_id)', v_schema);

    -- 7. RLS
    EXECUTE format('ALTER TABLE %I.companies               ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employees               ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employee_salary_history ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_runs            ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_receipts        ENABLE ROW LEVEL SECURITY', v_schema);

    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.companies',               v_schema);
    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.employees',               v_schema);
    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.employee_salary_history', v_schema);
    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.payroll_runs',            v_schema);
    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.payroll_receipts',        v_schema);

    EXECUTE format('CREATE POLICY tenant_owner ON %I.companies               FOR ALL USING ((SELECT auth.uid()) = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.employees               FOR ALL USING ((SELECT auth.uid()) = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.employee_salary_history FOR ALL USING ((SELECT auth.uid()) = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_runs            FOR ALL USING ((SELECT auth.uid()) = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_receipts        FOR ALL USING ((SELECT auth.uid()) = %L::uuid)', v_schema, p_user_id);

    -- 8. Permisos DML
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', v_schema);

    -- 9. Triggers de métricas (con search_path fijo)
    EXECUTE format('DROP TRIGGER IF EXISTS metrics_sync ON %I.companies',    v_schema);
    EXECUTE format('DROP TRIGGER IF EXISTS metrics_sync ON %I.employees',    v_schema);
    EXECUTE format('DROP TRIGGER IF EXISTS metrics_sync ON %I.payroll_runs', v_schema);

    EXECUTE format(
        'CREATE OR REPLACE FUNCTION %I.sync_metrics() '
        'RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER '
        'SET search_path = public, pg_temp AS '
        '$body$ BEGIN PERFORM public.refresh_tenant_metrics(%L::uuid); RETURN NULL; END; $body$',
        v_schema, p_user_id
    );

    EXECUTE format('CREATE TRIGGER metrics_sync AFTER INSERT OR UPDATE OR DELETE ON %I.companies    FOR EACH STATEMENT EXECUTE FUNCTION %I.sync_metrics()', v_schema, v_schema);
    EXECUTE format('CREATE TRIGGER metrics_sync AFTER INSERT OR UPDATE OR DELETE ON %I.employees    FOR EACH STATEMENT EXECUTE FUNCTION %I.sync_metrics()', v_schema, v_schema);
    EXECUTE format('CREATE TRIGGER metrics_sync AFTER INSERT OR UPDATE OR DELETE ON %I.payroll_runs FOR EACH STATEMENT EXECUTE FUNCTION %I.sync_metrics()', v_schema, v_schema);

    -- 10. Triggers de historial de salario
    EXECUTE format('DROP TRIGGER IF EXISTS trg_salary_change  ON %I.employees', v_schema);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_initial_salary ON %I.employees', v_schema);

    EXECUTE format('CREATE TRIGGER trg_salary_change  AFTER UPDATE ON %I.employees FOR EACH ROW EXECUTE FUNCTION public.fn_record_salary_change()',  v_schema);
    EXECUTE format('CREATE TRIGGER trg_initial_salary AFTER INSERT ON %I.employees FOR EACH ROW EXECUTE FUNCTION public.fn_record_initial_salary()', v_schema);

    -- 11. Registrar tenant
    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;

END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Agregar índices faltantes en payment_requests (FKs sin índice)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS payment_requests_plan_id_idx
    ON public.payment_requests(plan_id);

CREATE INDEX IF NOT EXISTS payment_requests_reviewed_by_idx
    ON public.payment_requests(reviewed_by);
