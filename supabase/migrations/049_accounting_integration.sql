-- ============================================================================
-- 049 — Accounting integration layer (Phase 2)
--
-- Adds per-tenant tables:
--   accounting_integration_rules  — maps operational events to account pairs
--   accounting_integration_log    — audit trail of each integration execution
--
-- Adds RPC functions:
--   tenant_accounting_integration_rules_get
--   tenant_accounting_integration_rule_save
--   tenant_accounting_integration_rule_delete
--   tenant_accounting_integration_log_get
--   tenant_accounting_integration_log_save
--   tenant_accounting_period_find_open_for_date
-- ============================================================================

-- ── 1. Extend provision_tenant_schema ────────────────────────────────────────

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
            id                   text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id           text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            descripcion          text          NOT NULL DEFAULT '',
            fecha                date          NOT NULL DEFAULT CURRENT_DATE,
            periodo              text          NOT NULL,
            producto_terminado_id text         REFERENCES %I.inventario_productos(id) ON DELETE SET NULL,
            cantidad_producida   numeric(14,4) NOT NULL DEFAULT 0,
            notas                text          NOT NULL DEFAULT '',
            created_at           timestamptz   NOT NULL DEFAULT now()
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

    -- accounting_accounts
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.accounting_accounts (
            id          text    PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id  text    NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            code        text    NOT NULL,
            name        text    NOT NULL,
            type        text    NOT NULL CHECK (type IN ('asset','liability','equity','revenue','expense')),
            parent_code text,
            is_active   boolean NOT NULL DEFAULT true,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now(),
            UNIQUE (company_id, code)
        )
    $tbl$, v_schema, v_schema);

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

    -- RLS
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

-- ── 2. Add integration tables to all existing tenant schemas ──────────────────

DO $$
DECLARE
    r        record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name, id FROM public.tenants LOOP
        v_schema := r.schema_name;

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

        -- RLS
        EXECUTE format('ALTER TABLE %I.accounting_integration_rules ENABLE ROW LEVEL SECURITY', v_schema);
        EXECUTE format('ALTER TABLE %I.accounting_integration_log   ENABLE ROW LEVEL SECURITY', v_schema);

        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.accounting_integration_rules FOR ALL USING (auth.uid() = %L::uuid)',
            v_schema, r.id
        );
        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.accounting_integration_log FOR ALL USING (auth.uid() = %L::uuid)',
            v_schema, r.id
        );

        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);

    END LOOP;
END;
$$;

-- ── 3. RPC functions ──────────────────────────────────────────────────────────

-- 3a. Find open period containing a date
CREATE OR REPLACE FUNCTION public.tenant_accounting_period_find_open_for_date(
    p_user_id    uuid,
    p_company_id text,
    p_date       date
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
           AND status = ''open''
           AND start_date <= %L::date
           AND end_date   >= %L::date
         LIMIT 1',
        v_schema, p_company_id, p_date, p_date
    );
END;
$$;

-- 3b. Get integration rules
CREATE OR REPLACE FUNCTION public.tenant_accounting_integration_rules_get(
    p_user_id    uuid,
    p_company_id text,
    p_source     text DEFAULT NULL
)
RETURNS TABLE (
    id                text,
    company_id        text,
    source            text,
    debit_account_id  text,
    credit_account_id text,
    amount_field      text,
    description       text,
    is_active         boolean,
    created_at        timestamptz,
    updated_at        timestamptz
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
    IF p_source IS NOT NULL THEN
        v_where := v_where || format(' AND source = %L', p_source);
    END IF;
    RETURN QUERY EXECUTE format(
        'SELECT id, company_id, source, debit_account_id, credit_account_id,
                amount_field, description, is_active, created_at, updated_at
         FROM %I.accounting_integration_rules
         WHERE %s
         ORDER BY source, created_at',
        v_schema, v_where
    );
END;
$$;

-- 3c. Save (upsert) an integration rule
CREATE OR REPLACE FUNCTION public.tenant_accounting_integration_rule_save(
    p_user_id uuid,
    p_rule    jsonb
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
    v_id     := coalesce(p_rule->>'id', gen_random_uuid()::text);

    EXECUTE format($q$
        INSERT INTO %I.accounting_integration_rules
            (id, company_id, source, debit_account_id, credit_account_id, amount_field, description, is_active, updated_at)
        VALUES (%L, %L, %L, %L, %L, %L, %L, %L, now())
        ON CONFLICT (id) DO UPDATE
            SET source            = EXCLUDED.source,
                debit_account_id  = EXCLUDED.debit_account_id,
                credit_account_id = EXCLUDED.credit_account_id,
                amount_field      = EXCLUDED.amount_field,
                description       = EXCLUDED.description,
                is_active         = EXCLUDED.is_active,
                updated_at        = now()
    $q$,
        v_schema,
        v_id,
        p_rule->>'company_id',
        p_rule->>'source',
        p_rule->>'debit_account_id',
        p_rule->>'credit_account_id',
        p_rule->>'amount_field',
        p_rule->>'description',
        (p_rule->>'is_active')::boolean
    );

    RETURN v_id;
END;
$$;

-- 3d. Delete an integration rule
CREATE OR REPLACE FUNCTION public.tenant_accounting_integration_rule_delete(
    p_user_id uuid,
    p_rule_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    EXECUTE format('DELETE FROM %I.accounting_integration_rules WHERE id = %L', v_schema, p_rule_id);
END;
$$;

-- 3e. Get integration log (most recent first)
CREATE OR REPLACE FUNCTION public.tenant_accounting_integration_log_get(
    p_user_id    uuid,
    p_company_id text,
    p_limit      integer DEFAULT 100
)
RETURNS TABLE (
    id            text,
    company_id    text,
    source        text,
    source_ref    text,
    entry_id      text,
    status        text,
    error_message text,
    created_at    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    RETURN QUERY EXECUTE format(
        'SELECT id, company_id, source, source_ref, entry_id, status, error_message, created_at
         FROM %I.accounting_integration_log
         WHERE company_id = %L
         ORDER BY created_at DESC
         LIMIT %L',
        v_schema, p_company_id, p_limit
    );
END;
$$;

-- 3f. Save an integration log entry
CREATE OR REPLACE FUNCTION public.tenant_accounting_integration_log_save(
    p_user_id uuid,
    p_log     jsonb
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
    v_id     := gen_random_uuid()::text;

    EXECUTE format($q$
        INSERT INTO %I.accounting_integration_log
            (id, company_id, source, source_ref, entry_id, status, error_message)
        VALUES (%L, %L, %L, %L, %L, %L, %L)
    $q$,
        v_schema,
        v_id,
        p_log->>'company_id',
        p_log->>'source',
        p_log->>'source_ref',
        p_log->>'entry_id',
        p_log->>'status',
        p_log->>'error_message'
    );

    RETURN v_id;
END;
$$;
