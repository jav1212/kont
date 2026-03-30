-- =============================================================================
-- 050_backfill_salary_history_table.sql
-- Backfills the missing `employee_salary_history` table and triggers
-- in all existing tenant schemas that were created before this module was fully
-- integrated into the provisioning process.
-- =============================================================================

DO $$
DECLARE
    rec       record;
    v_user_id uuid;
BEGIN
    FOR rec IN SELECT id, schema_name FROM public.tenants LOOP
        v_user_id := rec.id;

        -- 1. Create the table if it doesn't exist
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
        $tbl$, rec.schema_name);

        -- 2. Create the index
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_salary_history_emp ON %I.employee_salary_history (company_id, employee_cedula, fecha_desde DESC)',
            rec.schema_name
        );

        -- 3. Enable RLS and add policy
        EXECUTE format('ALTER TABLE %I.employee_salary_history ENABLE ROW LEVEL SECURITY', rec.schema_name);
        EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.employee_salary_history', rec.schema_name);
        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.employee_salary_history FOR ALL USING ((SELECT auth.uid()) = %L::uuid)',
            rec.schema_name, v_user_id
        );

        -- 4. Grant DML permissions
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.employee_salary_history TO authenticated', rec.schema_name);

        -- 5. Add triggers to the `employees` table for this schema
        EXECUTE format('DROP TRIGGER IF EXISTS trg_salary_change  ON %I.employees', rec.schema_name);
        EXECUTE format('DROP TRIGGER IF EXISTS trg_initial_salary ON %I.employees', rec.schema_name);

        EXECUTE format(
            'CREATE TRIGGER trg_salary_change  AFTER UPDATE ON %I.employees FOR EACH ROW EXECUTE FUNCTION public.fn_record_salary_change()',
            rec.schema_name
        );
        EXECUTE format(
            'CREATE TRIGGER trg_initial_salary AFTER INSERT ON %I.employees FOR EACH ROW EXECUTE FUNCTION public.fn_record_initial_salary()',
            rec.schema_name
        );

    END LOOP;
END;
$$;
