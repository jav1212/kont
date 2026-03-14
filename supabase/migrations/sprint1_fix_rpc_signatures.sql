-- ============================================================================
-- sprint1_fix_rpc_signatures.sql
-- Problema: sprint1_employee_fields.sql creó versiones TEXT de las RPCs,
-- pero las versiones originales (005) usan UUID. Postgres no puede elegir
-- entre los dos overloads => error "could not choose best candidate".
--
-- Solución: eliminar las versiones TEXT y reemplazar con UUID (patrón del resto).
-- Ejecutar DESPUÉS de sprint1_employee_fields.sql si ya lo corriste.
-- ============================================================================

-- 1. Eliminar TODAS las versiones existentes (UUID y TEXT)
--    Necesario porque CREATE OR REPLACE no puede cambiar el tipo de retorno
DROP FUNCTION IF EXISTS public.tenant_employees_get_by_company(uuid, text);
DROP FUNCTION IF EXISTS public.tenant_employees_get_by_company(text, text);
DROP FUNCTION IF EXISTS public.tenant_employees_upsert(uuid, jsonb);
DROP FUNCTION IF EXISTS public.tenant_employees_upsert(text, jsonb);
DROP FUNCTION IF EXISTS public.tenant_employee_salary_history(uuid, text, text);
DROP FUNCTION IF EXISTS public.tenant_employee_salary_history(text, text, text);

-- 2. Reemplazar con versiones UUID (mismo patrón que 005_tenant_rpc_functions.sql)
--    Estas reemplazan las originales de 005 que no conocían moneda/fecha_ingreso.

CREATE OR REPLACE FUNCTION public.tenant_employees_get_by_company(
  p_user_id    UUID,
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_schema TEXT;
BEGIN
  v_schema := public.tenant_get_schema(p_user_id);

  RETURN QUERY EXECUTE format(
    'SELECT id::text, company_id::text, cedula, nombre, cargo,
            salario_mensual, estado, fecha_ingreso, moneda
     FROM %I.employees
     WHERE company_id = $1
     ORDER BY nombre ASC',
    v_schema
  ) USING p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_employees_upsert(
  p_user_id   UUID,
  p_employees JSONB
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_schema TEXT;
BEGIN
  v_schema := public.tenant_get_schema(p_user_id);

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
  p_user_id         UUID,
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_schema TEXT;
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
