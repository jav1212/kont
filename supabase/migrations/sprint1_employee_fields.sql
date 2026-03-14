-- ============================================================================
-- SPRINT 1: Fecha de ingreso + Moneda + Historial de salarios
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================================

-- ── PARTE A: Funciones de trigger (en public, usan TG_TABLE_SCHEMA) ─────────

-- Trigger: registrar cambio de salario en UPDATE
CREATE OR REPLACE FUNCTION public.fn_record_salary_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.salario_mensual IS DISTINCT FROM NEW.salario_mensual
  OR OLD.moneda          IS DISTINCT FROM NEW.moneda
  THEN
    EXECUTE format(
      'INSERT INTO %I.employee_salary_history
         (employee_cedula, company_id, salario_mensual, moneda, fecha_desde)
       VALUES ($1, $2, $3, $4, $5)',
      TG_TABLE_SCHEMA
    ) USING NEW.cedula, NEW.company_id, NEW.salario_mensual, NEW.moneda, CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger: registrar salario inicial en INSERT
CREATE OR REPLACE FUNCTION public.fn_record_initial_salary()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'INSERT INTO %I.employee_salary_history
       (employee_cedula, company_id, salario_mensual, moneda, fecha_desde)
     VALUES ($1, $2, $3, $4, $5)',
    TG_TABLE_SCHEMA
  ) USING NEW.cedula, NEW.company_id, NEW.salario_mensual, NEW.moneda,
          COALESCE(NEW.fecha_ingreso, CURRENT_DATE);
  RETURN NEW;
END;
$$;

-- ── PARTE B: Aplicar DDL a todos los tenants existentes ──────────────────────

DO $$
DECLARE
  v_schema   TEXT;
  v_owner_id TEXT;
