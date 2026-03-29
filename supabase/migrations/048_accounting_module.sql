-- ============================================================================
-- 048 — Accounting module (Phase 1 foundation)
--
-- Adds:
--   public.products         — 'accounting' product entry
--   public.plans            — accounting subscription tiers
--   tenant schema tables    — accounting_accounts, accounting_periods,
--                             accounting_entries, accounting_entry_lines
--   RPC functions           — tenant_accounting_* gateway functions
-- ============================================================================

-- ── 1. Accounting product ─────────────────────────────────────────────────────

INSERT INTO public.products (slug, name, description) VALUES
    ('accounting', 'Contabilidad', 'Plan de cuentas, asientos contables, libros y balances venezolanos')
ON CONFLICT (slug) DO NOTHING;

-- ── 2. Accounting subscription plans ─────────────────────────────────────────

INSERT INTO public.plans (
    name,
    product_id,
    max_companies,
    max_employees_per_company,
    price_monthly_usd,
    price_quarterly_usd,
    price_annual_usd,
    is_active
)
SELECT
    p.name,
    acc.id,
    p.max_companies,
    NULL,
    p.price_monthly_usd,
    p.price_quarterly_usd,
    p.price_annual_usd,
    true
FROM (
    VALUES
        ('Emprendedor Contabilidad',  1,    7.00,  18.00,  67.00),
        ('Profesional Contabilidad',  3,   14.00,  36.00, 134.00),
        ('Contador Contabilidad',    10,   26.00,  67.00, 250.00),
        ('Empresarial Contabilidad', NULL, 47.00, 120.00, 450.00)
) AS p(name, max_companies, price_monthly_usd, price_quarterly_usd, price_annual_usd)
CROSS JOIN (SELECT id FROM public.products WHERE slug = 'accounting') AS acc
ON CONFLICT DO NOTHING;

