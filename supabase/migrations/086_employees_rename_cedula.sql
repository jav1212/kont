-- =============================================================================
-- 086_employees_rename_cedula.sql
-- Permite editar la cédula (PK) de un empleado y propagar el cambio en cascada
-- a todas las tablas históricas que la denormalizan: payroll_receipts,
-- cesta_ticket_receipts y employee_salary_history. Esto es necesario porque
-- SENIAT exige RIF de 9 dígitos en el XML de Retenciones ISLR y muchos
-- empleados se guardaron con cédula corta (8 dígitos) — para regenerar XML
-- de quincenas pasadas la cédula debe quedar actualizada en todo el histórico.
--
-- Las tres tablas históricas guardan `employee_id` / `employee_cedula` como
-- texto sin foreign key, por eso se renombran con UPDATE en la misma tx.
--
-- Anterior: 085_employees_porcentaje_islr.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tenant_employees_rename_cedula(
    p_user_id     uuid,
    p_company_id  text,
    p_old_cedula  text,
    p_new_cedula  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_schema text;
    v_exists boolean;
    v_taken  boolean;
BEGIN
    IF p_old_cedula IS NULL OR p_new_cedula IS NULL OR length(btrim(p_old_cedula)) = 0 OR length(btrim(p_new_cedula)) = 0 THEN
        RAISE EXCEPTION 'Las cédulas vieja y nueva son obligatorias';
    END IF;

    IF p_old_cedula = p_new_cedula THEN
        RETURN;
    END IF;

    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM %I.employees WHERE company_id = $1 AND id = $2)',
        v_schema
    ) INTO v_exists USING p_company_id, p_old_cedula;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'No existe un empleado con cédula % en la empresa', p_old_cedula;
    END IF;

    EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM %I.employees WHERE company_id = $1 AND id = $2)',
        v_schema
    ) INTO v_taken USING p_company_id, p_new_cedula;

    IF v_taken THEN
        RAISE EXCEPTION 'Ya existe un empleado con la cédula % en la empresa', p_new_cedula;
    END IF;

    EXECUTE format(
        'UPDATE %I.employees SET id = $2, cedula = $2, updated_at = now()
         WHERE company_id = $1 AND id = $3',
        v_schema
    ) USING p_company_id, p_new_cedula, p_old_cedula;

    EXECUTE format(
        'UPDATE %I.payroll_receipts SET employee_id = $2, employee_cedula = $2
         WHERE company_id = $1 AND employee_id = $3',
        v_schema
    ) USING p_company_id, p_new_cedula, p_old_cedula;

    EXECUTE format(
        'UPDATE %I.cesta_ticket_receipts SET employee_id = $2, employee_cedula = $2
         WHERE company_id = $1 AND employee_id = $3',
        v_schema
    ) USING p_company_id, p_new_cedula, p_old_cedula;

    EXECUTE format(
        'UPDATE %I.employee_salary_history SET employee_cedula = $2
         WHERE company_id = $1 AND employee_cedula = $3',
        v_schema
    ) USING p_company_id, p_new_cedula, p_old_cedula;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tenant_employees_rename_cedula(uuid, text, text, text) TO authenticated;
