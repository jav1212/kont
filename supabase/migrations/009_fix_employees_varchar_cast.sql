-- =============================================================================
-- 009_fix_employees_varchar_cast.sql
-- La columna `moneda` en tenant.employees es varchar(3) pero la función
-- declaraba el retorno como text. En RETURN QUERY EXECUTE Postgres es estricto
-- con los tipos: varchar != text → "structure of query does not match".
-- Fix: castear moneda::text en el SELECT dinámico.
-- =============================================================================

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
