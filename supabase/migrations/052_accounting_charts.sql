-- ============================================================================
-- 052 — Accounting Charts (Plan de Cuentas)
--
-- Adds:
--   public.plans             — max_charts_per_company column
--   accounting_charts        — named chart-of-accounts header per company
--   accounting_accounts      — chart_id FK, is_group column
--   RPC functions            — chart CRUD + bulk import with plan-limit enforcement
-- ============================================================================

-- ── 1. Plan limits ────────────────────────────────────────────────────────────

ALTER TABLE public.plans
    ADD COLUMN IF NOT EXISTS max_charts_per_company integer;

-- Gratuito / Estudiante / Emprendedor → 1 chart per company
UPDATE public.plans SET max_charts_per_company = 1
WHERE name IN ('Gratuito', 'Estudiante', 'Emprendedor');

-- Contable → 2 charts per company
UPDATE public.plans SET max_charts_per_company = 2
WHERE name = 'Contable';

-- Empresarial stays NULL (unlimited)

-- ── 2. provision_tenant_schema — full update with accounting_charts ──────────

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
            id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            owner_id   text        NOT NULL,
            name       text        NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema);

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

    -- inventario_departamentos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_departamentos (
            id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            nombre     text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    -- inventario_productos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_productos (
            id               text    PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id       text    NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            departamento_id  text    REFERENCES %I.inventario_departamentos(id) ON DELETE SET NULL,
            codigo           text    NOT NULL DEFAULT '',
            nombre           text    NOT NULL,
            descripcion      text    NOT NULL DEFAULT '',
            tipo             text    NOT NULL DEFAULT 'mercancia',
            unidad_medida    text    NOT NULL DEFAULT 'unidad',
            metodo_valuacion text    NOT NULL DEFAULT 'promedio_ponderado',
            existencia_actual numeric(14,4) NOT NULL DEFAULT 0,
            costo_promedio   numeric(14,4) NOT NULL DEFAULT 0,
            iva_tipo         text    NOT NULL DEFAULT 'general',
            activo           boolean NOT NULL DEFAULT true,
            created_at       timestamptz NOT NULL DEFAULT now(),
            updated_at       timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    -- inventario_transformaciones
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_transformaciones (
            id                    text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id            text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            descripcion           text          NOT NULL DEFAULT '',
            fecha                 date          NOT NULL DEFAULT CURRENT_DATE,
            periodo               text          NOT NULL,
            producto_terminado_id text          REFERENCES %I.inventario_productos(id) ON DELETE SET NULL,
            cantidad_producida    numeric(14,4) NOT NULL DEFAULT 0,
            notas                 text          NOT NULL DEFAULT '',
            created_at            timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    -- inventario_movimientos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_movimientos (
            id                text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id        text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            producto_id       text          NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE CASCADE,
            tipo              text          NOT NULL,
            fecha             date          NOT NULL DEFAULT CURRENT_DATE,
            periodo           text          NOT NULL,
            cantidad          numeric(14,4) NOT NULL CHECK (cantidad > 0),
            costo_unitario    numeric(14,4) NOT NULL DEFAULT 0,
            costo_total       numeric(14,4) NOT NULL DEFAULT 0,
            saldo_cantidad    numeric(14,4) NOT NULL DEFAULT 0,
            referencia        text          NOT NULL DEFAULT '',
            notas             text          NOT NULL DEFAULT '',
            transformacion_id text          REFERENCES %I.inventario_transformaciones(id) ON DELETE SET NULL,
            moneda            text          NOT NULL DEFAULT 'VES',
            tasa_dolar        numeric(14,4) NOT NULL DEFAULT 1,
            factura_compra_id text,
            created_at        timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema, v_schema);

    -- inventario_cierres
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_cierres (
            id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            periodo    text NOT NULL,
            cerrado_at timestamptz NOT NULL DEFAULT now(),
            notas      text NOT NULL DEFAULT '',
            UNIQUE(empresa_id, periodo)
        )
    $tbl$, v_schema, v_schema);

    -- inventario_proveedores
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_proveedores (
            id         text    PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id text    NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            nombre     text    NOT NULL,
            rif        text    NOT NULL DEFAULT '',
            direccion  text    NOT NULL DEFAULT '',
            telefono   text    NOT NULL DEFAULT '',
            activo     boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    -- inventario_facturas_compra
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_facturas_compra (
            id             text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id     text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            proveedor_id   text          REFERENCES %I.inventario_proveedores(id) ON DELETE SET NULL,
            numero_factura text          NOT NULL DEFAULT '',
            numero_control text          NOT NULL DEFAULT '',
            fecha          date          NOT NULL DEFAULT CURRENT_DATE,
            periodo        text          NOT NULL,
            subtotal       numeric(14,2) NOT NULL DEFAULT 0,
            iva_amount     numeric(14,2) NOT NULL DEFAULT 0,
            total          numeric(14,2) NOT NULL DEFAULT 0,
            moneda         text          NOT NULL DEFAULT 'VES',
            tasa_dolar     numeric(14,4) NOT NULL DEFAULT 1,
            status         text          NOT NULL DEFAULT 'draft',
            created_at     timestamptz   NOT NULL DEFAULT now(),
            updated_at     timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    -- inventario_facturas_compra_items
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_facturas_compra_items (
            id                text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            factura_compra_id text          NOT NULL REFERENCES %I.inventario_facturas_compra(id) ON DELETE CASCADE,
            producto_id       text          REFERENCES %I.inventario_productos(id) ON DELETE SET NULL,
            descripcion       text          NOT NULL DEFAULT '',
            cantidad          numeric(14,4) NOT NULL DEFAULT 0,
            costo_unitario    numeric(14,4) NOT NULL DEFAULT 0,
            iva_tipo          text          NOT NULL DEFAULT 'general',
            created_at        timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    -- document_folders
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.document_folders (
            id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            parent_id  text REFERENCES %I.document_folders(id) ON DELETE CASCADE,
            company_id text REFERENCES %I.companies(id) ON DELETE CASCADE,
            name       text NOT NULL,
            created_by text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    -- documents
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.documents (
            id           text   PRIMARY KEY DEFAULT gen_random_uuid()::text,
            folder_id    text   REFERENCES %I.document_folders(id) ON DELETE CASCADE,
            company_id   text   REFERENCES %I.companies(id) ON DELETE CASCADE,
            name         text   NOT NULL,
            storage_path text   NOT NULL,
            mime_type    text   NOT NULL DEFAULT '',
            size_bytes   bigint NOT NULL DEFAULT 0,
            uploaded_by  text   NOT NULL,
            created_at   timestamptz NOT NULL DEFAULT now(),
            updated_at   timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    -- ── ACCOUNTING TABLES ────────────────────────────────────────────────────

    -- accounting_charts (plan de cuentas header)
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.accounting_charts (
            id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            name       text        NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS acc_charts_company_idx ON %I.accounting_charts(company_id)', v_schema);

    -- accounting_accounts (now includes chart_id and is_group)
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.accounting_accounts (
            id          text    PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id  text    NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            chart_id    text    REFERENCES %I.accounting_charts(id) ON DELETE SET NULL,
            code        text    NOT NULL,
            name        text    NOT NULL,
            type        text    NOT NULL CHECK (type IN ('asset','liability','equity','revenue','expense')),
            parent_code text,
            is_active   boolean NOT NULL DEFAULT true,
            is_group    boolean NOT NULL DEFAULT false,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now(),
            UNIQUE (company_id, code)
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS acc_accounts_company_idx ON %I.accounting_accounts(company_id)', v_schema);

    -- accounting_periods
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.accounting_periods (
            id         text    PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id text    NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            name       text    NOT NULL,
            start_date date    NOT NULL,
            end_date   date    NOT NULL,
            status     text    NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
            closed_at  timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS acc_periods_company_idx ON %I.accounting_periods(company_id)', v_schema);

    -- accounting_entries
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.accounting_entries (
            id           text    PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id   text    NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            period_id    text    NOT NULL REFERENCES %I.accounting_periods(id),
            entry_number integer NOT NULL,
            date         date    NOT NULL,
            description  text    NOT NULL DEFAULT '',
            status       text    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
            source       text    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','payroll','inventory')),
            source_ref   text,
            posted_at    timestamptz,
            created_at   timestamptz NOT NULL DEFAULT now(),
            updated_at   timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS acc_entries_company_idx ON %I.accounting_entries(company_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS acc_entries_period_idx  ON %I.accounting_entries(period_id)',  v_schema);

    -- accounting_entry_lines
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.accounting_entry_lines (
            id          text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            entry_id    text          NOT NULL REFERENCES %I.accounting_entries(id) ON DELETE CASCADE,
            account_id  text          NOT NULL REFERENCES %I.accounting_accounts(id),
            type        text          NOT NULL CHECK (type IN ('debit','credit')),
            amount      numeric(18,4) NOT NULL CHECK (amount > 0),
            description text,
            created_at  timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS acc_lines_entry_idx   ON %I.accounting_entry_lines(entry_id)',   v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS acc_lines_account_idx ON %I.accounting_entry_lines(account_id)', v_schema);

    -- accounting_integration_rules
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.accounting_integration_rules (
            id                text    PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id        text    NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            source            text    NOT NULL
                                      CHECK (source IN ('payroll','inventory_purchase','inventory_movement')),
            debit_account_id  text    NOT NULL REFERENCES %I.accounting_accounts(id),
            credit_account_id text    NOT NULL REFERENCES %I.accounting_accounts(id),
            amount_field      text    NOT NULL DEFAULT 'total',
            description       text    NOT NULL DEFAULT '',
            is_active         boolean NOT NULL DEFAULT true,
            created_at        timestamptz NOT NULL DEFAULT now(),
            updated_at        timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS acc_int_rules_company_idx ON %I.accounting_integration_rules(company_id)', v_schema);

    -- accounting_integration_log
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.accounting_integration_log (
            id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id    text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            source        text NOT NULL,
            source_ref    text NOT NULL,
            entry_id      text REFERENCES %I.accounting_entries(id) ON DELETE SET NULL,
            status        text NOT NULL CHECK (status IN ('success','error','skipped')),
            error_message text,
            created_at    timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS acc_int_log_company_idx ON %I.accounting_integration_log(company_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS acc_int_log_ref_idx     ON %I.accounting_integration_log(source_ref)',  v_schema);

    -- ── RLS ─────────────────────────────────────────────────────────────────

    EXECUTE format('ALTER TABLE %I.companies                        ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employees                        ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_runs                     ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_receipts                 ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_productos             ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_transformaciones      ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_movimientos           ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_cierres               ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_departamentos         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_proveedores           ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_facturas_compra       ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_facturas_compra_items ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.document_folders                 ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.documents                        ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.accounting_charts                ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.accounting_accounts              ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.accounting_periods               ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.accounting_entries               ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.accounting_entry_lines           ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.accounting_integration_rules     ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.accounting_integration_log       ENABLE ROW LEVEL SECURITY', v_schema);

    EXECUTE format('CREATE POLICY tenant_owner ON %I.companies FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.employees FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_runs FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_receipts FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_productos FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_transformaciones FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_movimientos FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_cierres FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_departamentos FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_proveedores FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_facturas_compra FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_facturas_compra_items FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.document_folders FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.documents FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.accounting_charts FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.accounting_accounts FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.accounting_periods FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.accounting_entries FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.accounting_entry_lines FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.accounting_integration_rules FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.accounting_integration_log FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', v_schema);

    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;
END;
$$;

-- ── 3. Add accounting_charts to existing tenants ──────────────────────────────

DO $$
DECLARE
    r        record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name, id FROM public.tenants LOOP
        v_schema := r.schema_name;

        -- accounting_charts
        EXECUTE format($tbl$
            CREATE TABLE IF NOT EXISTS %I.accounting_charts (
                id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
                company_id text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
                name       text        NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now()
            )
        $tbl$, v_schema, v_schema);

        EXECUTE format('CREATE INDEX IF NOT EXISTS acc_charts_company_idx ON %I.accounting_charts(company_id)', v_schema);

        -- Add chart_id to accounting_accounts (nullable, no FK constraint to keep it simple)
        EXECUTE format(
            'ALTER TABLE %I.accounting_accounts ADD COLUMN IF NOT EXISTS chart_id text',
            v_schema
        );

        -- Add is_group to accounting_accounts
        EXECUTE format(
            'ALTER TABLE %I.accounting_accounts ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false',
            v_schema
        );

        -- RLS
        EXECUTE format('ALTER TABLE %I.accounting_charts ENABLE ROW LEVEL SECURITY', v_schema);

        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.accounting_charts FOR ALL USING (auth.uid() = %L::uuid)',
            v_schema, r.id
        );

        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);

    END LOOP;
END;
$$;

-- ── 4. RPC functions ──────────────────────────────────────────────────────────

-- 4a. Get charts for a company (includes account count)
CREATE OR REPLACE FUNCTION public.tenant_accounting_charts_get(
    p_user_id    uuid,
    p_company_id text
)
RETURNS TABLE (
    id            text,
    company_id    text,
    name          text,
    account_count bigint,
    created_at    timestamptz,
    updated_at    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    RETURN QUERY EXECUTE format(
        'SELECT c.id, c.company_id, c.name,
                COUNT(a.id) AS account_count,
                c.created_at, c.updated_at
         FROM %I.accounting_charts c
         LEFT JOIN %I.accounting_accounts a ON a.chart_id = c.id
         WHERE c.company_id = %L
         GROUP BY c.id, c.company_id, c.name, c.created_at, c.updated_at
         ORDER BY c.created_at',
        v_schema, v_schema, p_company_id
    );
END;
$$;

-- 4b. Save (upsert) a chart header — with plan-limit enforcement on INSERT
CREATE OR REPLACE FUNCTION public.tenant_accounting_chart_save(
    p_user_id uuid,
    p_chart   jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema      text;
    v_id          text;
    v_is_new      boolean;
    v_chart_count integer;
    v_max_charts  integer;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    v_id     := coalesce(nullif(p_chart->>'id', ''), gen_random_uuid()::text);
    v_is_new := (p_chart->>'id') IS NULL OR (p_chart->>'id') = '';

    IF v_is_new THEN
        -- Check plan limit
        SELECT p.max_charts_per_company INTO v_max_charts
        FROM public.tenants t
        JOIN public.plans   p ON p.id = t.plan_id
        WHERE t.id = p_user_id;

        IF v_max_charts IS NOT NULL THEN
            EXECUTE format(
                'SELECT COUNT(*) FROM %I.accounting_charts WHERE company_id = %L',
                v_schema, p_chart->>'company_id'
            ) INTO v_chart_count;

            IF v_chart_count >= v_max_charts THEN
                RAISE EXCEPTION 'Límite de planes de cuentas alcanzado. Tu plan permite un máximo de % plan(es) por empresa.', v_max_charts
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
    END IF;

    EXECUTE format($q$
        INSERT INTO %I.accounting_charts (id, company_id, name, updated_at)
        VALUES (%L, %L, %L, now())
        ON CONFLICT (id) DO UPDATE
            SET name       = EXCLUDED.name,
                updated_at = now()
        RETURNING id
    $q$,
        v_schema,
        v_id,
        p_chart->>'company_id',
        p_chart->>'name'
    ) INTO v_id;

    RETURN v_id;
END;
$$;

-- 4c. Delete a chart and unlink its accounts (does NOT delete the accounts)
CREATE OR REPLACE FUNCTION public.tenant_accounting_chart_delete(
    p_user_id  uuid,
    p_chart_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    -- Unlink accounts from this chart
    EXECUTE format(
        'UPDATE %I.accounting_accounts SET chart_id = NULL, updated_at = now() WHERE chart_id = %L',
        v_schema, p_chart_id
    );

    EXECUTE format('DELETE FROM %I.accounting_charts WHERE id = %L', v_schema, p_chart_id);
END;
$$;

-- 4d. Bulk import: create chart + upsert accounts
--     p_accounts: [{code, name, type, parent_code, is_group}]
CREATE OR REPLACE FUNCTION public.tenant_accounting_chart_import(
    p_user_id    uuid,
    p_company_id text,
    p_name       text,
    p_accounts   jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema      text;
    v_chart_id    text;
    v_chart_count integer;
    v_max_charts  integer;
    v_acc         jsonb;
    v_acc_id      text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    -- Check plan limit
    SELECT p.max_charts_per_company INTO v_max_charts
    FROM public.tenants t
    JOIN public.plans   p ON p.id = t.plan_id
    WHERE t.id = p_user_id;

    IF v_max_charts IS NOT NULL THEN
        EXECUTE format(
            'SELECT COUNT(*) FROM %I.accounting_charts WHERE company_id = %L',
            v_schema, p_company_id
        ) INTO v_chart_count;

        IF v_chart_count >= v_max_charts THEN
            RAISE EXCEPTION 'Límite de planes de cuentas alcanzado. Tu plan permite un máximo de % plan(es) por empresa.', v_max_charts
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Create chart header
    v_chart_id := gen_random_uuid()::text;
    EXECUTE format(
        'INSERT INTO %I.accounting_charts (id, company_id, name) VALUES (%L, %L, %L)',
        v_schema, v_chart_id, p_company_id, p_name
    );

    -- Bulk upsert accounts
    FOR v_acc IN SELECT * FROM jsonb_array_elements(p_accounts) LOOP
        v_acc_id := gen_random_uuid()::text;
        EXECUTE format($q$
            INSERT INTO %I.accounting_accounts
                (id, company_id, chart_id, code, name, type, parent_code, is_active, is_group, updated_at)
            VALUES (%L, %L, %L, %L, %L, %L, %L, true, %L, now())
            ON CONFLICT (company_id, code) DO UPDATE
                SET chart_id    = EXCLUDED.chart_id,
                    name        = EXCLUDED.name,
                    type        = EXCLUDED.type,
                    parent_code = EXCLUDED.parent_code,
                    is_group    = EXCLUDED.is_group,
                    updated_at  = now()
        $q$,
            v_schema,
            v_acc_id,
            p_company_id,
            v_chart_id,
            v_acc->>'code',
            v_acc->>'name',
            v_acc->>'type',
            v_acc->>'parent_code',
            (v_acc->>'is_group')::boolean
        );
    END LOOP;

    RETURN v_chart_id;
END;
$$;

-- 4e. Update tenant_accounting_accounts_get to return chart_id and is_group
CREATE OR REPLACE FUNCTION public.tenant_accounting_accounts_get(
    p_user_id    uuid,
    p_company_id text
)
RETURNS TABLE (
    id          text,
    company_id  text,
    chart_id    text,
    code        text,
    name        text,
    type        text,
    parent_code text,
    is_active   boolean,
    is_group    boolean,
    created_at  timestamptz,
    updated_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    RETURN QUERY EXECUTE format(
        'SELECT id, company_id, chart_id, code, name, type, parent_code, is_active, is_group, created_at, updated_at
         FROM %I.accounting_accounts
         WHERE company_id = %L
         ORDER BY code',
        v_schema, p_company_id
    );
END;
$$;
