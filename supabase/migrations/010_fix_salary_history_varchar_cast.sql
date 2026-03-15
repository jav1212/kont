-- =============================================================================
-- 010_fix_salary_history_varchar_cast.sql
-- La columna `moneda` en employee_salary_history es varchar(3) pero la función
-- declaraba el retorno como text. Mismo problema que 009 para employees.
-- Fix: castear moneda::text en el SELECT dinámico.
-- =============================================================================

DROP FUNCTION IF EXISTS public.tenant_employee_salary_history(uuid, text, text);

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
        'SELECT id, salario_mensual, moneda::text, fecha_desde, created_at
         FROM %I.employee_salary_history
         WHERE company_id = $1 AND employee_cedula = $2
         ORDER BY fecha_desde DESC, created_at DESC',
        v_schema
    ) USING p_company_id, p_employee_cedula;
END;
$$;