-- ── 3. Extend provision_tenant_schema with accounting tables ──────────────────

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

    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);

    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon', v_schema);

    -- companies
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.companies (
            id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            owner_id    text        NOT NULL,
            name        text        NOT NULL,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
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

    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_runs_company_idx ON %I.payroll_runs(company_id)', v_schema);

    -- payroll_receipts
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.payroll_receipts (
            id                text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            run_id            text          NOT NULL REFERENCES %I.payroll_runs(id) ON DELETE CASCADE,
            company_id        text          NOT NULL REFERENCES %I.companies(id),
            employee_id       text          NOT NULL,
            employee_cedula   text          NOT NULL,
            employee_nombre   text          NOT NULL,
            employee_cargo    text          NOT NULL DEFAULT '',
            monthly_salary    numeric(14,2) NOT NULL DEFAULT 0,
            total_earnings    numeric(14,2) NOT NULL DEFAULT 0,
            total_deductions  numeric(14,2) NOT NULL DEFAULT 0,
            total_bonuses     numeric(14,2) NOT NULL DEFAULT 0,
            net_pay           numeric(14,2) NOT NULL DEFAULT 0,
            calculation_data  jsonb         NOT NULL DEFAULT '{}',
            created_at        timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_run_idx     ON %I.payroll_receipts(run_id)',     v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_company_idx ON %I.payroll_receipts(company_id)', v_schema);

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
            id                   text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id           text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            departamento_id      text REFERENCES %I.inventario_departamentos(id) ON DELETE SET NULL,
            codigo               text NOT NULL DEFAULT '',
            nombre               text NOT NULL,
            descripcion          text NOT NULL DEFAULT '',
            tipo                 text NOT NULL DEFAULT 'mercancia'
                                     CHECK (tipo IN ('mercancia','materia_prima','producto_terminado')),
            unidad_medida        text NOT NULL DEFAULT 'unidad',
            metodo_valuacion     text NOT NULL DEFAULT 'promedio_ponderado'
                                     CHECK (metodo_valuacion IN ('promedio_ponderado','peps')),
            existencia_actual    numeric(14,4) NOT NULL DEFAULT 0,
            costo_promedio       numeric(14,4) NOT NULL DEFAULT 0,
            iva_tipo             text NOT NULL DEFAULT 'general',
            activo               boolean NOT NULL DEFAULT true,
            created_at           timestamptz NOT NULL DEFAULT now(),
            updated_at           timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_productos_empresa_idx ON %I.inventario_productos(empresa_id)', v_schema);

    -- inventario_transformaciones
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_transformaciones (
            id                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id            text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            descripcion           text NOT NULL DEFAULT '',
            fecha                 date NOT NULL DEFAULT CURRENT_DATE,
            periodo               text NOT NULL,
            producto_terminado_id text REFERENCES %I.inventario_productos(id) ON DELETE SET NULL,
            cantidad_producida     numeric(14,4) NOT NULL DEFAULT 0,
            notas                 text NOT NULL DEFAULT '',
            created_at            timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    -- inventario_movimientos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_movimientos (
            id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id        text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            producto_id       text NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE CASCADE,
            tipo              text NOT NULL,
            fecha             date NOT NULL DEFAULT CURRENT_DATE,
            periodo           text NOT NULL,
            cantidad          numeric(14,4) NOT NULL CHECK (cantidad > 0),
            costo_unitario    numeric(14,4) NOT NULL DEFAULT 0,
            costo_total       numeric(14,4) NOT NULL DEFAULT 0,
            saldo_cantidad    numeric(14,4) NOT NULL DEFAULT 0,
            referencia        text NOT NULL DEFAULT '',
            notas             text NOT NULL DEFAULT '',
            transformacion_id text REFERENCES %I.inventario_transformaciones(id) ON DELETE SET NULL,
            moneda            text NOT NULL DEFAULT 'VES',
            tasa_dolar        numeric(14,4) NOT NULL DEFAULT 1,
            factura_compra_id text,
            created_at        timestamptz NOT NULL DEFAULT now()
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
            id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            nombre     text NOT NULL,
            rif        text NOT NULL DEFAULT '',
            direccion  text NOT NULL DEFAULT '',
            telefono   text NOT NULL DEFAULT '',
            activo     boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    -- inventario_facturas_compra
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_facturas_compra (
            id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id        text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            proveedor_id      text REFERENCES %I.inventario_proveedores(id) ON DELETE SET NULL,
            numero_factura    text NOT NULL DEFAULT '',
            numero_control    text NOT NULL DEFAULT '',
            fecha             date NOT NULL DEFAULT CURRENT_DATE,
            periodo           text NOT NULL,
            subtotal          numeric(14,2) NOT NULL DEFAULT 0,
            iva_amount        numeric(14,2) NOT NULL DEFAULT 0,
            total             numeric(14,2) NOT NULL DEFAULT 0,
            moneda            text NOT NULL DEFAULT 'VES',
            tasa_dolar        numeric(14,4) NOT NULL DEFAULT 1,
            status            text NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft','confirmed','deleted')),
            created_at        timestamptz NOT NULL DEFAULT now(),
            updated_at        timestamptz NOT NULL DEFAULT now()
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
            id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            parent_id  text        REFERENCES %I.document_folders(id) ON DELETE CASCADE,
            company_id text        REFERENCES %I.companies(id) ON DELETE CASCADE,
            name       text        NOT NULL,
            created_by text        NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    -- documents
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.documents (
            id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            folder_id    text        REFERENCES %I.document_folders(id) ON DELETE CASCADE,
            company_id   text        REFERENCES %I.companies(id) ON DELETE CASCADE,
            name         text        NOT NULL,
            storage_path text        NOT NULL,
            mime_type    text        NOT NULL DEFAULT '',
            size_bytes   bigint      NOT NULL DEFAULT 0,
            uploaded_by  text        NOT NULL,
            created_at   timestamptz NOT NULL DEFAULT now(),
            updated_at   timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    -- ─── ACCOUNTING TABLES ──────────────────────────────────────────────────────

    -- accounting_accounts (chart of accounts)
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.accounting_accounts (
            id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id  text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            code        text        NOT NULL,
            name        text        NOT NULL,
            type        text        NOT NULL
                                    CHECK (type IN ('asset','liability','equity','revenue','expense')),
            parent_code text,
            is_active   boolean     NOT NULL DEFAULT true,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now(),
            UNIQUE (company_id, code)
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS acc_accounts_company_idx ON %I.accounting_accounts(company_id)', v_schema);

    -- accounting_periods
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.accounting_periods (
            id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            name       text        NOT NULL,
            start_date date        NOT NULL,
            end_date   date        NOT NULL,
            status     text        NOT NULL DEFAULT 'open'
                                   CHECK (status IN ('open','closed')),
            closed_at  timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS acc_periods_company_idx ON %I.accounting_periods(company_id)', v_schema);

    -- accounting_entries (journal entries / asientos contables)
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.accounting_entries (
            id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id   text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            period_id    text        NOT NULL REFERENCES %I.accounting_periods(id),
            entry_number integer     NOT NULL,
            date         date        NOT NULL,
            description  text        NOT NULL DEFAULT '',
            status       text        NOT NULL DEFAULT 'draft'
                                     CHECK (status IN ('draft','posted')),
            source       text        NOT NULL DEFAULT 'manual'
                                     CHECK (source IN ('manual','payroll','inventory')),
            source_ref   text,
            posted_at    timestamptz,
            created_at   timestamptz NOT NULL DEFAULT now(),
            updated_at   timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS acc_entries_company_idx ON %I.accounting_entries(company_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS acc_entries_period_idx  ON %I.accounting_entries(period_id)',  v_schema);

    -- accounting_entry_lines (debit/credit lines per entry)
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

    -- ─── RLS ────────────────────────────────────────────────────────────────────

    EXECUTE format('ALTER TABLE %I.companies                      ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employees                      ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_runs                   ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_receipts               ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_productos           ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_transformaciones    ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_movimientos         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_cierres             ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_departamentos       ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_proveedores         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_facturas_compra     ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_facturas_compra_items ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.document_folders               ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.documents                      ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.accounting_accounts            ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.accounting_periods             ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.accounting_entries             ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.accounting_entry_lines         ENABLE ROW LEVEL SECURITY', v_schema);

    -- RLS policies
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
    EXECUTE format('CREATE POLICY tenant_owner ON %I.accounting_accounts FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.accounting_periods FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.accounting_entries FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.accounting_entry_lines FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', v_schema);

    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;
END;
$$;

-- ── 4. Add accounting tables to all existing tenant schemas ───────────────────

DO $$
DECLARE
    r        record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name, id FROM public.tenants LOOP
        v_schema := r.schema_name;

        -- accounting_accounts
        EXECUTE format($tbl$
            CREATE TABLE IF NOT EXISTS %I.accounting_accounts (
                id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
                company_id  text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
                code        text        NOT NULL,
                name        text        NOT NULL,
                type        text        NOT NULL
                                        CHECK (type IN ('asset','liability','equity','revenue','expense')),
                parent_code text,
                is_active   boolean     NOT NULL DEFAULT true,
                created_at  timestamptz NOT NULL DEFAULT now(),
                updated_at  timestamptz NOT NULL DEFAULT now(),
                UNIQUE (company_id, code)
            )
        $tbl$, v_schema, v_schema);

        EXECUTE format('CREATE INDEX IF NOT EXISTS acc_accounts_company_idx ON %I.accounting_accounts(company_id)', v_schema);

        -- accounting_periods
        EXECUTE format($tbl$
            CREATE TABLE IF NOT EXISTS %I.accounting_periods (
                id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
                company_id text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
                name       text        NOT NULL,
                start_date date        NOT NULL,
                end_date   date        NOT NULL,
                status     text        NOT NULL DEFAULT 'open'
                                       CHECK (status IN ('open','closed')),
                closed_at  timestamptz,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now()
            )
        $tbl$, v_schema, v_schema);

        EXECUTE format('CREATE INDEX IF NOT EXISTS acc_periods_company_idx ON %I.accounting_periods(company_id)', v_schema);

        -- accounting_entries
        EXECUTE format($tbl$
            CREATE TABLE IF NOT EXISTS %I.accounting_entries (
                id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
                company_id   text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
                period_id    text        NOT NULL REFERENCES %I.accounting_periods(id),
                entry_number integer     NOT NULL,
                date         date        NOT NULL,
                description  text        NOT NULL DEFAULT '',
                status       text        NOT NULL DEFAULT 'draft'
                                         CHECK (status IN ('draft','posted')),
                source       text        NOT NULL DEFAULT 'manual'
                                         CHECK (source IN ('manual','payroll','inventory')),
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

        -- RLS
        EXECUTE format('ALTER TABLE %I.accounting_accounts    ENABLE ROW LEVEL SECURITY', v_schema);
        EXECUTE format('ALTER TABLE %I.accounting_periods     ENABLE ROW LEVEL SECURITY', v_schema);
        EXECUTE format('ALTER TABLE %I.accounting_entries     ENABLE ROW LEVEL SECURITY', v_schema);
        EXECUTE format('ALTER TABLE %I.accounting_entry_lines ENABLE ROW LEVEL SECURITY', v_schema);

        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.accounting_accounts FOR ALL USING (auth.uid() = %L::uuid)',
            v_schema, r.id
        );
        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.accounting_periods FOR ALL USING (auth.uid() = %L::uuid)',
            v_schema, r.id
        );
        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.accounting_entries FOR ALL USING (auth.uid() = %L::uuid)',
            v_schema, r.id
        );
        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.accounting_entry_lines FOR ALL USING (auth.uid() = %L::uuid)',
            v_schema, r.id
        );

        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);

    END LOOP;
END;
$$;

-- ── 5. RPC functions ──────────────────────────────────────────────────────────

-- Helper: resolve tenant schema from user id
-- (reuses the existing pattern: tenant_<uuid_no_dashes>)

-- 5a. Get chart of accounts for a company
CREATE OR REPLACE FUNCTION public.tenant_accounting_accounts_get(
    p_user_id    uuid,
    p_company_id text
)
RETURNS TABLE (
    id          text,
    company_id  text,
    code        text,
    name        text,
    type        text,
    parent_code text,
    is_active   boolean,
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
        'SELECT id, company_id, code, name, type, parent_code, is_active, created_at, updated_at
         FROM %I.accounting_accounts
         WHERE company_id = %L
         ORDER BY code',
        v_schema, p_company_id
    );
END;
$$;

-- 5b. Upsert a chart-of-accounts entry
CREATE OR REPLACE FUNCTION public.tenant_accounting_account_upsert(
    p_user_id uuid,
    p_account jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema text;
    v_id     text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    v_id     := coalesce(p_account->>'id', gen_random_uuid()::text);

    EXECUTE format($q$
        INSERT INTO %I.accounting_accounts (id, company_id, code, name, type, parent_code, is_active, updated_at)
        VALUES (%L, %L, %L, %L, %L, %L, %L, now())
        ON CONFLICT (company_id, code) DO UPDATE
            SET name        = EXCLUDED.name,
                type        = EXCLUDED.type,
                parent_code = EXCLUDED.parent_code,
                is_active   = EXCLUDED.is_active,
                updated_at  = now()
        RETURNING id
    $q$,
        v_schema,
        v_id,
        p_account->>'company_id',
        p_account->>'code',
        p_account->>'name',
        p_account->>'type',
        p_account->>'parent_code',
        (p_account->>'is_active')::boolean
    ) INTO v_id;

    RETURN v_id;
END;
$$;

-- 5c. Delete a chart-of-accounts entry (only if no posted entry lines reference it)
CREATE OR REPLACE FUNCTION public.tenant_accounting_account_delete(
    p_user_id    uuid,
    p_account_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema text;
    v_count  integer;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    -- Reject deletion if any posted entry line uses this account
    EXECUTE format(
        'SELECT count(*) FROM %I.accounting_entry_lines l
         JOIN %I.accounting_entries e ON e.id = l.entry_id
         WHERE l.account_id = %L AND e.status = ''posted''',
        v_schema, v_schema, p_account_id
    ) INTO v_count;

    IF v_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete account: it is referenced by % posted entry line(s)', v_count;
    END IF;

    EXECUTE format('DELETE FROM %I.accounting_accounts WHERE id = %L', v_schema, p_account_id);
END;
$$;

-- 5d. Get accounting periods for a company
CREATE OR REPLACE FUNCTION public.tenant_accounting_periods_get(
    p_user_id    uuid,
    p_company_id text
)
RETURNS TABLE (
    id         text,
    company_id text,
    name       text,
    start_date date,
    end_date   date,
    status     text,
    closed_at  timestamptz,
    created_at timestamptz,
    updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    RETURN QUERY EXECUTE format(
        'SELECT id, company_id, name, start_date, end_date, status, closed_at, created_at, updated_at
         FROM %I.accounting_periods
         WHERE company_id = %L
         ORDER BY start_date DESC',
        v_schema, p_company_id
    );
END;
$$;

-- 5e. Save (upsert) an accounting period
CREATE OR REPLACE FUNCTION public.tenant_accounting_period_save(
    p_user_id uuid,
    p_period  jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema text;
    v_id     text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    v_id     := coalesce(p_period->>'id', gen_random_uuid()::text);

    EXECUTE format($q$
        INSERT INTO %I.accounting_periods (id, company_id, name, start_date, end_date, status, updated_at)
        VALUES (%L, %L, %L, %L::date, %L::date, 'open', now())
        ON CONFLICT (id) DO UPDATE
            SET name       = EXCLUDED.name,
                start_date = EXCLUDED.start_date,
                end_date   = EXCLUDED.end_date,
                updated_at = now()
        WHERE %I.accounting_periods.status = 'open'
    $q$,
        v_schema,
        v_id,
        p_period->>'company_id',
        p_period->>'name',
        p_period->>'start_date',
        p_period->>'end_date',
        v_schema
    );

    RETURN v_id;
END;
$$;

-- 5f. Close an accounting period
CREATE OR REPLACE FUNCTION public.tenant_accounting_period_close(
    p_user_id  uuid,
    p_period_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    EXECUTE format(
        'UPDATE %I.accounting_periods SET status = ''closed'', closed_at = now(), updated_at = now()
         WHERE id = %L AND status = ''open''',
        v_schema, p_period_id
    );
END;
$$;

-- 5g. Get journal entries for a company (optionally filtered by period)
CREATE OR REPLACE FUNCTION public.tenant_accounting_entries_get(
    p_user_id    uuid,
    p_company_id text,
    p_period_id  text DEFAULT NULL
)
RETURNS TABLE (
    id           text,
    company_id   text,
    period_id    text,
    entry_number integer,
    date         date,
    description  text,
    status       text,
    source       text,
    source_ref   text,
    posted_at    timestamptz,
    created_at   timestamptz,
    updated_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema text;
    v_where  text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    v_where  := format('company_id = %L', p_company_id);
    IF p_period_id IS NOT NULL THEN
        v_where := v_where || format(' AND period_id = %L', p_period_id);
    END IF;

    RETURN QUERY EXECUTE format(
        'SELECT id, company_id, period_id, entry_number, date, description, status, source, source_ref, posted_at, created_at, updated_at
         FROM %I.accounting_entries
         WHERE %s
         ORDER BY entry_number DESC',
        v_schema, v_where
    );
END;
$$;

-- 5h. Get a single entry with its lines (returns jsonb)
CREATE OR REPLACE FUNCTION public.tenant_accounting_entry_with_lines_get(
    p_user_id  uuid,
    p_entry_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema text;
    v_entry  jsonb;
    v_lines  jsonb;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    EXECUTE format(
        'SELECT row_to_json(e) FROM %I.accounting_entries e WHERE id = %L',
        v_schema, p_entry_id
    ) INTO v_entry;

    EXECUTE format(
        'SELECT json_agg(
            json_build_object(
                ''id'',           l.id,
                ''entry_id'',     l.entry_id,
                ''account_id'',   l.account_id,
                ''account_code'', a.code,
                ''account_name'', a.name,
                ''type'',         l.type,
                ''amount'',       l.amount,
                ''description'',  l.description,
                ''created_at'',   l.created_at
            )
         )
         FROM %I.accounting_entry_lines l
         JOIN %I.accounting_accounts a ON a.id = l.account_id
         WHERE l.entry_id = %L',
        v_schema, v_schema, p_entry_id
    ) INTO v_lines;

    RETURN jsonb_build_object('entry', v_entry, 'lines', coalesce(v_lines, '[]'::jsonb));
END;
$$;

-- 5i. Save (upsert) a journal entry with its lines
CREATE OR REPLACE FUNCTION public.tenant_accounting_entry_save(
    p_user_id uuid,
    p_entry   jsonb,
    p_lines   jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema      text;
    v_id          text;
    v_entry_num   integer;
    v_line        jsonb;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    v_id     := coalesce(p_entry->>'id', gen_random_uuid()::text);

    -- Guard: do not allow editing posted entries
    IF p_entry->>'id' IS NOT NULL THEN
        EXECUTE format(
            'SELECT 1 FROM %I.accounting_entries WHERE id = %L AND status = ''posted''',
            v_schema, p_entry->>'id'
        );
        IF FOUND THEN
            RAISE EXCEPTION 'Cannot modify a posted entry. Create a reversal entry instead.';
        END IF;
    END IF;

    -- Assign sequential entry_number per company if new
    IF p_entry->>'id' IS NULL THEN
        EXECUTE format(
            'SELECT coalesce(max(entry_number), 0) + 1 FROM %I.accounting_entries WHERE company_id = %L',
            v_schema, p_entry->>'company_id'
        ) INTO v_entry_num;
    ELSE
        EXECUTE format(
            'SELECT entry_number FROM %I.accounting_entries WHERE id = %L',
            v_schema, p_entry->>'id'
        ) INTO v_entry_num;
        v_entry_num := coalesce(v_entry_num, 1);
    END IF;

    EXECUTE format($q$
        INSERT INTO %I.accounting_entries
            (id, company_id, period_id, entry_number, date, description, source, source_ref, status, updated_at)
        VALUES (%L, %L, %L, %L, %L::date, %L, %L, %L, 'draft', now())
        ON CONFLICT (id) DO UPDATE
            SET period_id   = EXCLUDED.period_id,
                date        = EXCLUDED.date,
                description = EXCLUDED.description,
                source      = EXCLUDED.source,
                source_ref  = EXCLUDED.source_ref,
                updated_at  = now()
        WHERE %I.accounting_entries.status = 'draft'
    $q$,
        v_schema,
        v_id,
        p_entry->>'company_id',
        p_entry->>'period_id',
        v_entry_num,
        p_entry->>'date',
        p_entry->>'description',
        coalesce(p_entry->>'source', 'manual'),
        p_entry->>'source_ref',
        v_schema
    );

    -- Replace lines
    EXECUTE format('DELETE FROM %I.accounting_entry_lines WHERE entry_id = %L', v_schema, v_id);

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        EXECUTE format($q$
            INSERT INTO %I.accounting_entry_lines (id, entry_id, account_id, type, amount, description)
            VALUES (gen_random_uuid()::text, %L, %L, %L, %L::numeric, %L)
        $q$,
            v_schema,
            v_id,
            v_line->>'account_id',
            v_line->>'type',
            v_line->>'amount',
            v_line->>'description'
        );
    END LOOP;

    RETURN v_id;
END;
$$;

-- 5j. Post a journal entry (validates balance, marks as posted)
CREATE OR REPLACE FUNCTION public.tenant_accounting_entry_post(
    p_user_id  uuid,
    p_entry_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema      text;
    v_total_debit  numeric;
    v_total_credit numeric;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    -- Validate balance: total debits must equal total credits
    EXECUTE format(
        'SELECT
            coalesce(sum(CASE WHEN type = ''debit''  THEN amount ELSE 0 END), 0),
            coalesce(sum(CASE WHEN type = ''credit'' THEN amount ELSE 0 END), 0)
         FROM %I.accounting_entry_lines
         WHERE entry_id = %L',
        v_schema, p_entry_id
    ) INTO v_total_debit, v_total_credit;

    IF round(v_total_debit, 4) <> round(v_total_credit, 4) THEN
        RAISE EXCEPTION 'Entry does not balance: debits (%) ≠ credits (%)', v_total_debit, v_total_credit;
    END IF;

    IF v_total_debit = 0 THEN
        RAISE EXCEPTION 'Entry has no lines';
    END IF;

    EXECUTE format(
        'UPDATE %I.accounting_entries
         SET status = ''posted'', posted_at = now(), updated_at = now()
         WHERE id = %L AND status = ''draft''',
        v_schema, p_entry_id
    );
END;
$$;

-- 5k. Trial balance: aggregate posted lines per account
CREATE OR REPLACE FUNCTION public.tenant_accounting_trial_balance_get(
    p_user_id    uuid,
    p_company_id text,
    p_period_id  text DEFAULT NULL
)
RETURNS TABLE (
    account_id   text,
    account_code text,
    account_name text,
    account_type text,
    total_debit  numeric,
    total_credit numeric,
    balance      numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema text;
    v_where  text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    v_where  := format('e.company_id = %L AND e.status = ''posted''', p_company_id);
    IF p_period_id IS NOT NULL THEN
        v_where := v_where || format(' AND e.period_id = %L', p_period_id);
    END IF;

    RETURN QUERY EXECUTE format(
        'SELECT
            a.id                                                            AS account_id,
            a.code                                                          AS account_code,
            a.name                                                          AS account_name,
            a.type                                                          AS account_type,
            coalesce(sum(CASE WHEN l.type = ''debit''  THEN l.amount END), 0) AS total_debit,
            coalesce(sum(CASE WHEN l.type = ''credit'' THEN l.amount END), 0) AS total_credit,
            coalesce(sum(CASE WHEN l.type = ''debit''  THEN l.amount
                              WHEN l.type = ''credit'' THEN -l.amount END), 0) AS balance
         FROM %I.accounting_accounts a
         JOIN %I.accounting_entry_lines l ON l.account_id = a.id
         JOIN %I.accounting_entries     e ON e.id = l.entry_id
         WHERE %s
         GROUP BY a.id, a.code, a.name, a.type
         ORDER BY a.code',
        v_schema, v_schema, v_schema, v_where
    );
END;
$$;