BEGIN
  FOR v_schema IN
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  LOOP
    RAISE NOTICE 'Migrando schema: %', v_schema;

    -- 1. Agregar columnas a employees (idempotente)
    EXECUTE format(
      'ALTER TABLE %I.employees ADD COLUMN IF NOT EXISTS fecha_ingreso DATE',
      v_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.employees ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) NOT NULL DEFAULT ''VES''',
      v_schema
    );

    -- 2. Crear tabla employee_salary_history
    EXECUTE format($tbl$
      CREATE TABLE IF NOT EXISTS %I.employee_salary_history (
        id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
        employee_cedula TEXT          NOT NULL,
        company_id      TEXT          NOT NULL,
        salario_mensual NUMERIC(12,2) NOT NULL,
        moneda          VARCHAR(3)    NOT NULL DEFAULT 'VES',
        fecha_desde     DATE          NOT NULL DEFAULT CURRENT_DATE,
        created_at      TIMESTAMPTZ   DEFAULT NOW()
      )
    $tbl$, v_schema);

    -- 3. Índice
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_salary_history_emp ON %I.employee_salary_history (company_id, employee_cedula, fecha_desde DESC)',
      v_schema
    );

    -- 4. RLS en la nueva tabla
    EXECUTE format(
      'ALTER TABLE %I.employee_salary_history ENABLE ROW LEVEL SECURITY',
      v_schema
    );

    -- Obtener el user_id del tenant desde public.tenants
    SELECT t.id::text INTO v_owner_id
    FROM public.tenants t
    WHERE t.schema_name = v_schema
    LIMIT 1;

    -- Crear política RLS (si no existe aún)
    IF v_owner_id IS NOT NULL THEN
      EXECUTE format(
        'DO $p$ BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM pg_policies
             WHERE schemaname = %L AND tablename = ''employee_salary_history'' AND policyname = ''tenant_owner''
           ) THEN
             CREATE POLICY tenant_owner ON %I.employee_salary_history
               FOR ALL USING (auth.uid() = %L::uuid);
           END IF;
         END $p$',
        v_schema, v_schema, v_owner_id
      );
    END IF;

    -- Permisos DML para el rol authenticated
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON %I.employee_salary_history TO authenticated',
      v_schema
    );

    -- 5. Trigger UPDATE → fn_record_salary_change
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_salary_change ON %I.employees',
      v_schema
    );
    EXECUTE format(
      'CREATE TRIGGER trg_salary_change
         AFTER UPDATE ON %I.employees
         FOR EACH ROW EXECUTE FUNCTION public.fn_record_salary_change()',
      v_schema
    );

    -- 6. Trigger INSERT → fn_record_initial_salary
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_initial_salary ON %I.employees',
      v_schema
    );
    EXECUTE format(
      'CREATE TRIGGER trg_initial_salary
         AFTER INSERT ON %I.employees
         FOR EACH ROW EXECUTE FUNCTION public.fn_record_initial_salary()',
      v_schema
    );

  END LOOP;
END;
$$;

-- ── PARTE C: Actualizar provision_tenant_schema para nuevos tenants ──────────

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

    -- 1. Schema
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);

    -- 2. Permisos de schema
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon', v_schema);

    -- 3. companies
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.companies (
            id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            owner_id    text        NOT NULL,
            name        text        NOT NULL,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema);

    -- 4. employees (con moneda y fecha_ingreso desde el inicio)
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.employees (
            id              text        PRIMARY KEY,
            company_id      text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            cedula          text        NOT NULL,
            nombre          text        NOT NULL,
            cargo           text        NOT NULL DEFAULT '',
            salario_mensual numeric(14,2) NOT NULL DEFAULT 0,
            moneda          varchar(3)  NOT NULL DEFAULT 'VES',
            estado          text        NOT NULL DEFAULT 'activo',
            fecha_ingreso   date,
            created_at      timestamptz NOT NULL DEFAULT now(),
            updated_at      timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS employees_company_idx ON %I.employees(company_id)', v_schema);

    -- 5. employee_salary_history
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.employee_salary_history (
            id              uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
            employee_cedula text          NOT NULL,
            company_id      text          NOT NULL,
            salario_mensual numeric(12,2) NOT NULL,
            moneda          varchar(3)    NOT NULL DEFAULT 'VES',
            fecha_desde     date          NOT NULL DEFAULT CURRENT_DATE,
            created_at      timestamptz   DEFAULT now()
        )
    $tbl$, v_schema);

    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_salary_history_emp ON %I.employee_salary_history (company_id, employee_cedula, fecha_desde DESC)',
        v_schema
    );

    -- 6. payroll_runs
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

    -- 7. payroll_receipts
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

    -- 8. RLS
    EXECUTE format('ALTER TABLE %I.companies                ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employees                ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employee_salary_history  ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_runs             ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_receipts         ENABLE ROW LEVEL SECURITY', v_schema);

    EXECUTE format('CREATE POLICY tenant_owner ON %I.companies               FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.employees               FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.employee_salary_history FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_runs            FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_receipts        FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);

    -- 9. Permisos DML
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', v_schema);

    -- 10. Triggers de historial de salario
    EXECUTE format(
        'CREATE TRIGGER trg_salary_change AFTER UPDATE ON %I.employees FOR EACH ROW EXECUTE FUNCTION public.fn_record_salary_change()',
        v_schema
    );
    EXECUTE format(
        'CREATE TRIGGER trg_initial_salary AFTER INSERT ON %I.employees FOR EACH ROW EXECUTE FUNCTION public.fn_record_initial_salary()',
        v_schema
    );

    -- 11. Registrar tenant
    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;

END;
$$;

-- ── PARTE D: RPCs públicas ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tenant_employees_get_by_company(
  p_user_id    TEXT,
  p_company_id TEXT
)
RETURNS TABLE (
  id              TEXT,
  company_id      TEXT,
  cedula          TEXT,
  nombre          TEXT,
  cargo           TEXT,
  salario_mensual NUMERIC,
  estado          TEXT,
  fecha_ingreso   DATE,
  moneda          TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema TEXT;
BEGIN
  SELECT tenant_schema INTO v_schema
    FROM public.users WHERE id = p_user_id::UUID;
  IF v_schema IS NULL THEN RAISE EXCEPTION 'tenant not found'; END IF;

  RETURN QUERY EXECUTE format(
    'SELECT id, company_id, cedula, nombre, cargo, salario_mensual, estado,
            fecha_ingreso, moneda
     FROM %I.employees
     WHERE company_id = $1
     ORDER BY nombre ASC',
    v_schema
  ) USING p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_employees_upsert(
  p_user_id   TEXT,
  p_employees JSONB
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema TEXT;
BEGIN
  SELECT tenant_schema INTO v_schema
    FROM public.users WHERE id = p_user_id::UUID;
  IF v_schema IS NULL THEN RAISE EXCEPTION 'tenant not found'; END IF;

  EXECUTE format(
    'INSERT INTO %I.employees
       (id, company_id, cedula, nombre, cargo, salario_mensual, estado, fecha_ingreso, moneda)
     SELECT
       (e->>''id'')::TEXT,
       (e->>''company_id'')::TEXT,
       (e->>''cedula'')::TEXT,
       (e->>''nombre'')::TEXT,
       (e->>''cargo'')::TEXT,
       (e->>''salario_mensual'')::NUMERIC,
       (e->>''estado'')::TEXT,
       NULLIF(e->>''fecha_ingreso'', '''')::DATE,
       COALESCE(NULLIF(e->>''moneda'', ''''), ''VES'')
     FROM jsonb_array_elements($1) AS e
     ON CONFLICT (id) DO UPDATE SET
       nombre          = EXCLUDED.nombre,
       cargo           = EXCLUDED.cargo,
       salario_mensual = EXCLUDED.salario_mensual,
       estado          = EXCLUDED.estado,
       fecha_ingreso   = EXCLUDED.fecha_ingreso,
       moneda          = EXCLUDED.moneda,
       updated_at      = now()',
    v_schema
  ) USING p_employees;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_employee_salary_history(
  p_user_id         TEXT,
  p_company_id      TEXT,
  p_employee_cedula TEXT
)
RETURNS TABLE (
  id              UUID,
  salario_mensual NUMERIC,
  moneda          TEXT,
  fecha_desde     DATE,
  created_at      TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema TEXT;
BEGIN
  SELECT tenant_schema INTO v_schema
    FROM public.users WHERE id = p_user_id::UUID;
  IF v_schema IS NULL THEN RAISE EXCEPTION 'tenant not found'; END IF;

  RETURN QUERY EXECUTE format(
    'SELECT id, salario_mensual, moneda, fecha_desde, created_at
     FROM %I.employee_salary_history
     WHERE company_id = $1 AND employee_cedula = $2
     ORDER BY fecha_desde DESC, created_at DESC',
    v_schema
  ) USING p_company_id, p_employee_cedula;
END;
$$;
