-- =============================================================================
-- 118_payroll_ari_declarations.sql
--
-- Agrega la declaración AR-I (retención de ISLR sobre sueldos y salarios) al
-- módulo de nómina. Cada empleado puede tener una declaración por año gravable
-- que estima su remuneración anual y determina el PORCENTAJE de retención de
-- ISLR (casilla J de la Forma AR-I). Ese porcentaje se escribe también en
-- employees.porcentaje_islr (mig. 085), que ya alimenta el XML/PDF mensual de
-- Retenciones ISLR del SENIAT.
--
-- CONVENCIÓN (igual que 113_reconcile_tenant_triggers): en vez de re-declarar la
-- función gigante reconcile_tenant_schema (mig. 112), se agrega una función
-- satélite idempotente public.reconcile_tenant_ari(uuid) que crea/completa SÓLO
-- la tabla ari_declarations (+ índice, RLS, política y grants) de un tenant.
--   1. reconcile_tenant_ari(uuid): tabla + índice + RLS + política + grants.
--   2. provision_tenant_schema delega también en reconcile_tenant_ari -> los
--      tenants nuevos nacen con la tabla.
--   3. RPCs tenant_ari_get_by_company / tenant_ari_upsert / tenant_ari_delete.
--      Sólo service_role puede ejecutarlas (defensa en profundidad, cf. 098).
--   4. Se ejecuta reconcile_tenant_ari para TODOS los tenants existentes.
--
-- Anterior: 117_inventory_purchase_confirm_net_cost.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- reconcile_tenant_ari: crea/completa la tabla ari_declarations de un tenant
-- -----------------------------------------------------------------------------
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

    -- Si el esquema no existe todavía, no hay nada que reconciliar.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.schemata WHERE schema_name = v_schema
    ) THEN
        RETURN;
    END IF;

    -- DDL sin prefijo de esquema; se resuelve dentro de v_schema por el
    -- search_path local. La cláusula SET search_path = public de la función
    -- restaura el valor original al salir (sin fugas a la transacción).
    PERFORM set_config('search_path', quote_ident(v_schema) || ', public', true);

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS ari_declarations (
        id                         text          NOT NULL DEFAULT (gen_random_uuid())::text,
        company_id                 text          NOT NULL,
        employee_id                text          NOT NULL,
        employee_cedula            text          NOT NULL,
        anio_gravable              integer       NOT NULL,
        valor_ut                   numeric(14,2) NOT NULL DEFAULT 0,
        remuneracion_anual         numeric(14,2) NOT NULL DEFAULT 0,
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
        CONSTRAINT ari_declarations_emp_anio_key UNIQUE (employee_id, anio_gravable),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $i$CREATE INDEX IF NOT EXISTS ari_declarations_company_idx ON ari_declarations (company_id)$i$;

    -- RLS + política tenant_owner + grants (autocontenido: reconcile_tenant_schema
    -- ya corrió su loop genérico antes de que exista esta tabla en tenants nuevos).
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

-- -----------------------------------------------------------------------------
-- provision_tenant_schema: ahora también reconcilia la tabla AR-I
-- (copia fiel de la definición vigente en 113 + PERFORM reconcile_tenant_ari)
-- -----------------------------------------------------------------------------
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

    -- Crea/completa el esquema COMPLETO del tenant (tablas, índices, RLS, grants)
    PERFORM public.reconcile_tenant_schema(p_user_id);

    -- Tabla AR-I (satélite, cf. cabecera)
    PERFORM public.reconcile_tenant_ari(p_user_id);

    -- (Re)crea los triggers por-esquema (métricas + historial salarial)
    PERFORM public.reconcile_tenant_triggers(p_user_id);

    -- Registro del tenant (idempotente)
    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;

    -- Métrica inicial exacta
    PERFORM public.refresh_tenant_metrics(p_user_id);
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.provision_tenant_schema(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.provision_tenant_schema(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- RPC: leer las declaraciones AR-I de una empresa
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tenant_ari_get_by_company(uuid, text);

CREATE FUNCTION public.tenant_ari_get_by_company(p_user_id uuid, p_company_id text)
RETURNS TABLE (
    id                         text,
    company_id                 text,
    employee_id                text,
    employee_cedula            text,
    anio_gravable              integer,
    valor_ut                   numeric,
    remuneracion_anual         numeric,
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
                anio_gravable, valor_ut, remuneracion_anual, usar_desgravamen_unico,
                desg_educacion, desg_seguros, desg_medicos, desg_intereses,
                cargas_familiares, impuestos_retenidos_de_mas, porcentaje_retencion,
                updated_at
         FROM %I.ari_declarations
         WHERE company_id = $1
         ORDER BY anio_gravable DESC, employee_cedula ASC',
        v_schema
    ) USING p_company_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: upsert de una declaración AR-I (por employee_id + anio_gravable).
-- Además escribe el porcentaje resultante en employees.porcentaje_islr, de modo
-- que el reporte mensual de Retenciones ISLR lo tome sin un segundo round-trip.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tenant_ari_upsert(uuid, jsonb);

CREATE FUNCTION public.tenant_ari_upsert(p_user_id uuid, p_declaration jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'INSERT INTO %I.ari_declarations
           (id, company_id, employee_id, employee_cedula, anio_gravable, valor_ut,
            remuneracion_anual, usar_desgravamen_unico, desg_educacion, desg_seguros,
            desg_medicos, desg_intereses, cargas_familiares, impuestos_retenidos_de_mas,
            porcentaje_retencion)
         SELECT
           COALESCE(NULLIF(d->>''id'', ''''), gen_random_uuid()::text),
           (d->>''company_id'')::text,
           (d->>''employee_id'')::text,
           (d->>''employee_cedula'')::text,
           (d->>''anio_gravable'')::integer,
           COALESCE(NULLIF(d->>''valor_ut'', '''')::numeric, 0),
           COALESCE(NULLIF(d->>''remuneracion_anual'', '''')::numeric, 0),
           COALESCE((d->>''usar_desgravamen_unico'')::boolean, true),
           COALESCE(NULLIF(d->>''desg_educacion'', '''')::numeric, 0),
           COALESCE(NULLIF(d->>''desg_seguros'', '''')::numeric, 0),
           COALESCE(NULLIF(d->>''desg_medicos'', '''')::numeric, 0),
           COALESCE(NULLIF(d->>''desg_intereses'', '''')::numeric, 0),
           COALESCE(NULLIF(d->>''cargas_familiares'', '''')::integer, 0),
           COALESCE(NULLIF(d->>''impuestos_retenidos_de_mas'', '''')::numeric, 0),
           COALESCE(NULLIF(d->>''porcentaje_retencion'', '''')::numeric, 0)
         FROM jsonb_array_elements(jsonb_build_array($1)) AS d
         ON CONFLICT (employee_id, anio_gravable) DO UPDATE SET
           company_id                 = EXCLUDED.company_id,
           employee_cedula            = EXCLUDED.employee_cedula,
           valor_ut                   = EXCLUDED.valor_ut,
           remuneracion_anual         = EXCLUDED.remuneracion_anual,
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

    -- Propaga el % al empleado (fuente para el XML/PDF mensual de Retenciones ISLR).
    EXECUTE format(
        'UPDATE %I.employees
            SET porcentaje_islr = COALESCE(NULLIF($1->>''porcentaje_retencion'', '''')::numeric, 0),
                updated_at      = now()
          WHERE id = ($1->>''employee_id'')::text',
        v_schema
    ) USING p_declaration;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: eliminar una declaración AR-I por id
-- -----------------------------------------------------------------------------
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

-- Sólo service_role puede ejecutar las RPCs (defensa en profundidad, cf. 098)
REVOKE EXECUTE ON FUNCTION public.tenant_ari_get_by_company(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tenant_ari_upsert(uuid, jsonb)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tenant_ari_delete(uuid, text)         FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.tenant_ari_get_by_company(uuid, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.tenant_ari_upsert(uuid, jsonb)        TO service_role;
GRANT  EXECUTE ON FUNCTION public.tenant_ari_delete(uuid, text)         TO service_role;

-- -----------------------------------------------------------------------------
-- Crear la tabla en TODOS los tenants existentes (no-op para los ya sanos).
-- -----------------------------------------------------------------------------
DO $heal$
DECLARE t record;
BEGIN
    FOR t IN SELECT id FROM public.tenants LOOP
        PERFORM public.reconcile_tenant_ari(t.id);
    END LOOP;
END;
$heal$;
