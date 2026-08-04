-- 123_shared_employee_salary_trigger.sql

CREATE OR REPLACE FUNCTION public.shared_record_employee_salary_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT'
       OR NEW.salario_mensual IS DISTINCT FROM OLD.salario_mensual
       OR NEW.moneda IS DISTINCT FROM OLD.moneda THEN
        INSERT INTO public.shared_employee_salary_history
            (tenant_id, id, employee_cedula, company_id, salario_mensual,
             moneda, fecha_desde)
        VALUES
            (NEW.tenant_id, gen_random_uuid(), NEW.cedula, NEW.company_id,
             NEW.salario_mensual, NEW.moneda, CURRENT_DATE);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shared_employee_salary_history_trigger ON public.shared_employees;
CREATE TRIGGER shared_employee_salary_history_trigger
    AFTER INSERT OR UPDATE OF salario_mensual, moneda ON public.shared_employees
    FOR EACH ROW EXECUTE FUNCTION public.shared_record_employee_salary_history();

REVOKE EXECUTE ON FUNCTION public.shared_record_employee_salary_history() FROM PUBLIC, anon, authenticated;
