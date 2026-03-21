-- =============================================================================
-- 030_documents_tenant_tables.sql
-- Tablas document_folders y documents en cada schema de tenant
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Función helper: agrega tablas de documentos a un schema existente
-- (idempotente — segura de llamar varias veces)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_documents_tables(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    -- document_folders
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.document_folders (
            id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            parent_id   text        NULL REFERENCES %I.document_folders(id) ON DELETE CASCADE,
            name        text        NOT NULL,
            company_id  text        NULL REFERENCES %I.companies(id) ON DELETE SET NULL,
            created_by  uuid        NOT NULL,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS doc_folders_parent_idx  ON %I.document_folders(parent_id)',  v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS doc_folders_company_idx ON %I.document_folders(company_id)', v_schema);

    -- documents
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.documents (
            id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            folder_id    text        NULL REFERENCES %I.document_folders(id) ON DELETE SET NULL,
            company_id   text        NULL REFERENCES %I.companies(id) ON DELETE SET NULL,
            name         text        NOT NULL,
            storage_path text        NOT NULL UNIQUE,
            mime_type    text,
            size_bytes   bigint,
            uploaded_by  uuid        NOT NULL,
            created_at   timestamptz NOT NULL DEFAULT now(),
            updated_at   timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS documents_folder_idx  ON %I.documents(folder_id)',  v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS documents_company_idx ON %I.documents(company_id)', v_schema);

    -- RLS
    EXECUTE format('ALTER TABLE %I.document_folders ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.documents        ENABLE ROW LEVEL SECURITY', v_schema);

    -- Crear políticas solo si no existen (idempotente)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = v_schema AND tablename = 'document_folders' AND policyname = 'tenant_owner'
    ) THEN
        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.document_folders FOR ALL USING (auth.uid() = %L::uuid)',
            v_schema, p_user_id
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = v_schema AND tablename = 'documents' AND policyname = 'tenant_owner'
    ) THEN
        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.documents FOR ALL USING (auth.uid() = %L::uuid)',
            v_schema, p_user_id
        );
    END IF;

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.document_folders TO authenticated', v_schema);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.documents        TO authenticated', v_schema);
END;
$$;

-- ---------------------------------------------------------------------------
-- Backfill: agregar tablas a todos los tenants existentes
-- ---------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.tenants LOOP
        PERFORM public.provision_documents_tables(r.id);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Actualizar provision_tenant_schema() para que nuevos tenants incluyan documentos
-- ---------------------------------------------------------------------------
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

    -- payroll_runs
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

    -- payroll_receipts
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
    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_run_idx     ON %I.payroll_receipts(run_id)',     v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_company_idx ON %I.payroll_receipts(company_id)', v_schema);

    -- RLS (core tables)
    EXECUTE format('ALTER TABLE %I.companies         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employees         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_runs      ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_receipts  ENABLE ROW LEVEL SECURITY', v_schema);

    EXECUTE format('CREATE POLICY tenant_owner ON %I.companies         FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.employees         FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_runs      FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_receipts  FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', v_schema);

    -- Registrar el tenant en public.tenants
    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;

    -- Registrar al owner como miembro de su propio tenant
    INSERT INTO public.tenant_memberships (tenant_id, member_id, role, accepted_at)
    VALUES (p_user_id, p_user_id, 'owner', now())
    ON CONFLICT (tenant_id, member_id) DO NOTHING;

    -- Crear tablas de documentos
    PERFORM public.provision_documents_tables(p_user_id);
END;
$$;
