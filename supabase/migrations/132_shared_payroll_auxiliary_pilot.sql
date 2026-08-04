-- 132_shared_payroll_auxiliary_pilot.sql
-- Auxiliary payroll records. No data is copied between tenants.

CREATE TABLE IF NOT EXISTS public.shared_payroll_work_hours (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, company_id text NOT NULL, employee_id text NOT NULL, employee_cedula text NOT NULL,
    period_start date NOT NULL, period_end date NOT NULL, hours numeric(10,2) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'pending', notes text NOT NULL DEFAULT '', approved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,company_id,employee_id,period_start,period_end),
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.shared_payroll_ari_declarations (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, company_id text NOT NULL, employee_id text NOT NULL, employee_cedula text NOT NULL,
    taxable_year integer NOT NULL, taxable_quarter integer NOT NULL DEFAULT 1, ut_value numeric(14,2) NOT NULL DEFAULT 0,
    quarterly_remuneration numeric(14,2) NOT NULL DEFAULT 0, use_single_deduction boolean NOT NULL DEFAULT true,
    education_deduction numeric(14,2) NOT NULL DEFAULT 0, insurance_deduction numeric(14,2) NOT NULL DEFAULT 0,
    medical_deduction numeric(14,2) NOT NULL DEFAULT 0, interest_deduction numeric(14,2) NOT NULL DEFAULT 0,
    family_dependents integer NOT NULL DEFAULT 0, excess_withheld numeric(14,2) NOT NULL DEFAULT 0,
    withholding_percentage numeric(5,2) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,employee_id,taxable_year,taxable_quarter), CHECK (taxable_quarter BETWEEN 1 AND 4),
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.shared_payroll_cesta_ticket_runs (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, company_id text NOT NULL, period_start date NOT NULL, period_end date NOT NULL,
    amount_usd numeric(14,2) NOT NULL, exchange_rate numeric(14,4) NOT NULL, status text NOT NULL DEFAULT 'confirmed',
    confirmed_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id,id),
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.shared_payroll_cesta_ticket_receipts (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, run_id text NOT NULL, company_id text NOT NULL, employee_id text NOT NULL, employee_cedula text NOT NULL,
    employee_name text NOT NULL, employee_role text NOT NULL DEFAULT '', amount_usd numeric(14,2) NOT NULL, amount_ves numeric(14,2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id,id),
    FOREIGN KEY (tenant_id,run_id) REFERENCES public.shared_payroll_cesta_ticket_runs(tenant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS public.shared_payroll_bono_guerra_runs (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, company_id text NOT NULL, period_start date NOT NULL, period_end date NOT NULL,
    amount_usd numeric(14,2) NOT NULL, exchange_rate numeric(14,4) NOT NULL, status text NOT NULL DEFAULT 'confirmed',
    confirmed_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id,id),
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.shared_payroll_bono_guerra_receipts (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, run_id text NOT NULL, company_id text NOT NULL, employee_id text NOT NULL, employee_cedula text NOT NULL,
    employee_name text NOT NULL, employee_role text NOT NULL DEFAULT '', amount_usd numeric(14,2) NOT NULL, amount_ves numeric(14,2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id,id),
    FOREIGN KEY (tenant_id,run_id) REFERENCES public.shared_payroll_bono_guerra_runs(tenant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS public.shared_payroll_bonifications_runs (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, company_id text NOT NULL, period_start date NOT NULL, period_end date NOT NULL,
    exchange_rate numeric(14,4) NOT NULL, total_ves numeric(14,2) NOT NULL DEFAULT 0, employee_count integer NOT NULL DEFAULT 0,
    line_count integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'confirmed', confirmed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id,id),
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.shared_payroll_bonifications_receipts (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, run_id text NOT NULL, company_id text NOT NULL, employee_id text NOT NULL, employee_cedula text NOT NULL,
    employee_name text NOT NULL, employee_role text NOT NULL DEFAULT '', total_ves numeric(14,2) NOT NULL DEFAULT 0,
    bonus_lines jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id,id),
    FOREIGN KEY (tenant_id,run_id) REFERENCES public.shared_payroll_bonifications_runs(tenant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id)
);

CREATE INDEX IF NOT EXISTS shared_work_hours_company_period_idx ON public.shared_payroll_work_hours(tenant_id,company_id,period_start,period_end);
CREATE INDEX IF NOT EXISTS shared_ari_company_year_idx ON public.shared_payroll_ari_declarations(tenant_id,company_id,taxable_year,taxable_quarter);
CREATE INDEX IF NOT EXISTS shared_cesta_runs_company_idx ON public.shared_payroll_cesta_ticket_runs(tenant_id,company_id);
CREATE INDEX IF NOT EXISTS shared_cesta_receipts_run_idx ON public.shared_payroll_cesta_ticket_receipts(tenant_id,run_id);
CREATE INDEX IF NOT EXISTS shared_bono_runs_company_idx ON public.shared_payroll_bono_guerra_runs(tenant_id,company_id);
CREATE INDEX IF NOT EXISTS shared_bono_receipts_run_idx ON public.shared_payroll_bono_guerra_receipts(tenant_id,run_id);
CREATE INDEX IF NOT EXISTS shared_bonif_runs_company_idx ON public.shared_payroll_bonifications_runs(tenant_id,company_id);
CREATE INDEX IF NOT EXISTS shared_bonif_receipts_run_idx ON public.shared_payroll_bonifications_receipts(tenant_id,run_id);

DO $$
DECLARE r record; n bigint;
BEGIN
 FOR r IN SELECT id,schema_name FROM public.tenants LOOP
  EXECUTE format('SELECT count(*) FROM %I.payroll_work_hours x LEFT JOIN public.shared_companies c ON c.tenant_id=%L::uuid AND c.id=x.company_id WHERE c.id IS NULL',r.schema_name,r.id) INTO n; IF n>0 THEN RAISE EXCEPTION 'Tenant % work hours without company: %',r.id,n; END IF;
  EXECUTE format('SELECT count(*) FROM %I.ari_declarations x LEFT JOIN public.shared_companies c ON c.tenant_id=%L::uuid AND c.id=x.company_id WHERE c.id IS NULL',r.schema_name,r.id) INTO n; IF n>0 THEN RAISE EXCEPTION 'Tenant % ARI declarations without company: %',r.id,n; END IF;
  EXECUTE format('SELECT count(*) FROM %I.cesta_ticket_receipts x LEFT JOIN %I.cesta_ticket_runs y ON y.id=x.run_id WHERE y.id IS NULL',r.schema_name,r.schema_name) INTO n; IF n>0 THEN RAISE EXCEPTION 'Tenant % cesta receipts without local run: %',r.id,n; END IF;
  EXECUTE format('SELECT count(*) FROM %I.bono_guerra_receipts x LEFT JOIN %I.bono_guerra_runs y ON y.id=x.run_id WHERE y.id IS NULL',r.schema_name,r.schema_name) INTO n; IF n>0 THEN RAISE EXCEPTION 'Tenant % bono receipts without local run: %',r.id,n; END IF;
  EXECUTE format('SELECT count(*) FROM %I.bonificaciones_receipts x LEFT JOIN %I.bonificaciones_runs y ON y.id=x.run_id WHERE y.id IS NULL',r.schema_name,r.schema_name) INTO n; IF n>0 THEN RAISE EXCEPTION 'Tenant % bonification receipts without local run: %',r.id,n; END IF;
  EXECUTE format($q$INSERT INTO public.shared_payroll_work_hours(tenant_id,id,company_id,employee_id,employee_cedula,period_start,period_end,hours,status,notes,approved_at,created_at,updated_at) SELECT %L::uuid,id,company_id,employee_id,employee_cedula,period_start,period_end,hours,status,notes,approved_at,created_at,updated_at FROM %I.payroll_work_hours ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
  EXECUTE format($q$INSERT INTO public.shared_payroll_ari_declarations(tenant_id,id,company_id,employee_id,employee_cedula,taxable_year,taxable_quarter,ut_value,quarterly_remuneration,use_single_deduction,education_deduction,insurance_deduction,medical_deduction,interest_deduction,family_dependents,excess_withheld,withholding_percentage,created_at,updated_at) SELECT %L::uuid,id,company_id,employee_id,employee_cedula,anio_gravable,trimestre_gravable,valor_ut,remuneracion_trimestral,usar_desgravamen_unico,desg_educacion,desg_seguros,desg_medicos,desg_intereses,cargas_familiares,impuestos_retenidos_de_mas,porcentaje_retencion,created_at,updated_at FROM %I.ari_declarations ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
  EXECUTE format($q$INSERT INTO public.shared_payroll_cesta_ticket_runs(tenant_id,id,company_id,period_start,period_end,amount_usd,exchange_rate,status,confirmed_at,created_at) SELECT %L::uuid,id,company_id,period_start,period_end,monto_usd,exchange_rate,status,confirmed_at,created_at FROM %I.cesta_ticket_runs ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
  EXECUTE format($q$INSERT INTO public.shared_payroll_cesta_ticket_receipts(tenant_id,id,run_id,company_id,employee_id,employee_cedula,employee_name,employee_role,amount_usd,amount_ves,created_at) SELECT %L::uuid,id,run_id,company_id,employee_id,employee_nombre,employee_nombre,employee_cargo,monto_usd,monto_ves,created_at FROM %I.cesta_ticket_receipts ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
  EXECUTE format($q$INSERT INTO public.shared_payroll_bono_guerra_runs(tenant_id,id,company_id,period_start,period_end,amount_usd,exchange_rate,status,confirmed_at,created_at) SELECT %L::uuid,id,company_id,period_start,period_end,monto_usd,exchange_rate,status,confirmed_at,created_at FROM %I.bono_guerra_runs ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
  EXECUTE format($q$INSERT INTO public.shared_payroll_bono_guerra_receipts(tenant_id,id,run_id,company_id,employee_id,employee_cedula,employee_name,employee_role,amount_usd,amount_ves,created_at) SELECT %L::uuid,id,run_id,company_id,employee_id,employee_nombre,employee_nombre,employee_cargo,monto_usd,monto_ves,created_at FROM %I.bono_guerra_receipts ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
  EXECUTE format($q$INSERT INTO public.shared_payroll_bonifications_runs(tenant_id,id,company_id,period_start,period_end,exchange_rate,total_ves,employee_count,line_count,status,confirmed_at,created_at) SELECT %L::uuid,id,company_id,period_start,period_end,exchange_rate,total_ves,employee_count,line_count,status,confirmed_at,created_at FROM %I.bonificaciones_runs ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
  EXECUTE format($q$INSERT INTO public.shared_payroll_bonifications_receipts(tenant_id,id,run_id,company_id,employee_id,employee_cedula,employee_name,employee_role,total_ves,bonus_lines,created_at) SELECT %L::uuid,id,run_id,company_id,employee_id,employee_nombre,employee_nombre,employee_cargo,total_ves,bonus_lines,created_at FROM %I.bonificaciones_receipts ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
 END LOOP;
END $$;

DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT unnest(ARRAY['shared_payroll_work_hours','shared_payroll_ari_declarations','shared_payroll_cesta_ticket_runs','shared_payroll_cesta_ticket_receipts','shared_payroll_bono_guerra_runs','shared_payroll_bono_guerra_receipts','shared_payroll_bonifications_runs','shared_payroll_bonifications_receipts']) LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS %I_member_access ON public.%I',t,t);
  EXECUTE format('CREATE POLICY %I_member_access ON public.%I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=%I.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL)) WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=%I.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL))',t,t,t,t);
 END LOOP;
END $$;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.shared_payroll_work_hours,public.shared_payroll_ari_declarations,public.shared_payroll_cesta_ticket_runs,public.shared_payroll_cesta_ticket_receipts,public.shared_payroll_bono_guerra_runs,public.shared_payroll_bono_guerra_receipts,public.shared_payroll_bonifications_runs,public.shared_payroll_bonifications_receipts TO authenticated;
