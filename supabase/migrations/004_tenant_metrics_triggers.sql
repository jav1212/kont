-- =============================================================================
-- 004_tenant_metrics_triggers.sql
-- Función centralizada para actualizar public.tenant_metrics desde cualquier
-- schema de tenant.
-- Cada schema de tenant llama a esta función con su tenant_id cuando hay
-- cambios en companies, employees o payroll_runs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- public.refresh_tenant_metrics(p_tenant_id)
-- Recalcula los conteos de un tenant leyendo directamente su schema.
-- Llamada en cascada desde los triggers de cada tabla de tenant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_tenant_metrics(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema            text;
    v_company_count     int;
    v_employee_count    int;
    v_run_count         int;
    v_last_activity     timestamptz;
BEGIN
    SELECT schema_name INTO v_schema
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF v_schema IS NULL THEN RETURN; END IF;

    EXECUTE format('SELECT COUNT(*) FROM %I.companies',     v_schema) INTO v_company_count;
    EXECUTE format('SELECT COUNT(*) FROM %I.employees',     v_schema) INTO v_employee_count;
    EXECUTE format('SELECT COUNT(*) FROM %I.payroll_runs',  v_schema) INTO v_run_count;
    EXECUTE format('SELECT MAX(confirmed_at) FROM %I.payroll_runs', v_schema) INTO v_last_activity;

    INSERT INTO public.tenant_metrics (tenant_id, company_count, employee_count, payroll_run_count, last_activity_at, updated_at)
    VALUES (p_tenant_id, v_company_count, v_employee_count, v_run_count, v_last_activity, now())
    ON CONFLICT (tenant_id) DO UPDATE SET
        company_count     = EXCLUDED.company_count,
        employee_count    = EXCLUDED.employee_count,
        payroll_run_count = EXCLUDED.payroll_run_count,
        last_activity_at  = EXCLUDED.last_activity_at,
        updated_at        = now();
END;
$$;

-- ---------------------------------------------------------------------------
-- Añadir triggers de métricas al provisioning function
-- Se inyectan en cada tabla del tenant recién creado.
-- Los triggers llaman a refresh_tenant_metrics con el tenant_id hardcoded.
-- ---------------------------------------------------------------------------

-- Reemplazamos la función de provisioning para añadir los triggers de métricas
CREATE OR REPLACE FUNCTION public.provision_tenant_schema(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema    text;
    v_plan_id   uuid;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    SELECT id INTO v_plan_id FROM public.plans WHERE name = 'Emprendedor' LIMIT 1;

    -- 1. Schema
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);

    -- 2. Permisos
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon', v_schema);

    -- 3. companies
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.companies (
            id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            owner_id    text        NOT NULL,
            name        text        NOT NULL,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema);

    -- 4. employees
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.employees (
            id              text        PRIMARY KEY,
            company_id      text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            cedula          text        NOT NULL,
            nombre          text        NOT NULL,
            cargo           text        NOT NULL DEFAULT '',
            salario_mensual numeric(14,2) NOT NULL DEFAULT 0,
            estado          text        NOT NULL DEFAULT 'activo',
            created_at      timestamptz NOT NULL DEFAULT now(),
            updated_at      timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS employees_company_idx ON %I.employees(company_id)', v_schema);

    -- 5. payroll_runs
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.payroll_runs (
            id            text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id    text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            period_start  date        NOT NULL,
            period_end    date        NOT NULL,
            exchange_rate numeric(14,4) NOT NULL,
            status        text        NOT NULL DEFAULT 'confirmed',
            confirmed_at  timestamptz NOT NULL DEFAULT now(),
            created_at    timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_runs_company_idx ON %I.payroll_runs(company_id)', v_schema);

    -- 6. payroll_receipts
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.payroll_receipts (
            id                text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            run_id            text        NOT NULL REFERENCES %I.payroll_runs(id) ON DELETE CASCADE,
            company_id        text        NOT NULL REFERENCES %I.companies(id),
            employee_id       text        NOT NULL,
            employee_cedula   text        NOT NULL,
            employee_nombre   text        NOT NULL,
            employee_cargo    text        NOT NULL DEFAULT '',
            monthly_salary    numeric(14,2) NOT NULL DEFAULT 0,
            total_earnings    numeric(14,2) NOT NULL DEFAULT 0,
            total_deductions  numeric(14,2) NOT NULL DEFAULT 0,
            total_bonuses     numeric(14,2) NOT NULL DEFAULT 0,
            net_pay           numeric(14,2) NOT NULL DEFAULT 0,
            calculation_data  jsonb       NOT NULL DEFAULT '{}',
            created_at        timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_run_idx     ON %I.payroll_receipts(run_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_company_idx ON %I.payroll_receipts(company_id)', v_schema);

    -- 7. RLS
    EXECUTE format('ALTER TABLE %I.companies         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employees         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_runs      ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_receipts  ENABLE ROW LEVEL SECURITY', v_schema);

    EXECUTE format('CREATE POLICY tenant_owner ON %I.companies        FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.employees        FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_runs     FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_receipts FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);

    -- 8. Permisos DML
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', v_schema);

    -- 9. Triggers de métricas en companies, employees y payroll_runs
    --    El trigger llama a refresh_tenant_metrics con el UUID del owner fijo.
    EXECUTE format($fn$
        CREATE OR REPLACE FUNCTION %I.sync_metrics()
        RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS
        'BEGIN PERFORM public.refresh_tenant_metrics(%L::uuid); RETURN NULL; END;'
    $fn$, v_schema, p_user_id);

    EXECUTE format('CREATE TRIGGER metrics_sync AFTER INSERT OR UPDATE OR DELETE ON %I.companies     FOR EACH STATEMENT EXECUTE FUNCTION %I.sync_metrics()', v_schema, v_schema);
    EXECUTE format('CREATE TRIGGER metrics_sync AFTER INSERT OR UPDATE OR DELETE ON %I.employees     FOR EACH STATEMENT EXECUTE FUNCTION %I.sync_metrics()', v_schema, v_schema);
    EXECUTE format('CREATE TRIGGER metrics_sync AFTER INSERT OR UPDATE OR DELETE ON %I.payroll_runs  FOR EACH STATEMENT EXECUTE FUNCTION %I.sync_metrics()', v_schema, v_schema);

    -- 10. Registrar en public.tenants
    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;

END;
$$;
