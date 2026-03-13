-- =============================================================================
-- 006_plan_limits_enforcement.sql
-- Añade validación de límites de plan a las funciones RPC de tenant.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: devuelve los límites del plan activo de un tenant
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_get_plan_limits(p_user_id uuid)
RETURNS TABLE (max_companies int, max_employees_per_company int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT p.max_companies, p.max_employees_per_company
    FROM public.tenants t
    JOIN public.plans   p ON p.id = t.plan_id
    WHERE t.id = p_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- tenant_company_save: con validación de max_companies
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_company_save(
    p_user_id uuid, p_id text, p_owner_id text, p_name text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema        text;
    v_now           timestamptz := now();
    v_company_count int;
    v_max_companies int;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    SELECT l.max_companies INTO v_max_companies
    FROM public.tenant_get_plan_limits(p_user_id) l;

    EXECUTE format('SELECT COUNT(*) FROM %I.companies', v_schema)
        INTO v_company_count;

    IF v_max_companies IS NOT NULL AND v_company_count >= v_max_companies THEN
        RAISE EXCEPTION 'Límite de empresas alcanzado. Tu plan permite un máximo de % empresa(s).', v_max_companies
            USING ERRCODE = 'P0001';
    END IF;

    EXECUTE format(
        'INSERT INTO %I.companies (id, owner_id, name, created_at, updated_at)
         VALUES (%L, %L, %L, %L, %L)',
        v_schema, p_id, p_owner_id, p_name, v_now, v_now
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- tenant_employees_upsert: con validación de max_employees_per_company
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_employees_upsert(p_user_id uuid, p_employees jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema              text;
    v_emp                 jsonb;
    v_max_per_company     int;
    v_company_id          text;
    v_existing_count      int;
    v_new_count           int;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    SELECT l.max_employees_per_company INTO v_max_per_company
    FROM public.tenant_get_plan_limits(p_user_id) l;

    -- Validar por empresa solo si el plan tiene límite
    IF v_max_per_company IS NOT NULL THEN
        FOR v_company_id IN
            SELECT DISTINCT (emp->>'company_id')
            FROM jsonb_array_elements(p_employees) emp
        LOOP
            -- Empleados actuales en esa empresa
            EXECUTE format(
                'SELECT COUNT(*) FROM %I.employees WHERE company_id = $1',
                v_schema
            ) USING v_company_id INTO v_existing_count;

            -- Empleados del batch para esa empresa que NO existen aún (son nuevos)
            EXECUTE format(
                'SELECT COUNT(*) FROM jsonb_array_elements($1) emp
                 WHERE (emp->>''company_id'') = $2
                   AND NOT EXISTS (
                       SELECT 1 FROM %I.employees e WHERE e.id = (emp->>''id'')
                   )',
                v_schema
            ) USING p_employees, v_company_id INTO v_new_count;

            IF (v_existing_count + v_new_count) > v_max_per_company THEN
                RAISE EXCEPTION
                    'Límite de empleados alcanzado (máximo % por empresa según tu plan). La empresa ya tiene % empleado(s).',
                    v_max_per_company, v_existing_count
                    USING ERRCODE = 'P0001';
            END IF;
        END LOOP;
    END IF;

    -- Upsert
    FOR v_emp IN SELECT * FROM jsonb_array_elements(p_employees) LOOP
        EXECUTE format(
            'INSERT INTO %I.employees
                (id, company_id, cedula, nombre, cargo, salario_mensual, estado, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, now())
             ON CONFLICT (id) DO UPDATE SET
                company_id      = EXCLUDED.company_id,
                cedula          = EXCLUDED.cedula,
                nombre          = EXCLUDED.nombre,
                cargo           = EXCLUDED.cargo,
                salario_mensual = EXCLUDED.salario_mensual,
                estado          = EXCLUDED.estado,
                updated_at      = now()',
            v_schema
        ) USING
            v_emp->>'id',
            v_emp->>'company_id',
            v_emp->>'cedula',
            v_emp->>'nombre',
            v_emp->>'cargo',
            (v_emp->>'salario_mensual')::numeric,
            COALESCE(v_emp->>'estado', 'activo');
    END LOOP;
END;
$$;
