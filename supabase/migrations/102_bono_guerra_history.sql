-- =============================================================================
-- 102_bono_guerra_history.sql
-- Historial persistente de cálculos de Bono de Guerra Socio Económico (borradores
-- + confirmados), espejando el patrón de 078_cesta_ticket_history.sql.
--
-- Contexto legal: Bono Contra la Guerra Económica (Gaceta Oficial 2023),
-- ratificado por el ajuste del ingreso mínimo integral a $240/mes vigente desde
-- el 1° de mayo de 2026 ($130 Bs salario base + $40 cesta ticket + $200 bono
-- de guerra). El bono NO forma parte del salario y NO es cuantificable a
-- efectos de prestaciones sociales (Art. 105 LOTTT).
--
-- Agrega:
--   tenant.<schema>.bono_guerra_runs       — un registro por (empresa, periodo)
--   tenant.<schema>.bono_guerra_receipts   — un registro por empleado
--
-- RPCs públicos:
--   tenant_bono_guerra_run_save(p_user_id, p_run, p_receipts, p_status)
--   tenant_bono_guerra_runs_by_company(p_user_id, p_company_id)
--   tenant_bono_guerra_receipts_by_run(p_user_id, p_run_id)
--
-- La lógica de UPSERT del draft replica 078:
--   * status='confirmed' existente → RAISE (immutable).
--   * status='draft'     existente → DELETE receipts + UPDATE run + INSERT receipts.
--   * sin run previo               → INSERT nuevo run.
--
-- confirmed_at se reusa como "last saved at" para drafts.
--
-- Lockdown P0 (mig 098): los 3 RPCs nuevos REVOKE EXECUTE FROM anon/auth/public
-- al final del archivo. Sólo service_role los invoca desde el backend Next.
-- =============================================================================

-- ── 1. Agregar las tablas a todos los tenants existentes ─────────────────────

DO $$
DECLARE r record; v_schema text;
BEGIN
    FOR r IN SELECT schema_name, id FROM public.tenants LOOP
        v_schema := r.schema_name;

        -- bono_guerra_runs
        EXECUTE format($tbl$
            CREATE TABLE IF NOT EXISTS %I.bono_guerra_runs (
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

        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS bono_guerra_runs_company_idx ON %I.bono_guerra_runs(company_id)',
            v_schema
        );

        -- bono_guerra_receipts
        EXECUTE format($tbl$
            CREATE TABLE IF NOT EXISTS %I.bono_guerra_receipts (
                id              text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
                run_id          text          NOT NULL REFERENCES %I.bono_guerra_runs(id) ON DELETE CASCADE,
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

        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS bono_guerra_receipts_run_idx ON %I.bono_guerra_receipts(run_id)',
            v_schema
        );
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS bono_guerra_receipts_company_idx ON %I.bono_guerra_receipts(company_id)',
            v_schema
        );

        -- RLS
        EXECUTE format('ALTER TABLE %I.bono_guerra_runs     ENABLE ROW LEVEL SECURITY', v_schema);
        EXECUTE format('ALTER TABLE %I.bono_guerra_receipts ENABLE ROW LEVEL SECURITY', v_schema);

        EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.bono_guerra_runs',     v_schema);
        EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.bono_guerra_receipts', v_schema);
        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.bono_guerra_runs FOR ALL USING (auth.uid() = %L::uuid)',
            v_schema, r.id
        );
        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.bono_guerra_receipts FOR ALL USING (auth.uid() = %L::uuid)',
            v_schema, r.id
        );

        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated',
            v_schema
        );
    END LOOP;
END;
$$;

