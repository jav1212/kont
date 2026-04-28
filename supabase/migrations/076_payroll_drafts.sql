-- 076_payroll_drafts.sql
-- Adds draft support to payroll runs:
--   * tenant_payroll_run_save now accepts p_status ('draft' | 'confirmed', default 'confirmed').
--   * If a run already exists for (company, period_start, period_end):
--       - status='confirmed'  → raise (immutable, never overwritten).
--       - status='draft'      → delete its receipts, UPDATE the run with the new exchange_rate
--                                and status, then insert the new receipts (UPSERT semantics).
--   * Otherwise insert a new run with the provided status.
-- The column payroll_runs.status stays text; no DDL change is required because the column
-- already accepts any text value.
-- confirmed_at is reused as "last saved at" for drafts and is overwritten when promoting.

-- Drop the legacy 3-arg overload to avoid an ambiguous coexistence with the
-- new 4-arg function (Postgres treats different arities as separate overloads).
DROP FUNCTION IF EXISTS public.tenant_payroll_run_save(uuid, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.tenant_payroll_run_save(
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
        RAISE EXCEPTION 'invalid payroll status: %', p_status;
    END IF;

    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'SELECT id, status FROM %I.payroll_runs
         WHERE company_id = %L AND period_start = %L::date AND period_end = %L::date
         LIMIT 1',
        v_schema,
        p_run->>'companyId',
        p_run->>'periodStart',
        p_run->>'periodEnd'
    ) INTO v_existing_id, v_existing_status;

    IF v_existing_id IS NOT NULL THEN
        IF v_existing_status = 'confirmed' THEN
            RAISE EXCEPTION 'A payroll run already exists for this period.';
        END IF;

        v_run_id := v_existing_id;
        EXECUTE format('DELETE FROM %I.payroll_receipts WHERE run_id = %L', v_schema, v_run_id);
        EXECUTE format(
            'UPDATE %I.payroll_runs
             SET status = %L, exchange_rate = %L::numeric, confirmed_at = now()
             WHERE id = %L',
            v_schema, p_status, p_run->>'exchangeRate', v_run_id
        );
    ELSE
        v_run_id := gen_random_uuid()::text;
        EXECUTE format(
            'INSERT INTO %I.payroll_runs
             (id, company_id, period_start, period_end, exchange_rate, status, confirmed_at)
             VALUES (%L, %L, %L::date, %L::date, %L::numeric, %L, now())',
            v_schema, v_run_id,
            p_run->>'companyId', p_run->>'periodStart', p_run->>'periodEnd',
            p_run->>'exchangeRate', p_status
        );
    END IF;

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
