-- =============================================================================
-- 029_tenant_memberships.sql
-- Tablas de membresías e invitaciones para multi-user tenancy
-- =============================================================================

-- ---------------------------------------------------------------------------
-- public.tenant_memberships
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    member_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role          text        NOT NULL CHECK (role IN ('owner', 'admin', 'contable')),
    invited_by    uuid        NULL REFERENCES auth.users(id),
    accepted_at   timestamptz NULL,
    revoked_at    timestamptz NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_member_id ON public.tenant_memberships(member_id);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant_id ON public.tenant_memberships(tenant_id);

ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;

-- Miembro lee sus propias membresías activas
CREATE POLICY "memberships_member_read" ON public.tenant_memberships
    FOR SELECT USING (member_id = auth.uid() AND revoked_at IS NULL);

-- Owner lee todas las membresías de su tenant
CREATE POLICY "memberships_owner_read" ON public.tenant_memberships
    FOR SELECT USING (tenant_id = auth.uid());

-- Solo el owner puede escribir (inserts/updates/deletes via service role en API)
CREATE POLICY "memberships_owner_write" ON public.tenant_memberships
    FOR ALL USING (tenant_id = auth.uid());

-- ---------------------------------------------------------------------------
-- public.tenant_invitations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_invitations (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    invited_by   uuid        NOT NULL REFERENCES auth.users(id),
    email        text        NOT NULL,
    role         text        NOT NULL CHECK (role IN ('admin', 'contable')),
    token        uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    expires_at   timestamptz NOT NULL DEFAULT now() + interval '7 days',
    accepted_at  timestamptz NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token     ON public.tenant_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_tenant_id ON public.tenant_invitations(tenant_id);

ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations_owner_read" ON public.tenant_invitations
    FOR SELECT USING (tenant_id = auth.uid() OR invited_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Seed: crear fila owner para todos los tenants existentes
-- ---------------------------------------------------------------------------
INSERT INTO public.tenant_memberships (tenant_id, member_id, role, accepted_at)
SELECT id, id, 'owner', created_at FROM public.tenants
ON CONFLICT (tenant_id, member_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Actualizar provision_tenant_schema() para que nuevos usuarios
-- reciban automáticamente su fila de owner en tenant_memberships
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
    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_run_idx     ON %I.payroll_receipts(run_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_company_idx ON %I.payroll_receipts(company_id)', v_schema);

    -- RLS
    EXECUTE format('ALTER TABLE %I.companies         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employees         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_runs      ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_receipts  ENABLE ROW LEVEL SECURITY', v_schema);

    EXECUTE format('CREATE POLICY tenant_owner ON %I.companies FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.employees FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_runs FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_receipts FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);

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

END;
$$;
