-- =============================================================================
-- 119_payroll_ari_quarterly.sql
--
-- Convierte AR-I de anual a trimestral puro. Cada empleado puede tener una
-- declaración por año + trimestre, con remuneración trimestral estimada y
-- porcentaje de retención asociado.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reconcile_tenant_ari(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.schemata WHERE schema_name = v_schema
    ) THEN
        RETURN;
    END IF;

    PERFORM set_config('search_path', quote_ident(v_schema) || ', public', true);

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS ari_declarations (
        id                         text          NOT NULL DEFAULT (gen_random_uuid())::text,
        company_id                 text          NOT NULL,
        employee_id                text          NOT NULL,
        employee_cedula            text          NOT NULL,
        anio_gravable              integer       NOT NULL,
        trimestre_gravable         integer       NOT NULL DEFAULT 1,
        valor_ut                   numeric(14,2) NOT NULL DEFAULT 0,
        remuneracion_trimestral    numeric(14,2) NOT NULL DEFAULT 0,
        usar_desgravamen_unico     boolean       NOT NULL DEFAULT true,
        desg_educacion             numeric(14,2) NOT NULL DEFAULT 0,
        desg_seguros               numeric(14,2) NOT NULL DEFAULT 0,
        desg_medicos               numeric(14,2) NOT NULL DEFAULT 0,
        desg_intereses             numeric(14,2) NOT NULL DEFAULT 0,
        cargas_familiares          integer       NOT NULL DEFAULT 0,
        impuestos_retenidos_de_mas numeric(14,2) NOT NULL DEFAULT 0,
        porcentaje_retencion       numeric(5,2)  NOT NULL DEFAULT 0,
        created_at                 timestamptz   NOT NULL DEFAULT now(),
        updated_at                 timestamptz   NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        CONSTRAINT ari_declarations_emp_anio_trim_key UNIQUE (employee_id, anio_gravable, trimestre_gravable),
        CONSTRAINT ari_declarations_trim_chk CHECK (trimestre_gravable BETWEEN 1 AND 4),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )$t$;

    EXECUTE 'ALTER TABLE ari_declarations ADD COLUMN IF NOT EXISTS trimestre_gravable integer';
    EXECUTE 'ALTER TABLE ari_declarations ADD COLUMN IF NOT EXISTS remuneracion_trimestral numeric(14,2)';
    EXECUTE 'UPDATE ari_declarations SET trimestre_gravable = 1 WHERE trimestre_gravable IS NULL';
    EXECUTE 'UPDATE ari_declarations SET remuneracion_trimestral = remuneracion_anual WHERE remuneracion_trimestral IS NULL';
    EXECUTE 'ALTER TABLE ari_declarations ALTER COLUMN trimestre_gravable SET DEFAULT 1';
    EXECUTE 'ALTER TABLE ari_declarations ALTER COLUMN trimestre_gravable SET NOT NULL';
    EXECUTE 'ALTER TABLE ari_declarations ALTER COLUMN remuneracion_trimestral SET DEFAULT 0';
    EXECUTE 'ALTER TABLE ari_declarations ALTER COLUMN remuneracion_trimestral SET NOT NULL';
    EXECUTE 'ALTER TABLE ari_declarations DROP CONSTRAINT IF EXISTS ari_declarations_emp_anio_key';
    EXECUTE 'ALTER TABLE ari_declarations DROP CONSTRAINT IF EXISTS ari_declarations_trim_chk';
    EXECUTE 'ALTER TABLE ari_declarations ADD CONSTRAINT ari_declarations_trim_chk CHECK (trimestre_gravable BETWEEN 1 AND 4)';
    EXECUTE 'ALTER TABLE ari_declarations DROP CONSTRAINT IF EXISTS ari_declarations_emp_anio_trim_key';
    EXECUTE 'ALTER TABLE ari_declarations ADD CONSTRAINT ari_declarations_emp_anio_trim_key UNIQUE (employee_id, anio_gravable, trimestre_gravable)';
    EXECUTE 'ALTER TABLE ari_declarations DROP COLUMN IF EXISTS remuneracion_anual';

    EXECUTE $i$CREATE INDEX IF NOT EXISTS ari_declarations_company_idx ON ari_declarations (company_id)$i$;

    EXECUTE 'ALTER TABLE ari_declarations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_owner ON ari_declarations';
    EXECUTE format(
        'CREATE POLICY tenant_owner ON ari_declarations FOR ALL USING ((SELECT auth.uid()) = %L::uuid)',
        p_user_id
    );
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ari_declarations TO authenticated';
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.reconcile_tenant_ari(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reconcile_tenant_ari(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.provision_tenant_schema(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    v_schema  text;
    v_plan_id uuid;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    SELECT id INTO v_plan_id FROM public.plans WHERE name = 'Emprendedor' LIMIT 1;

    PERFORM public.reconcile_tenant_schema(p_user_id);
    PERFORM public.reconcile_tenant_ari(p_user_id);
    PERFORM public.reconcile_tenant_triggers(p_user_id);

    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;

    PERFORM public.refresh_tenant_metrics(p_user_id);
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.provision_tenant_schema(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.provision_tenant_schema(uuid) TO service_role;

DROP FUNCTION IF EXISTS public.tenant_ari_get_by_company(uuid, text);

CREATE FUNCTION public.tenant_ari_get_by_company(p_user_id uuid, p_company_id text)
RETURNS TABLE (
    id                         text,
    company_id                 text,
    employee_id                text,
    employee_cedula            text,
    anio_gravable              integer,
    trimestre_gravable         integer,
    valor_ut                   numeric,
    remuneracion_trimestral    numeric,
    usar_desgravamen_unico     boolean,
    desg_educacion             numeric,
    desg_seguros               numeric,
    desg_medicos               numeric,
    desg_intereses             numeric,
    cargas_familiares          integer,
    impuestos_retenidos_de_mas numeric,
    porcentaje_retencion       numeric,
    updated_at                 timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    RETURN QUERY EXECUTE format(
        'SELECT id::text, company_id::text, employee_id::text, employee_cedula,
                anio_gravable, trimestre_gravable, valor_ut, remuneracion_trimestral, usar_desgravamen_unico,
                desg_educacion, desg_seguros, desg_medicos, desg_intereses,
                cargas_familiares, impuestos_retenidos_de_mas, porcentaje_retencion,
                updated_at
         FROM %I.ari_declarations
         WHERE company_id = $1
         ORDER BY anio_gravable DESC, trimestre_gravable DESC, employee_cedula ASC',
        v_schema
    ) USING p_company_id;
END;
$$;

DROP FUNCTION IF EXISTS public.tenant_ari_upsert(uuid, jsonb);

CREATE FUNCTION public.tenant_ari_upsert(p_user_id uuid, p_declaration jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'INSERT INTO %I.ari_declarations
           (id, company_id, employee_id, employee_cedula, anio_gravable, trimestre_gravable, valor_ut,
            remuneracion_trimestral, usar_desgravamen_unico, desg_educacion, desg_seguros,
            desg_medicos, desg_intereses, cargas_familiares, impuestos_retenidos_de_mas,
            porcentaje_retencion)
         SELECT
           COALESCE(NULLIF(d->>''id'', ''''), gen_random_uuid()::text),
           (d->>''company_id'')::text,
           (d->>''employee_id'')::text,
           (d->>''employee_cedula'')::text,
           (d->>''anio_gravable'')::integer,
           COALESCE(NULLIF(d->>''trimestre_gravable'', '''')::integer, 1),
           COALESCE(NULLIF(d->>''valor_ut'', '''')::numeric, 0),
           COALESCE(NULLIF(d->>''remuneracion_trimestral'', '''')::numeric, 0),
           COALESCE((d->>''usar_desgravamen_unico'')::boolean, true),
           COALESCE(NULLIF(d->>''desg_educacion'', '''')::numeric, 0),
           COALESCE(NULLIF(d->>''desg_seguros'', '''')::numeric, 0),
           COALESCE(NULLIF(d->>''desg_medicos'', '''')::numeric, 0),
           COALESCE(NULLIF(d->>''desg_intereses'', '''')::numeric, 0),
           COALESCE(NULLIF(d->>''cargas_familiares'', '''')::integer, 0),
           COALESCE(NULLIF(d->>''impuestos_retenidos_de_mas'', '''')::numeric, 0),
           COALESCE(NULLIF(d->>''porcentaje_retencion'', '''')::numeric, 0)
         FROM jsonb_array_elements(jsonb_build_array($1)) AS d
         ON CONFLICT (employee_id, anio_gravable, trimestre_gravable) DO UPDATE SET
           company_id                 = EXCLUDED.company_id,
           employee_cedula            = EXCLUDED.employee_cedula,
           valor_ut                   = EXCLUDED.valor_ut,
           remuneracion_trimestral    = EXCLUDED.remuneracion_trimestral,
           usar_desgravamen_unico     = EXCLUDED.usar_desgravamen_unico,
           desg_educacion             = EXCLUDED.desg_educacion,
           desg_seguros               = EXCLUDED.desg_seguros,
           desg_medicos               = EXCLUDED.desg_medicos,
           desg_intereses             = EXCLUDED.desg_intereses,
           cargas_familiares          = EXCLUDED.cargas_familiares,
           impuestos_retenidos_de_mas = EXCLUDED.impuestos_retenidos_de_mas,
           porcentaje_retencion       = EXCLUDED.porcentaje_retencion,
           updated_at                 = now()',
        v_schema
    ) USING p_declaration;

    EXECUTE format(
        'UPDATE %I.employees
            SET porcentaje_islr = COALESCE(NULLIF($1->>''porcentaje_retencion'', '''')::numeric, 0),
                updated_at      = now()
          WHERE id = ($1->>''employee_id'')::text',
        v_schema
    ) USING p_declaration;
END;
$$;

DROP FUNCTION IF EXISTS public.tenant_ari_delete(uuid, text);

CREATE FUNCTION public.tenant_ari_delete(p_user_id uuid, p_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format('DELETE FROM %I.ari_declarations WHERE id = $1', v_schema)
    USING p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tenant_ari_get_by_company(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tenant_ari_upsert(uuid, jsonb)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tenant_ari_delete(uuid, text)         FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.tenant_ari_get_by_company(uuid, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.tenant_ari_upsert(uuid, jsonb)        TO service_role;
GRANT  EXECUTE ON FUNCTION public.tenant_ari_delete(uuid, text)         TO service_role;

DO $heal$
DECLARE t record;
BEGIN
    FOR t IN SELECT id FROM public.tenants LOOP
        PERFORM public.reconcile_tenant_ari(t.id);
    END LOOP;
END;
$heal$;
