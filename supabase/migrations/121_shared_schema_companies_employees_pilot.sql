-- 121_shared_schema_companies_employees_pilot.sql
-- Pilot for the shared-schema migration. Runtime cutover is intentionally
-- deferred until the backfill counts are validated against tenant schemas.

CREATE TABLE IF NOT EXISTS public.shared_companies (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    owner_id text NOT NULL,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    rif text,
    config_fiscal jsonb NOT NULL DEFAULT '{}'::jsonb,
    phone text,
    address text,
    logo_url text,
    payroll_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    show_logo_in_pdf boolean NOT NULL DEFAULT false,
    sector text,
    inventory_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    taxpayer_type text NOT NULL DEFAULT 'ordinario',
    contact_email text,
    proximo_numero_factura_venta integer DEFAULT 1,
    CONSTRAINT shared_companies_pkey PRIMARY KEY (tenant_id, id),
    CONSTRAINT shared_companies_taxpayer_type_check
        CHECK (taxpayer_type IN ('ordinario', 'especial'))
);

CREATE TABLE IF NOT EXISTS public.shared_employees (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    company_id text NOT NULL,
    cedula text NOT NULL,
    nombre text NOT NULL,
    cargo text NOT NULL DEFAULT '',
    salario_mensual numeric(14,2) NOT NULL DEFAULT 0,
    estado text NOT NULL DEFAULT 'activo',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    fecha_ingreso date,
    moneda text NOT NULL DEFAULT 'VES',
    porcentaje_islr numeric(5,2) NOT NULL DEFAULT 0,
    tarifa_hora numeric(14,2) NOT NULL DEFAULT 0,
    modalidad_pago text NOT NULL DEFAULT 'diario',
    tarifa_hora_moneda text NOT NULL DEFAULT 'VES',
    CONSTRAINT shared_employees_pkey PRIMARY KEY (tenant_id, id),
    CONSTRAINT shared_employees_company_fkey
        FOREIGN KEY (tenant_id, company_id)
        REFERENCES public.shared_companies (tenant_id, id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS shared_companies_tenant_idx
    ON public.shared_companies (tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS shared_employees_tenant_company_idx
    ON public.shared_employees (tenant_id, company_id);
CREATE INDEX IF NOT EXISTS shared_employees_tenant_cedula_idx
    ON public.shared_employees (tenant_id, cedula);

ALTER TABLE public.shared_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shared_companies_member_access ON public.shared_companies;
CREATE POLICY shared_companies_member_access ON public.shared_companies
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.tenant_memberships m
            WHERE m.tenant_id = shared_companies.tenant_id
              AND m.member_id = auth.uid()
              AND m.accepted_at IS NOT NULL
              AND m.revoked_at IS NULL
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.tenant_memberships m
            WHERE m.tenant_id = shared_companies.tenant_id
              AND m.member_id = auth.uid()
              AND m.accepted_at IS NOT NULL
              AND m.revoked_at IS NULL
        )
    );

DROP POLICY IF EXISTS shared_employees_member_access ON public.shared_employees;
CREATE POLICY shared_employees_member_access ON public.shared_employees
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.tenant_memberships m
            WHERE m.tenant_id = shared_employees.tenant_id
              AND m.member_id = auth.uid()
              AND m.accepted_at IS NOT NULL
              AND m.revoked_at IS NULL
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.tenant_memberships m
            WHERE m.tenant_id = shared_employees.tenant_id
              AND m.member_id = auth.uid()
              AND m.accepted_at IS NOT NULL
              AND m.revoked_at IS NULL
        )
    );

-- Idempotent backfill from every currently provisioned tenant schema.
DO $$
DECLARE
    t record;
BEGIN
    FOR t IN SELECT id, schema_name FROM public.tenants LOOP
        EXECUTE format($sql$
            INSERT INTO public.shared_companies (
                tenant_id, id, owner_id, name, created_at, updated_at, rif,
                config_fiscal, phone, address, logo_url, payroll_settings,
                show_logo_in_pdf, sector, inventory_config, taxpayer_type,
                contact_email, proximo_numero_factura_venta
            )
            SELECT %L::uuid, id, owner_id, name, created_at, updated_at, rif,
                   config_fiscal, phone, address, logo_url, payroll_settings,
                   show_logo_in_pdf, sector, inventory_config, taxpayer_type,
                   contact_email, proximo_numero_factura_venta
            FROM %I.companies
            ON CONFLICT (tenant_id, id) DO NOTHING
        $sql$, t.id, t.schema_name);

        EXECUTE format($sql$
            INSERT INTO public.shared_employees (
                tenant_id, id, company_id, cedula, nombre, cargo,
                salario_mensual, estado, created_at, updated_at, fecha_ingreso,
                moneda, porcentaje_islr, tarifa_hora, modalidad_pago,
                tarifa_hora_moneda
            )
            SELECT %L::uuid, e.id, e.company_id, e.cedula, e.nombre, e.cargo,
                   e.salario_mensual, e.estado, e.created_at, e.updated_at,
                   e.fecha_ingreso, e.moneda, e.porcentaje_islr, e.tarifa_hora,
                   e.modalidad_pago, e.tarifa_hora_moneda
            FROM %I.employees e
            JOIN public.shared_companies c
              ON c.tenant_id = %L::uuid AND c.id = e.company_id
            ON CONFLICT (tenant_id, id) DO NOTHING
        $sql$, t.id, t.schema_name, t.id);
    END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_employees TO authenticated;
