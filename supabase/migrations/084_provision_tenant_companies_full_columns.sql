-- =============================================================================
-- 084_provision_tenant_companies_full_columns.sql
-- Refresca public.provision_tenant_schema para que el CREATE TABLE companies
-- incluya taxpayer_type y contact_email. Hasta 078 estos campos sólo se
-- añadían vía DO blocks en 065 y 077, lo que dejaba a los tenants creados
-- después con la tabla incompleta y rompía tenant_company_update / tenant_company_save.
--
-- Anterior: 083_inventory_factura_total_post_retencion.sql
-- =============================================================================

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

    -- companies (incluye taxpayer_type y contact_email para tenants nuevos)
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

    -- Salvaguarda: si un tenant existente tenía la tabla pero sin estas columnas,
    -- las completa también desde aquí (idempotente).
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

    -- employees
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.employees (
            id              text          PRIMARY KEY,
            company_id      text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            cedula          text          NOT NULL,
            nombre          text          NOT NULL,
            cargo           text          NOT NULL DEFAULT '',
            salario_mensual numeric(14,2) NOT NULL DEFAULT 0,
            estado          text          NOT NULL DEFAULT 'activo',
            created_at      timestamptz   NOT NULL DEFAULT now(),
            updated_at      timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

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
