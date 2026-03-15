-- =============================================================================
-- 005_tenant_rpc_functions.sql
-- Funciones RPC en public que consultan el schema privado del tenant.
-- Todas usan public.tenant_get_schema(uuid) como helper.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: resuelve el schema de un usuario
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tenant_get_schema(p_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
    SELECT schema_name INTO v_schema FROM public.tenants WHERE id = p_user_id;
    IF v_schema IS NULL THEN
        RAISE EXCEPTION 'Tenant no encontrado para el usuario %', p_user_id USING ERRCODE = 'P0001';
    END IF;
    RETURN v_schema;
END;
$$;

-- ===========================================================================
-- COMPANIES
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.tenant_companies_get_all(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.name), ''[]''::jsonb) FROM %I.companies c',
        v_schema
    ) INTO v_result;
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_company_get_by_id(p_user_id uuid, p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'SELECT row_to_json(c) FROM %I.companies c WHERE c.id = %L',
        v_schema, p_id
    ) INTO v_result;
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_company_save(
    p_user_id uuid, p_id text, p_owner_id text, p_name text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_now timestamptz := now();
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'INSERT INTO %I.companies (id, owner_id, name, created_at, updated_at) VALUES (%L, %L, %L, %L, %L)',
        v_schema, p_id, p_owner_id, p_name, v_now, v_now
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_company_update(p_user_id uuid, p_id text, p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'UPDATE %I.companies SET name = %L, updated_at = now() WHERE id = %L RETURNING row_to_json(companies)',
        v_schema, p_name, p_id
    ) INTO v_result;
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_company_delete(p_user_id uuid, p_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format('DELETE FROM %I.companies WHERE id = %L', v_schema, p_id);
END;
$$;

-- ===========================================================================
-- EMPLOYEES
-- Note: DROP before CREATE because return type changed from jsonb to TABLE.
-- ===========================================================================

DROP FUNCTION IF EXISTS public.tenant_employees_get_by_company(uuid, text);

CREATE FUNCTION public.tenant_employees_get_by_company(p_user_id uuid, p_company_id text)
RETURNS TABLE (
    id              text,
    company_id      text,
    cedula          text,
    nombre          text,
    cargo           text,
    salario_mensual numeric,
    estado          text,
    fecha_ingreso   date,
    moneda          text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    RETURN QUERY EXECUTE format(
        'SELECT id::text, company_id::text, cedula, nombre, cargo,
                salario_mensual, estado, fecha_ingreso,
                COALESCE(moneda::text, ''VES'') AS moneda
         FROM %I.employees
         WHERE company_id = $1
         ORDER BY nombre ASC',
        v_schema
    ) USING p_company_id;
END;
$$;

DROP FUNCTION IF EXISTS public.tenant_employees_upsert(uuid, jsonb);

CREATE FUNCTION public.tenant_employees_upsert(p_user_id uuid, p_employees jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'INSERT INTO %I.employees
           (id, company_id, cedula, nombre, cargo, salario_mensual, estado, fecha_ingreso, moneda)
         SELECT
           (e->>''id'')::text,
           (e->>''company_id'')::text,
           (e->>''cedula'')::text,
           (e->>''nombre'')::text,
           (e->>''cargo'')::text,
           (e->>''salario_mensual'')::numeric,
           (e->>''estado'')::text,
           NULLIF(e->>''fecha_ingreso'', '''')::date,
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

CREATE OR REPLACE FUNCTION public.tenant_employees_delete(p_user_id uuid, p_ids text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'DELETE FROM %I.employees WHERE id = ANY($1)',
        v_schema
    ) USING p_ids;
END;
$$;

CREATE FUNCTION public.tenant_employee_salary_history(
    p_user_id         uuid,
    p_company_id      text,
    p_employee_cedula text
)
RETURNS TABLE (
    id              uuid,
    salario_mensual numeric,
    moneda          text,
    fecha_desde     date,
    created_at      timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    RETURN QUERY EXECUTE format(
        'SELECT id, salario_mensual, moneda, fecha_desde, created_at
         FROM %I.employee_salary_history
         WHERE company_id = $1 AND employee_cedula = $2
         ORDER BY fecha_desde DESC, created_at DESC',
        v_schema
    ) USING p_company_id, p_employee_cedula;
END;
$$;

-- ===========================================================================
-- PAYROLL RUNS & RECEIPTS
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.tenant_payroll_runs_by_company(p_user_id uuid, p_company_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.confirmed_at DESC), ''[]''::jsonb) FROM %I.payroll_runs r WHERE r.company_id = %L',
        v_schema, p_company_id
    ) INTO v_result;
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_payroll_run_save(p_user_id uuid, p_run jsonb, p_receipts jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema  text;
    v_run_id  text := gen_random_uuid()::text;
    v_receipt jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'INSERT INTO %I.payroll_runs (id, company_id, period_start, period_end, exchange_rate, status, confirmed_at)
         VALUES (%L, %L, %L::date, %L::date, %L::numeric, ''confirmed'', now())',
        v_schema, v_run_id,
        p_run->>'companyId', p_run->>'periodStart', p_run->>'periodEnd', p_run->>'exchangeRate'
    );

    FOR v_receipt IN SELECT * FROM jsonb_array_elements(p_receipts) LOOP
        EXECUTE format(
            'INSERT INTO %I.payroll_receipts
             (id, run_id, company_id, employee_id, employee_cedula, employee_nombre, employee_cargo,
              monthly_salary, total_earnings, total_deductions, total_bonuses, net_pay, calculation_data)
             VALUES (%L,%L,%L,%L,%L,%L,%L,%L::numeric,%L::numeric,%L::numeric,%L::numeric,%L::numeric,%L::jsonb)',
            v_schema,
            gen_random_uuid()::text, v_run_id,
            v_receipt->>'companyId',
            COALESCE(v_receipt->>'employeeId', v_receipt->>'employeeCedula'),
            v_receipt->>'employeeCedula', v_receipt->>'employeeNombre', v_receipt->>'employeeCargo',
            v_receipt->>'monthlySalary', v_receipt->>'totalEarnings',
            v_receipt->>'totalDeductions', v_receipt->>'totalBonuses', v_receipt->>'netPay',
            COALESCE(v_receipt->>'calculationData', '{}')
        );
    END LOOP;

    RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_payroll_receipts_by_run(p_user_id uuid, p_run_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.employee_nombre), ''[]''::jsonb) FROM %I.payroll_receipts r WHERE r.run_id = %L',
        v_schema, p_run_id
    ) INTO v_result;
    RETURN v_result;
END;
$$;
