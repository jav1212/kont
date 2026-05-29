-- =============================================================================
-- 113_reconcile_tenant_triggers.sql
--
-- PROBLEMA
-- --------
-- El portal administrativo lee los conteos de empresas/empleados desde la tabla
-- cacheada public.tenant_metrics. Esa tabla solo se mantiene al dia mediante un
-- trigger por-esquema `metrics_sync` (sobre companies/employees/payroll_runs)
-- que el provisioning ORIGINAL (mig. 004) creaba en cada tenant y que llama a
-- public.refresh_tenant_metrics.
--
-- Las migraciones que regresaron provision_tenant_schema (cf. 112) dejaron de
-- crear esos triggers, y reconcile_tenant_schema (112) reconcilia TABLAS pero
-- NO triggers. Resultado: 17 de 18 tenants quedaron sin `metrics_sync`, asi que
-- su fila en tenant_metrics esta congelada en el valor que tenia al crearse el
-- tenant (normalmente 0). El portal admin muestra 0 empresas / 0 empleados aun
-- cuando el tenant si tiene empresas (verificado: panaderia 21e3ab78 tenia 1
-- empresa real y 0 cacheada). Tambien faltaban los triggers de historial salarial
-- (trg_initial_salary / trg_salary_change), por lo que employee_salary_history no
-- se poblaba en esos tenants.
--
-- SOLUCION
-- --------
-- 1. Nueva funcion idempotente public.reconcile_tenant_triggers(uuid) que
--    (re)crea la funcion sync_metrics() del tenant y los triggers metrics_sync +
--    de historial salarial. Segura de llamar multiples veces.
-- 2. provision_tenant_schema ahora tambien reconcilia triggers y refresca metricas
--    -> los tenants nuevos nacen con triggers correctos y metrica exacta.
-- 3. Se reconcilian triggers y se refresca tenant_metrics para TODOS los tenants
--    existentes (sana los rotos, no-op para los sanos).
--
-- Anterior: 112_reconcile_tenant_schema_full.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- reconcile_tenant_triggers: (re)crea los triggers por-esquema de un tenant
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_tenant_triggers(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    -- Si el esquema no existe todavia, no hay nada que reconciliar.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.schemata WHERE schema_name = v_schema
    ) THEN
        RETURN;
    END IF;

    -- ===== Funcion de sincronizacion de metricas del tenant =================
    EXECUTE format(
        'CREATE OR REPLACE FUNCTION %I.sync_metrics() '
        'RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS '
        '$body$ BEGIN PERFORM public.refresh_tenant_metrics(%L::uuid); RETURN NULL; END; $body$',
        v_schema, p_user_id
    );

    -- ===== Triggers de metricas (idempotentes) ==============================
    EXECUTE format('DROP TRIGGER IF EXISTS metrics_sync ON %I.companies',    v_schema);
    EXECUTE format('DROP TRIGGER IF EXISTS metrics_sync ON %I.employees',    v_schema);
    EXECUTE format('DROP TRIGGER IF EXISTS metrics_sync ON %I.payroll_runs', v_schema);

    EXECUTE format('CREATE TRIGGER metrics_sync AFTER INSERT OR UPDATE OR DELETE ON %I.companies    FOR EACH STATEMENT EXECUTE FUNCTION %I.sync_metrics()', v_schema, v_schema);
    EXECUTE format('CREATE TRIGGER metrics_sync AFTER INSERT OR UPDATE OR DELETE ON %I.employees    FOR EACH STATEMENT EXECUTE FUNCTION %I.sync_metrics()', v_schema, v_schema);
    EXECUTE format('CREATE TRIGGER metrics_sync AFTER INSERT OR UPDATE OR DELETE ON %I.payroll_runs FOR EACH STATEMENT EXECUTE FUNCTION %I.sync_metrics()', v_schema, v_schema);

    -- ===== Triggers de historial de salario (idempotentes) ==================
    -- fn_record_initial_salary / fn_record_salary_change viven en public y usan
    -- TG_TABLE_SCHEMA, asi que sirven para cualquier tenant. (Definidas en 004.)
    EXECUTE format('DROP TRIGGER IF EXISTS trg_salary_change  ON %I.employees', v_schema);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_initial_salary ON %I.employees', v_schema);
    EXECUTE format('CREATE TRIGGER trg_salary_change  AFTER UPDATE ON %I.employees FOR EACH ROW EXECUTE FUNCTION public.fn_record_salary_change()',  v_schema);
    EXECUTE format('CREATE TRIGGER trg_initial_salary AFTER INSERT ON %I.employees FOR EACH ROW EXECUTE FUNCTION public.fn_record_initial_salary()', v_schema);
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.reconcile_tenant_triggers(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reconcile_tenant_triggers(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- provision_tenant_schema: ahora tambien reconcilia triggers + refresca metricas
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

    -- Crea/completa el esquema COMPLETO del tenant (tablas, indices, RLS, grants)
    PERFORM public.reconcile_tenant_schema(p_user_id);

    -- (Re)crea los triggers por-esquema (metricas + historial salarial)
    PERFORM public.reconcile_tenant_triggers(p_user_id);

    -- Registro del tenant (idempotente)
    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;

    -- Metrica inicial exacta
    PERFORM public.refresh_tenant_metrics(p_user_id);
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.provision_tenant_schema(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.provision_tenant_schema(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- Sanar TODOS los tenants existentes: restaurar triggers + refrescar metricas.
-- (no-op para los que ya estaban sanos.)
-- -----------------------------------------------------------------------------
DO $heal$
DECLARE
    t record;
BEGIN
    FOR t IN SELECT id FROM public.tenants LOOP
        PERFORM public.reconcile_tenant_triggers(t.id);
        PERFORM public.refresh_tenant_metrics(t.id);
    END LOOP;
END;
$heal$;
