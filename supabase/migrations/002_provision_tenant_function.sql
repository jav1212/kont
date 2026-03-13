-- =============================================================================
-- 002_provision_tenant_function.sql
-- Función que crea el schema privado de un tenant con todas sus tablas,
-- más el trigger que la invoca al registrar un nuevo usuario en auth.users
-- =============================================================================

-- ---------------------------------------------------------------------------
-- provision_tenant_schema(user_id)
-- Crea el schema `tenant_<uuid>` y todas las tablas operativas del tenant.
-- Llamada por el trigger on_auth_user_created (más abajo).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_tenant_schema(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- corre como el owner (postgres) para poder crear schemas
SET search_path = public
AS $$
DECLARE
    v_schema    text;
    v_plan_id   uuid;
BEGIN
    -- Nombre del schema: tenant_ + UUID sin guiones (e.g. tenant_550e8400e29b41d4a716446655440000)
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    -- Obtener el plan por defecto (Emprendedor)
    SELECT id INTO v_plan_id FROM public.plans WHERE name = 'Emprendedor' LIMIT 1;

    -- -------------------------------------------------------------------------
    -- 1. Crear el schema
    -- -------------------------------------------------------------------------
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);

    -- -------------------------------------------------------------------------
    -- 2. Permisos: el rol "authenticated" necesita USAGE para que el cliente
    --    Supabase pueda hacer .schema(name).from(table)
    -- -------------------------------------------------------------------------
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon', v_schema);

    -- -------------------------------------------------------------------------
    -- 3. Tabla: companies
    -- -------------------------------------------------------------------------
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.companies (
            id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            owner_id    text        NOT NULL,
            name        text        NOT NULL,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema);

    -- -------------------------------------------------------------------------
    -- 4. Tabla: employees
    -- -------------------------------------------------------------------------
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.employees (
            id              text        PRIMARY KEY,  -- = cedula
            company_id      text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            cedula          text        NOT NULL,
            nombre          text        NOT NULL,
            cargo           text        NOT NULL DEFAULT '',
            salario_mensual numeric(14,2) NOT NULL DEFAULT 0,  -- VES (Bolívares)
            estado          text        NOT NULL DEFAULT 'activo',
            created_at      timestamptz NOT NULL DEFAULT now(),
            updated_at      timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS employees_company_idx ON %I.employees(company_id)', v_schema);

    -- -------------------------------------------------------------------------
    -- 5. Tabla: payroll_runs
    -- -------------------------------------------------------------------------
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

    -- -------------------------------------------------------------------------
    -- 6. Tabla: payroll_receipts
    -- -------------------------------------------------------------------------
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

    -- -------------------------------------------------------------------------
    -- 7. RLS en todas las tablas del schema
    --    Política: solo el owner (auth.uid() = p_user_id) tiene acceso
    -- -------------------------------------------------------------------------
    EXECUTE format('ALTER TABLE %I.companies         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employees         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_runs      ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_receipts  ENABLE ROW LEVEL SECURITY', v_schema);

    -- La política usa un UUID literal embebido en tiempo de provisioning
    -- Esto asegura que aunque alguien conozca el nombre del schema, no pueda leerlo
    EXECUTE format(
        'CREATE POLICY tenant_owner ON %I.companies FOR ALL USING (auth.uid() = %L::uuid)',
        v_schema, p_user_id
    );
    EXECUTE format(
        'CREATE POLICY tenant_owner ON %I.employees FOR ALL USING (auth.uid() = %L::uuid)',
        v_schema, p_user_id
    );
    EXECUTE format(
        'CREATE POLICY tenant_owner ON %I.payroll_runs FOR ALL USING (auth.uid() = %L::uuid)',
        v_schema, p_user_id
    );
    EXECUTE format(
        'CREATE POLICY tenant_owner ON %I.payroll_receipts FOR ALL USING (auth.uid() = %L::uuid)',
        v_schema, p_user_id
    );

    -- -------------------------------------------------------------------------
    -- 8. Otorgar permisos DML al rol authenticated sobre las tablas
    -- -------------------------------------------------------------------------
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);

    -- Asegurar que tablas futuras (si se añaden columnas/tablas via migración) también reciban el grant
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', v_schema);

    -- -------------------------------------------------------------------------
    -- 9. Registrar el tenant en public.tenants
    -- -------------------------------------------------------------------------
    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;

END;
$$;

-- ---------------------------------------------------------------------------
-- Trigger function: invocada por auth.users ON INSERT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_auth_user_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.provision_tenant_schema(NEW.id);
    RETURN NEW;
END;
$$;

-- Crear el trigger (idempotente: drop + create)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.on_auth_user_created();
