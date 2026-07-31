-- Payroll payment modes and manually approved work hours.
-- Existing employees remain in daily mode for backwards compatibility.

DO $$
DECLARE r record; v_schema text;
BEGIN
  FOR r IN SELECT schema_name FROM public.tenants LOOP
    v_schema := r.schema_name;
    EXECUTE format('ALTER TABLE %I.employees ADD COLUMN IF NOT EXISTS tarifa_hora numeric(14,2) NOT NULL DEFAULT 0', v_schema);
    EXECUTE format('ALTER TABLE %I.employees ADD COLUMN IF NOT EXISTS modalidad_pago text NOT NULL DEFAULT ''diario''', v_schema);
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I.payroll_work_hours (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      company_id text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
      employee_id text NOT NULL,
      employee_cedula text NOT NULL,
      period_start date NOT NULL,
      period_end date NOT NULL,
      hours numeric(10,2) NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT ''pending'',
      notes text NOT NULL DEFAULT '''',
      approved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(company_id, employee_id, period_start, period_end)
    )', v_schema, v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_work_hours_company_period_idx ON %I.payroll_work_hours(company_id, period_start, period_end)', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_work_hours ENABLE ROW LEVEL SECURITY', v_schema);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.tenant_employees_get_by_company(uuid, text);
CREATE FUNCTION public.tenant_employees_get_by_company(p_user_id uuid, p_company_id text)
RETURNS TABLE (id text, company_id text, cedula text, nombre text, cargo text, salario_mensual numeric, estado text, fecha_ingreso date, moneda text, porcentaje_islr numeric, tarifa_hora numeric, modalidad_pago text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
  v_schema := public.tenant_get_schema(p_user_id);
  EXECUTE format('ALTER TABLE %I.employees ADD COLUMN IF NOT EXISTS tarifa_hora numeric(14,2) NOT NULL DEFAULT 0', v_schema);
  EXECUTE format('ALTER TABLE %I.employees ADD COLUMN IF NOT EXISTS modalidad_pago text NOT NULL DEFAULT ''diario''', v_schema);
  RETURN QUERY EXECUTE format('SELECT id::text, company_id::text, cedula, nombre, cargo, salario_mensual, estado, fecha_ingreso, COALESCE(moneda::text, ''VES''), COALESCE(porcentaje_islr, 0), COALESCE(tarifa_hora, 0), COALESCE(modalidad_pago, ''diario'') FROM %I.employees WHERE company_id = $1 ORDER BY nombre ASC', v_schema) USING p_company_id;
END $$;

DROP FUNCTION IF EXISTS public.tenant_employees_upsert(uuid, jsonb);
CREATE FUNCTION public.tenant_employees_upsert(p_user_id uuid, p_employees jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
  v_schema := public.tenant_get_schema(p_user_id);
  EXECUTE format('ALTER TABLE %I.employees ADD COLUMN IF NOT EXISTS tarifa_hora numeric(14,2) NOT NULL DEFAULT 0', v_schema);
  EXECUTE format('ALTER TABLE %I.employees ADD COLUMN IF NOT EXISTS modalidad_pago text NOT NULL DEFAULT ''diario''', v_schema);
  EXECUTE format('INSERT INTO %I.employees (id, company_id, cedula, nombre, cargo, salario_mensual, estado, fecha_ingreso, moneda, porcentaje_islr, tarifa_hora, modalidad_pago) SELECT (e->>''id'')::text, (e->>''company_id'')::text, (e->>''cedula'')::text, (e->>''nombre'')::text, (e->>''cargo'')::text, (e->>''salario_mensual'')::numeric, (e->>''estado'')::text, NULLIF(e->>''fecha_ingreso'', '''')::date, COALESCE(NULLIF(e->>''moneda'', ''''), ''VES''), COALESCE(NULLIF(e->>''porcentaje_islr'', '''')::numeric, 0), COALESCE(NULLIF(e->>''tarifa_hora'', '''')::numeric, 0), COALESCE(NULLIF(e->>''modalidad_pago'', ''''), ''diario'') FROM jsonb_array_elements($1) e ON CONFLICT (id) DO UPDATE SET nombre=EXCLUDED.nombre, cargo=EXCLUDED.cargo, salario_mensual=EXCLUDED.salario_mensual, estado=EXCLUDED.estado, fecha_ingreso=EXCLUDED.fecha_ingreso, moneda=EXCLUDED.moneda, porcentaje_islr=EXCLUDED.porcentaje_islr, tarifa_hora=EXCLUDED.tarifa_hora, modalidad_pago=EXCLUDED.modalidad_pago, updated_at=now()', v_schema) USING p_employees;
END $$;