-- ── 2. Extender provision_tenant_schema para que los nuevos tenants ───────────
--      también reciban estas tablas. Se redefine la función completa siguiendo
--      el patrón establecido en 078.

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
            id               text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            owner_id         text        NOT NULL,
            name             text        NOT NULL,
            rif              text,
            phone            text,
            address          text,
            logo_url         text,
            show_logo_in_pdf boolean     NOT NULL DEFAULT false,
            sector           text,
            inventory_config jsonb       NOT NULL DEFAULT '{}'::jsonb,
            created_at       timestamptz NOT NULL DEFAULT now(),
            updated_at       timestamptz NOT NULL DEFAULT now()
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

    -- bono_guerra_runs
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.bono_guerra_runs (
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

    EXECUTE format('CREATE INDEX IF NOT EXISTS bono_guerra_runs_company_idx ON %I.bono_guerra_runs(company_id)', v_schema);

    -- bono_guerra_receipts
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.bono_guerra_receipts (
            id              text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            run_id          text          NOT NULL REFERENCES %I.bono_guerra_runs(id) ON DELETE CASCADE,
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

    EXECUTE format('CREATE INDEX IF NOT EXISTS bono_guerra_receipts_run_idx     ON %I.bono_guerra_receipts(run_id)',     v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS bono_guerra_receipts_company_idx ON %I.bono_guerra_receipts(company_id)', v_schema);

    -- RLS
    EXECUTE format('ALTER TABLE %I.companies              ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employees              ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_runs           ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_receipts       ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.cesta_ticket_runs      ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.cesta_ticket_receipts  ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.bono_guerra_runs       ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.bono_guerra_receipts   ENABLE ROW LEVEL SECURITY', v_schema);

    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.companies',              v_schema);
    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.employees',              v_schema);
    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.payroll_runs',           v_schema);
    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.payroll_receipts',       v_schema);
    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.cesta_ticket_runs',      v_schema);
    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.cesta_ticket_receipts',  v_schema);
    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.bono_guerra_runs',       v_schema);
    EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.bono_guerra_receipts',   v_schema);

    EXECUTE format('CREATE POLICY tenant_owner ON %I.companies FOR ALL USING (auth.uid() = %L::uuid)',              v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.employees FOR ALL USING (auth.uid() = %L::uuid)',              v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_runs FOR ALL USING (auth.uid() = %L::uuid)',           v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_receipts FOR ALL USING (auth.uid() = %L::uuid)',       v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.cesta_ticket_runs FOR ALL USING (auth.uid() = %L::uuid)',      v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.cesta_ticket_receipts FOR ALL USING (auth.uid() = %L::uuid)',  v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.bono_guerra_runs FOR ALL USING (auth.uid() = %L::uuid)',       v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.bono_guerra_receipts FOR ALL USING (auth.uid() = %L::uuid)',   v_schema, p_user_id);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', v_schema);

    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;
END;
$$;

-- ── 3. RPC: tenant_bono_guerra_run_save ─────────────────────────────────────
--   UPSERT semantics idénticas a tenant_cesta_ticket_run_save (078).

CREATE OR REPLACE FUNCTION public.tenant_bono_guerra_run_save(
    p_user_id  uuid,
    p_run      jsonb,
    p_receipts jsonb,
    p_status   text DEFAULT 'confirmed'
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema          text;
    v_run_id          text;
    v_existing_id     text;
    v_existing_status text;
    v_receipt         jsonb;
BEGIN
    IF p_status NOT IN ('draft', 'confirmed') THEN
        RAISE EXCEPTION 'invalid bono de guerra status: %', p_status;
    END IF;

    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'SELECT id, status FROM %I.bono_guerra_runs
         WHERE company_id = %L AND period_start = %L::date AND period_end = %L::date
         LIMIT 1',
        v_schema,
        p_run->>'companyId',
        p_run->>'periodStart',
        p_run->>'periodEnd'
    ) INTO v_existing_id, v_existing_status;

    IF v_existing_id IS NOT NULL THEN
        IF v_existing_status = 'confirmed' THEN
            RAISE EXCEPTION 'A bono de guerra run already exists for this period.';
        END IF;

        v_run_id := v_existing_id;
        EXECUTE format('DELETE FROM %I.bono_guerra_receipts WHERE run_id = %L', v_schema, v_run_id);
        EXECUTE format(
            'UPDATE %I.bono_guerra_runs
             SET status = %L, monto_usd = %L::numeric, exchange_rate = %L::numeric, confirmed_at = now()
             WHERE id = %L',
            v_schema, p_status,
            p_run->>'montoUsd', p_run->>'exchangeRate',
            v_run_id
        );
    ELSE
        v_run_id := gen_random_uuid()::text;
        EXECUTE format(
            'INSERT INTO %I.bono_guerra_runs
             (id, company_id, period_start, period_end, monto_usd, exchange_rate, status, confirmed_at)
             VALUES (%L, %L, %L::date, %L::date, %L::numeric, %L::numeric, %L, now())',
            v_schema, v_run_id,
            p_run->>'companyId', p_run->>'periodStart', p_run->>'periodEnd',
            p_run->>'montoUsd', p_run->>'exchangeRate', p_status
        );
    END IF;

    FOR v_receipt IN SELECT * FROM jsonb_array_elements(p_receipts) LOOP
        EXECUTE format(
            'INSERT INTO %I.bono_guerra_receipts
             (id, run_id, company_id, employee_id, employee_cedula, employee_nombre, employee_cargo,
              monto_usd, monto_ves)
             VALUES (%L,%L,%L,%L,%L,%L,%L,%L::numeric,%L::numeric)',
            v_schema,
            gen_random_uuid()::text, v_run_id,
            v_receipt->>'companyId',
            COALESCE(v_receipt->>'employeeId', v_receipt->>'employeeCedula'),
            v_receipt->>'employeeCedula', v_receipt->>'employeeNombre', v_receipt->>'employeeCargo',
            v_receipt->>'montoUsd', v_receipt->>'montoVes'
        );
    END LOOP;

    RETURN v_run_id;
END;
$$;

-- ── 4. RPC: tenant_bono_guerra_runs_by_company ──────────────────────────────

CREATE OR REPLACE FUNCTION public.tenant_bono_guerra_runs_by_company(
    p_user_id    uuid,
    p_company_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.confirmed_at DESC), ''[]''::jsonb)
         FROM %I.bono_guerra_runs r WHERE r.company_id = %L',
        v_schema, p_company_id
    ) INTO v_result;
    RETURN v_result;
END;
$$;

-- ── 5. RPC: tenant_bono_guerra_receipts_by_run ──────────────────────────────

CREATE OR REPLACE FUNCTION public.tenant_bono_guerra_receipts_by_run(
    p_user_id uuid,
    p_run_id  text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.employee_nombre), ''[]''::jsonb)
         FROM %I.bono_guerra_receipts r WHERE r.run_id = %L',
        v_schema, p_run_id
    ) INTO v_result;
    RETURN v_result;
END;
$$;

-- ── 6. Lockdown P0 (mig 098) — REVOKE EXECUTE de los 3 RPCs nuevos ──────────
--      desde anon/authenticated/public. service_role mantiene su grant default.

REVOKE EXECUTE ON FUNCTION public.tenant_bono_guerra_run_save(uuid, jsonb, jsonb, text)
    FROM anon, authenticated, public;

REVOKE EXECUTE ON FUNCTION public.tenant_bono_guerra_runs_by_company(uuid, text)
    FROM anon, authenticated, public;

REVOKE EXECUTE ON FUNCTION public.tenant_bono_guerra_receipts_by_run(uuid, text)
    FROM anon, authenticated, public;
