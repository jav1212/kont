-- =============================================================================
-- 085_employees_porcentaje_islr.sql
-- Agrega columna `porcentaje_islr` a la tabla employees de cada tenant para
-- soportar la generación del XML mensual de Retenciones ISLR (SENIAT). Cada
-- empleado lleva su propio porcentaje declarado en el AR-I (default 0).
--
-- Cambios:
--   1. ALTER TABLE para los tenants ya provisionados (idempotente).
--   2. provision_tenant_schema con la columna en el CREATE TABLE +
--      safeguard ALTER por si algún tenant existente no la tuviera.
--   3. tenant_employees_get_by_company devuelve porcentaje_islr.
--   4. tenant_employees_upsert acepta porcentaje_islr (default 0).
--
-- Anterior: 084_provision_tenant_companies_full_columns.sql
-- =============================================================================

-- 1. Agregar la columna a todos los tenants existentes
DO $$
DECLARE rec RECORD;
BEGIN
    FOR rec IN SELECT schema_name FROM public.tenants LOOP
        EXECUTE format(
            'ALTER TABLE %I.employees ADD COLUMN IF NOT EXISTS porcentaje_islr numeric(5,2) NOT NULL DEFAULT 0',
            rec.schema_name
        );
    END LOOP;
END;
$$;

