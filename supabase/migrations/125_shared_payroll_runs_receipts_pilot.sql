-- 125_shared_payroll_runs_receipts_pilot.sql

CREATE TABLE IF NOT EXISTS public.shared_payroll_runs (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    company_id text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    exchange_rate numeric(14,4) NOT NULL,
    status text NOT NULL DEFAULT 'confirmed',
    confirmed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, company_id)
        REFERENCES public.shared_companies (tenant_id, id)
        ON DELETE CASCADE,
    CHECK (status IN ('draft', 'confirmed'))
);

CREATE TABLE IF NOT EXISTS public.shared_payroll_receipts (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    run_id text NOT NULL,
    company_id text NOT NULL,
    employee_id text NOT NULL,
    employee_cedula text NOT NULL,
    employee_nombre text NOT NULL,
    employee_cargo text NOT NULL DEFAULT '',
    monthly_salary numeric(14,2) NOT NULL DEFAULT 0,
    total_earnings numeric(14,2) NOT NULL DEFAULT 0,
    total_deductions numeric(14,2) NOT NULL DEFAULT 0,
    total_bonuses numeric(14,2) NOT NULL DEFAULT 0,
    net_pay numeric(14,2) NOT NULL DEFAULT 0,
    calculation_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, run_id)
        REFERENCES public.shared_payroll_runs (tenant_id, id)
        ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, company_id)
        REFERENCES public.shared_companies (tenant_id, id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS shared_payroll_runs_company_idx
    ON public.shared_payroll_runs (tenant_id, company_id, confirmed_at DESC);
CREATE INDEX IF NOT EXISTS shared_payroll_receipts_run_idx
    ON public.shared_payroll_receipts (tenant_id, run_id);
CREATE INDEX IF NOT EXISTS shared_payroll_receipts_company_idx
    ON public.shared_payroll_receipts (tenant_id, company_id);

ALTER TABLE public.shared_payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_payroll_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shared_payroll_runs_member_access ON public.shared_payroll_runs;
CREATE POLICY shared_payroll_runs_member_access ON public.shared_payroll_runs
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.tenant_memberships m
        WHERE m.tenant_id = shared_payroll_runs.tenant_id
          AND m.member_id = auth.uid()
          AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.tenant_memberships m
        WHERE m.tenant_id = shared_payroll_runs.tenant_id
          AND m.member_id = auth.uid()
          AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL
    ));

DROP POLICY IF EXISTS shared_payroll_receipts_member_access ON public.shared_payroll_receipts;
CREATE POLICY shared_payroll_receipts_member_access ON public.shared_payroll_receipts
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.tenant_memberships m
        WHERE m.tenant_id = shared_payroll_receipts.tenant_id
          AND m.member_id = auth.uid()
          AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.tenant_memberships m
        WHERE m.tenant_id = shared_payroll_receipts.tenant_id
          AND m.member_id = auth.uid()
          AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL
    ));

DO $$
DECLARE t record;
BEGIN
    FOR t IN SELECT id, schema_name FROM public.tenants LOOP
        EXECUTE format($sql$
            INSERT INTO public.shared_payroll_runs
                (tenant_id, id, company_id, period_start, period_end,
                 exchange_rate, status, confirmed_at, created_at)
            SELECT %L::uuid, r.id, r.company_id, r.period_start, r.period_end,
                   r.exchange_rate, r.status, r.confirmed_at, r.created_at
            FROM %I.payroll_runs r
            JOIN public.shared_companies c
              ON c.tenant_id = %L::uuid AND c.id = r.company_id
            ON CONFLICT (tenant_id, id) DO NOTHING
        $sql$, t.id, t.schema_name, t.id);

        EXECUTE format($sql$
            INSERT INTO public.shared_payroll_receipts
                (tenant_id, id, run_id, company_id, employee_id,
                 employee_cedula, employee_nombre, employee_cargo,
                 monthly_salary, total_earnings, total_deductions,
                 total_bonuses, net_pay, calculation_data, created_at)
            SELECT %L::uuid, p.id, p.run_id, p.company_id, p.employee_id,
                   p.employee_cedula, p.employee_nombre, p.employee_cargo,
                   p.monthly_salary, p.total_earnings, p.total_deductions,
                   p.total_bonuses, p.net_pay, p.calculation_data, p.created_at
            FROM %I.payroll_receipts p
            JOIN public.shared_payroll_runs r
              ON r.tenant_id = %L::uuid AND r.id = p.run_id
            ON CONFLICT (tenant_id, id) DO NOTHING
        $sql$, t.id, t.schema_name, t.id);
    END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_payroll_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_payroll_receipts TO authenticated;
