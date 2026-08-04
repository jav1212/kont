-- 122_shared_employee_salary_history_pilot.sql

CREATE TABLE IF NOT EXISTS public.shared_employee_salary_history (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id uuid NOT NULL,
    employee_cedula text NOT NULL,
    company_id text NOT NULL,
    salario_mensual numeric(12,2) NOT NULL,
    moneda varchar(3) NOT NULL DEFAULT 'VES',
    fecha_desde date NOT NULL DEFAULT CURRENT_DATE,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, company_id)
        REFERENCES public.shared_companies (tenant_id, id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS shared_salary_history_employee_idx
    ON public.shared_employee_salary_history (tenant_id, company_id, employee_cedula, fecha_desde DESC);

ALTER TABLE public.shared_employee_salary_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shared_salary_history_member_access ON public.shared_employee_salary_history;
CREATE POLICY shared_salary_history_member_access ON public.shared_employee_salary_history
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_memberships m
            WHERE m.tenant_id = shared_employee_salary_history.tenant_id
              AND m.member_id = auth.uid()
              AND m.accepted_at IS NOT NULL
              AND m.revoked_at IS NULL
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_memberships m
            WHERE m.tenant_id = shared_employee_salary_history.tenant_id
              AND m.member_id = auth.uid()
              AND m.accepted_at IS NOT NULL
              AND m.revoked_at IS NULL
        )
    );

DO $$
DECLARE
    t record;
BEGIN
    FOR t IN SELECT id, schema_name FROM public.tenants LOOP
        EXECUTE format($sql$
            INSERT INTO public.shared_employee_salary_history
                (tenant_id, id, employee_cedula, company_id, salario_mensual,
                 moneda, fecha_desde, created_at)
            SELECT %L::uuid, h.id, h.employee_cedula, h.company_id,
                   h.salario_mensual, h.moneda, h.fecha_desde, h.created_at
            FROM %I.employee_salary_history h
            JOIN public.shared_companies c
              ON c.tenant_id = %L::uuid AND c.id = h.company_id
            ON CONFLICT (tenant_id, id) DO NOTHING
        $sql$, t.id, t.schema_name, t.id);
    END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_employee_salary_history TO authenticated;