-- 2. Refrescar provision_tenant_schema para tenants nuevos
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

    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon', v_schema);

    -- companies
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.companies (
            id               text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            owner_id         text        NOT NULL,
            name             text        NOT NULL,
            rif              text,
            phone            text,
            address          text,
            logo_url         text,
            show_logo_in_pdf boolean     NOT NULL DEFAULT false,
            sector           text,
            taxpayer_type    text        NOT NULL DEFAULT 'ordinario'
                                         CHECK (taxpayer_type IN ('ordinario', 'especial')),
            contact_email    text,
            inventory_config jsonb       NOT NULL DEFAULT '{}'::jsonb,
            created_at       timestamptz NOT NULL DEFAULT now(),
            updated_at       timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema);

    EXECUTE format('ALTER TABLE %I.companies ADD COLUMN IF NOT EXISTS rif text',           v_schema);
    EXECUTE format('ALTER TABLE %I.companies ADD COLUMN IF NOT EXISTS phone text',         v_schema);
    EXECUTE format('ALTER TABLE %I.companies ADD COLUMN IF NOT EXISTS address text',       v_schema);
    EXECUTE format('ALTER TABLE %I.companies ADD COLUMN IF NOT EXISTS logo_url text',      v_schema);
    EXECUTE format('ALTER TABLE %I.companies ADD COLUMN IF NOT EXISTS show_logo_in_pdf boolean NOT NULL DEFAULT false', v_schema);
    EXECUTE format('ALTER TABLE %I.companies ADD COLUMN IF NOT EXISTS sector text',        v_schema);
    EXECUTE format(
        'ALTER TABLE %I.companies ADD COLUMN IF NOT EXISTS taxpayer_type text NOT NULL DEFAULT ''ordinario'' CHECK (taxpayer_type IN (''ordinario'', ''especial''))',
        v_schema
    );
    EXECUTE format('ALTER TABLE %I.companies ADD COLUMN IF NOT EXISTS contact_email text', v_schema);
    EXECUTE format('ALTER TABLE %I.companies ADD COLUMN IF NOT EXISTS inventory_config jsonb NOT NULL DEFAULT ''{}''::jsonb', v_schema);

    -- employees (incluye porcentaje_islr para tenants nuevos)
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.employees (
            id              text          PRIMARY KEY,
            company_id      text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            cedula          text          NOT NULL,
            nombre          text          NOT NULL,
            cargo           text          NOT NULL DEFAULT '',
            salario_mensual numeric(14,2) NOT NULL DEFAULT 0,
            estado          text          NOT NULL DEFAULT 'activo',
            porcentaje_islr numeric(5,2)  NOT NULL DEFAULT 0,
            created_at      timestamptz   NOT NULL DEFAULT now(),
            updated_at      timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    -- Safeguard: completa la columna si la tabla existía sin ella
    EXECUTE format(
        'ALTER TABLE %I.employees ADD COLUMN IF NOT EXISTS porcentaje_islr numeric(5,2) NOT NULL DEFAULT 0',
        v_schema
    );

    EXECUTE format('CREATE INDEX IF NOT EXISTS employees_company_idx ON %I.employees(company_id)', v_schema);

    -- payroll_runs
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

    -- payroll_receipts
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

    -- cesta_ticket_runs
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.cesta_ticket_runs (
            id            text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id    text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            period_start  date          NOT NULL,
            period_end    date          NOT NULL,
            monto_usd     numeric(14,2) NOT NULL,
            exchange_rate numeric(14,4) NOT NULL,
            status        text          NOT NULL DEFAULT 'confirmed',
            confirmed_at  timestamptz   NOT NULL DEFAULT now(),
            created_at    timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS cesta_ticket_runs_company_idx ON %I.cesta_ticket_runs(company_id)', v_schema);

    -- cesta_ticket_receipts
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.cesta_ticket_receipts (
            id              text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            run_id          text          NOT NULL REFERENCES %I.cesta_ticket_runs(id) ON DELETE CASCADE,
            company_id      text          NOT NULL REFERENCES %I.companies(id),
            employee_id     text          NOT NULL,
            employee_cedula text          NOT NULL,
            employee_nombre text          NOT NULL,
            employee_cargo  text          NOT NULL DEFAULT '',
            monto_usd       numeric(14,2) NOT NULL,
            monto_ves       numeric(14,2) NOT NULL,
            created_at      timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS cesta_ticket_receipts_run_idx     ON %I.cesta_ticket_receipts(run_id)',     v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS cesta_ticket_receipts_company_idx ON %I.cesta_ticket_receipts(company_id)', v_schema);

    EXECUTE format('ALTER TABLE %I.companies              ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employees              ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_runs           ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_receipts       ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.cesta_ticket_runs      ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.cesta_ticket_receipts  ENABLE ROW LEVEL SECURITY', v_schema);

    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.companies',              v_schema);
    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.employees',              v_schema);
    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.payroll_runs',           v_schema);
    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.payroll_receipts',       v_schema);
    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.cesta_ticket_runs',      v_schema);
    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.cesta_ticket_receipts',  v_schema);

    EXECUTE format('CREATE POLICY tenant_owner ON %I.companies FOR ALL USING (auth.uid() = %L::uuid)',              v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.employees FOR ALL USING (auth.uid() = %L::uuid)',              v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_runs FOR ALL USING (auth.uid() = %L::uuid)',           v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_receipts FOR ALL USING (auth.uid() = %L::uuid)',       v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.cesta_ticket_runs FOR ALL USING (auth.uid() = %L::uuid)',      v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.cesta_ticket_receipts FOR ALL USING (auth.uid() = %L::uuid)',  v_schema, p_user_id);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', v_schema);

    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;
END;
$$;

-- 3. Actualizar tenant_employees_get_by_company para devolver porcentaje_islr
DROP FUNCTION IF EXISTS public.tenant_employees_get_by_company(uuid, text);

CREATE FUNCTION public.tenant_employees_get_by_company(p_user_id uuid, p_company_id text)
RETURNS TABLE (
    id              text,
    company_id      text,
    cedula          text,
    nombre          text,
    cargo           text,
    salario_mensual numeric,
    estado          text,
    fecha_ingreso   date,
    moneda          text,
    porcentaje_islr numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    RETURN QUERY EXECUTE format(
        'SELECT id::text, company_id::text, cedula, nombre, cargo,
                salario_mensual, estado, fecha_ingreso,
                COALESCE(moneda::text, ''VES'') AS moneda,
                COALESCE(porcentaje_islr, 0)   AS porcentaje_islr
         FROM %I.employees
         WHERE company_id = $1
         ORDER BY nombre ASC',
        v_schema
    ) USING p_company_id;
END;
$$;

-- 4. Actualizar tenant_employees_upsert para aceptar porcentaje_islr
DROP FUNCTION IF EXISTS public.tenant_employees_upsert(uuid, jsonb);

CREATE FUNCTION public.tenant_employees_upsert(p_user_id uuid, p_employees jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'INSERT INTO %I.employees
           (id, company_id, cedula, nombre, cargo, salario_mensual, estado, fecha_ingreso, moneda, porcentaje_islr)
         SELECT
           (e->>''id'')::text,
           (e->>''company_id'')::text,
           (e->>''cedula'')::text,
           (e->>''nombre'')::text,
           (e->>''cargo'')::text,
           (e->>''salario_mensual'')::numeric,
           (e->>''estado'')::text,
           NULLIF(e->>''fecha_ingreso'', '''')::date,
           COALESCE(NULLIF(e->>''moneda'', ''''), ''VES''),
           COALESCE(NULLIF(e->>''porcentaje_islr'', '''')::numeric, 0)
         FROM jsonb_array_elements($1) AS e
         ON CONFLICT (id) DO UPDATE SET
           nombre          = EXCLUDED.nombre,
           cargo           = EXCLUDED.cargo,
           salario_mensual = EXCLUDED.salario_mensual,
           estado          = EXCLUDED.estado,
           fecha_ingreso   = EXCLUDED.fecha_ingreso,
           moneda          = EXCLUDED.moneda,
           porcentaje_islr = EXCLUDED.porcentaje_islr,
           updated_at      = now()',
        v_schema
    ) USING p_employees;
END;
$$;
