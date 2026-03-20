-- =============================================================================
-- 013_inventory_tenant_tables.sql
-- Adds inventory tables to provision_tenant_schema (for new tenants) and
-- runs the DDL for all existing tenant schemas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Update provision_tenant_schema to include inventory tables
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_tenant_schema(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema    text;
    v_plan_id   uuid;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    SELECT id INTO v_plan_id FROM public.plans WHERE name = 'Emprendedor' LIMIT 1;

    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);

    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon', v_schema);

    -- companies
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.companies (
            id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            owner_id    text        NOT NULL,
            name        text        NOT NULL,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema);

    -- employees
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.employees (
            id              text        PRIMARY KEY,
            company_id      text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            cedula          text        NOT NULL,
            nombre          text        NOT NULL,
            cargo           text        NOT NULL DEFAULT '',
            salario_mensual numeric(14,2) NOT NULL DEFAULT 0,
            estado          text        NOT NULL DEFAULT 'activo',
            created_at      timestamptz NOT NULL DEFAULT now(),
            updated_at      timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS employees_company_idx ON %I.employees(company_id)', v_schema);

    -- payroll_runs
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.payroll_runs (
            id            text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id    text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            period_start  date        NOT NULL,
            period_end    date        NOT NULL,
            exchange_rate numeric(14,4) NOT NULL,
            status        text        NOT NULL DEFAULT 'confirmed',
            confirmed_at  timestamptz NOT NULL DEFAULT now(),
            created_at    timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_runs_company_idx ON %I.payroll_runs(company_id)', v_schema);

    -- payroll_receipts
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.payroll_receipts (
            id                text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            run_id            text        NOT NULL REFERENCES %I.payroll_runs(id) ON DELETE CASCADE,
            company_id        text        NOT NULL REFERENCES %I.companies(id),
            employee_id       text        NOT NULL,
            employee_cedula   text        NOT NULL,
            employee_nombre   text        NOT NULL,
            employee_cargo    text        NOT NULL DEFAULT '',
            monthly_salary    numeric(14,2) NOT NULL DEFAULT 0,
            total_earnings    numeric(14,2) NOT NULL DEFAULT 0,
            total_deductions  numeric(14,2) NOT NULL DEFAULT 0,
            total_bonuses     numeric(14,2) NOT NULL DEFAULT 0,
            net_pay           numeric(14,2) NOT NULL DEFAULT 0,
            calculation_data  jsonb       NOT NULL DEFAULT '{}',
            created_at        timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_run_idx     ON %I.payroll_receipts(run_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_company_idx ON %I.payroll_receipts(company_id)', v_schema);

    -- -------------------------------------------------------------------------
    -- INVENTORY TABLES
    -- inventario_transformaciones must come before inventario_movimientos (FK)
    -- -------------------------------------------------------------------------

    -- inventario_productos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_productos (
            id                   text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id           text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            codigo               text NOT NULL DEFAULT '',
            nombre               text NOT NULL,
            descripcion          text NOT NULL DEFAULT '',
            tipo                 text NOT NULL DEFAULT 'mercancia'
                                     CHECK (tipo IN ('mercancia','materia_prima','producto_terminado')),
            unidad_medida        text NOT NULL DEFAULT 'unidad',
            metodo_valuacion     text NOT NULL DEFAULT 'promedio_ponderado'
                                     CHECK (metodo_valuacion IN ('promedio_ponderado','peps')),
            existencia_actual    numeric(14,4) NOT NULL DEFAULT 0,
            existencia_minima    numeric(14,4) NOT NULL DEFAULT 0,
            costo_promedio       numeric(14,4) NOT NULL DEFAULT 0,
            activo               boolean NOT NULL DEFAULT true,
            created_at           timestamptz NOT NULL DEFAULT now(),
            updated_at           timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_productos_empresa_idx ON %I.inventario_productos(empresa_id)', v_schema);

    -- inventario_transformaciones (before movimientos due to FK)
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_transformaciones (
            id                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id            text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            descripcion           text NOT NULL DEFAULT '',
            fecha                 date NOT NULL DEFAULT CURRENT_DATE,
            periodo               text NOT NULL,
            producto_terminado_id text REFERENCES %I.inventario_productos(id) ON DELETE SET NULL,
            cantidad_producida     numeric(14,4) NOT NULL DEFAULT 0,
            notas                 text NOT NULL DEFAULT '',
            created_at            timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_transformaciones_empresa_idx ON %I.inventario_transformaciones(empresa_id)', v_schema);

    -- inventario_movimientos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_movimientos (
            id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id        text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            producto_id       text NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE CASCADE,
            tipo              text NOT NULL
                                  CHECK (tipo IN (
                                    'entrada_compra','salida_venta',
                                    'entrada_produccion','salida_produccion',
                                    'ajuste_positivo','ajuste_negativo',
                                    'devolucion_compra','devolucion_venta'
                                  )),
            fecha             date NOT NULL DEFAULT CURRENT_DATE,
            periodo           text NOT NULL,
            cantidad          numeric(14,4) NOT NULL CHECK (cantidad > 0),
            costo_unitario    numeric(14,4) NOT NULL DEFAULT 0,
            costo_total       numeric(14,4) NOT NULL DEFAULT 0,
            saldo_cantidad    numeric(14,4) NOT NULL DEFAULT 0,
            referencia        text NOT NULL DEFAULT '',
            notas             text NOT NULL DEFAULT '',
            transformacion_id text REFERENCES %I.inventario_transformaciones(id) ON DELETE SET NULL,
            created_at        timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_empresa_idx    ON %I.inventario_movimientos(empresa_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_producto_idx   ON %I.inventario_movimientos(producto_id)', v_schema);

    -- inventario_cierres
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_cierres (
            id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            periodo    text NOT NULL,
            cerrado_at timestamptz NOT NULL DEFAULT now(),
            notas      text NOT NULL DEFAULT '',
            UNIQUE(empresa_id, periodo)
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_cierres_empresa_idx ON %I.inventario_cierres(empresa_id)', v_schema);

    -- RLS
    EXECUTE format('ALTER TABLE %I.companies         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employees         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_runs      ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_receipts  ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_productos      ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_transformaciones ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_movimientos     ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_cierres         ENABLE ROW LEVEL SECURITY', v_schema);

    -- Policies (idempotent via DO $$ BEGIN … EXCEPTION WHEN duplicate_object)
    EXECUTE format(
        'CREATE POLICY tenant_owner ON %I.companies FOR ALL USING (auth.uid() = %L::uuid)',
        v_schema, p_user_id
    );
    EXECUTE format(
        'CREATE POLICY tenant_owner ON %I.employees FOR ALL USING (auth.uid() = %L::uuid)',
        v_schema, p_user_id
    );
    EXECUTE format(
        'CREATE POLICY tenant_owner ON %I.payroll_runs FOR ALL USING (auth.uid() = %L::uuid)',
        v_schema, p_user_id
    );
    EXECUTE format(
        'CREATE POLICY tenant_owner ON %I.payroll_receipts FOR ALL USING (auth.uid() = %L::uuid)',
        v_schema, p_user_id
    );
    EXECUTE format(
        'CREATE POLICY tenant_owner ON %I.inventario_productos FOR ALL USING (auth.uid() = %L::uuid)',
        v_schema, p_user_id
    );
    EXECUTE format(
        'CREATE POLICY tenant_owner ON %I.inventario_transformaciones FOR ALL USING (auth.uid() = %L::uuid)',
        v_schema, p_user_id
    );
    EXECUTE format(
        'CREATE POLICY tenant_owner ON %I.inventario_movimientos FOR ALL USING (auth.uid() = %L::uuid)',
        v_schema, p_user_id
    );
    EXECUTE format(
        'CREATE POLICY tenant_owner ON %I.inventario_cierres FOR ALL USING (auth.uid() = %L::uuid)',
        v_schema, p_user_id
    );

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', v_schema);

    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Add inventory tables to all EXISTING tenant schemas
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;

        -- inventario_productos
        EXECUTE format($tbl$
            CREATE TABLE IF NOT EXISTS %I.inventario_productos (
                id                   text PRIMARY KEY DEFAULT gen_random_uuid()::text,
                empresa_id           text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
                codigo               text NOT NULL DEFAULT '',
                nombre               text NOT NULL,
                descripcion          text NOT NULL DEFAULT '',
                tipo                 text NOT NULL DEFAULT 'mercancia'
                                         CHECK (tipo IN ('mercancia','materia_prima','producto_terminado')),
                unidad_medida        text NOT NULL DEFAULT 'unidad',
                metodo_valuacion     text NOT NULL DEFAULT 'promedio_ponderado'
                                         CHECK (metodo_valuacion IN ('promedio_ponderado','peps')),
                existencia_actual    numeric(14,4) NOT NULL DEFAULT 0,
                existencia_minima    numeric(14,4) NOT NULL DEFAULT 0,
                costo_promedio       numeric(14,4) NOT NULL DEFAULT 0,
                activo               boolean NOT NULL DEFAULT true,
                created_at           timestamptz NOT NULL DEFAULT now(),
                updated_at           timestamptz NOT NULL DEFAULT now()
            )
        $tbl$, v_schema, v_schema);

        EXECUTE format('CREATE INDEX IF NOT EXISTS inv_productos_empresa_idx ON %I.inventario_productos(empresa_id)', v_schema);

        EXECUTE format($tbl$
            CREATE TABLE IF NOT EXISTS %I.inventario_transformaciones (
                id                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,
                empresa_id            text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
                descripcion           text NOT NULL DEFAULT '',
                fecha                 date NOT NULL DEFAULT CURRENT_DATE,
                periodo               text NOT NULL,
                producto_terminado_id text REFERENCES %I.inventario_productos(id) ON DELETE SET NULL,
                cantidad_producida     numeric(14,4) NOT NULL DEFAULT 0,
                notas                 text NOT NULL DEFAULT '',
                created_at            timestamptz NOT NULL DEFAULT now()
            )
        $tbl$, v_schema, v_schema, v_schema);

        EXECUTE format('CREATE INDEX IF NOT EXISTS inv_transformaciones_empresa_idx ON %I.inventario_transformaciones(empresa_id)', v_schema);

        EXECUTE format($tbl$
            CREATE TABLE IF NOT EXISTS %I.inventario_movimientos (
                id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
                empresa_id        text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
                producto_id       text NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE CASCADE,
                tipo              text NOT NULL
                                      CHECK (tipo IN (
                                        'entrada_compra','salida_venta',
                                        'entrada_produccion','salida_produccion',
                                        'ajuste_positivo','ajuste_negativo',
                                        'devolucion_compra','devolucion_venta'
                                      )),
                fecha             date NOT NULL DEFAULT CURRENT_DATE,
                periodo           text NOT NULL,
                cantidad          numeric(14,4) NOT NULL CHECK (cantidad > 0),
                costo_unitario    numeric(14,4) NOT NULL DEFAULT 0,
                costo_total       numeric(14,4) NOT NULL DEFAULT 0,
                saldo_cantidad    numeric(14,4) NOT NULL DEFAULT 0,
                referencia        text NOT NULL DEFAULT '',
                notas             text NOT NULL DEFAULT '',
                transformacion_id text REFERENCES %I.inventario_transformaciones(id) ON DELETE SET NULL,
                created_at        timestamptz NOT NULL DEFAULT now()
            )
        $tbl$, v_schema, v_schema, v_schema, v_schema);

        EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_empresa_idx    ON %I.inventario_movimientos(empresa_id)', v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_producto_idx   ON %I.inventario_movimientos(producto_id)', v_schema);

        EXECUTE format($tbl$
            CREATE TABLE IF NOT EXISTS %I.inventario_cierres (
                id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
                empresa_id text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
                periodo    text NOT NULL,
                cerrado_at timestamptz NOT NULL DEFAULT now(),
                notas      text NOT NULL DEFAULT '',
                UNIQUE(empresa_id, periodo)
            )
        $tbl$, v_schema, v_schema);

        EXECUTE format('CREATE INDEX IF NOT EXISTS inv_cierres_empresa_idx ON %I.inventario_cierres(empresa_id)', v_schema);

        -- Enable RLS on new tables
        EXECUTE format('ALTER TABLE %I.inventario_productos       ENABLE ROW LEVEL SECURITY', v_schema);
        EXECUTE format('ALTER TABLE %I.inventario_transformaciones ENABLE ROW LEVEL SECURITY', v_schema);
        EXECUTE format('ALTER TABLE %I.inventario_movimientos      ENABLE ROW LEVEL SECURITY', v_schema);
        EXECUTE format('ALTER TABLE %I.inventario_cierres          ENABLE ROW LEVEL SECURITY', v_schema);

        -- Grant permissions
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC Functions for Inventory
-- ---------------------------------------------------------------------------

-- ── Productos ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tenant_inventario_productos_get(
    p_user_id   uuid,
    p_empresa_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.nombre), ''[]''::jsonb)
         FROM %I.inventario_productos p
         WHERE p.empresa_id = %L',
        v_schema, p_empresa_id
    ) INTO v_result;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_inventario_productos_upsert(
    p_user_id uuid,
    p_row     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_id     text;
    v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    v_id := COALESCE(NULLIF(p_row->>'id', ''), gen_random_uuid()::text);

    EXECUTE format($sql$
        INSERT INTO %I.inventario_productos
            (id, empresa_id, codigo, nombre, descripcion, tipo, unidad_medida,
             metodo_valuacion, existencia_actual, existencia_minima, costo_promedio, activo, updated_at)
        VALUES (
            %L,
            %L,
            COALESCE(%L, ''),
            %L,
            COALESCE(%L, ''),
            COALESCE(%L, 'mercancia'),
            COALESCE(%L, 'unidad'),
            COALESCE(%L, 'promedio_ponderado'),
            COALESCE((%L)::numeric, 0),
            COALESCE((%L)::numeric, 0),
            COALESCE((%L)::numeric, 0),
            COALESCE((%L)::boolean, true),
            now()
        )
        ON CONFLICT (id) DO UPDATE SET
            codigo            = EXCLUDED.codigo,
            nombre            = EXCLUDED.nombre,
            descripcion       = EXCLUDED.descripcion,
            tipo              = EXCLUDED.tipo,
            unidad_medida     = EXCLUDED.unidad_medida,
            metodo_valuacion  = EXCLUDED.metodo_valuacion,
            existencia_minima = EXCLUDED.existencia_minima,
            activo            = EXCLUDED.activo,
            updated_at        = now()
        RETURNING row_to_json(inventario_productos)
    $sql$,
        v_schema,
        v_id,
        p_row->>'empresa_id',
        p_row->>'codigo',
        p_row->>'nombre',
        p_row->>'descripcion',
        p_row->>'tipo',
        p_row->>'unidad_medida',
        p_row->>'metodo_valuacion',
        p_row->>'existencia_actual',
        p_row->>'existencia_minima',
        p_row->>'costo_promedio',
        p_row->>'activo'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_inventario_productos_delete(
    p_user_id uuid,
    p_id      text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format('DELETE FROM %I.inventario_productos WHERE id = %L', v_schema, p_id);
END;
$$;

-- ── Movimientos ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_get(
    p_user_id    uuid,
    p_empresa_id text,
    p_periodo    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    IF p_periodo IS NULL THEN
        EXECUTE format(
            'SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.fecha DESC, m.created_at DESC), ''[]''::jsonb)
             FROM %I.inventario_movimientos m
             WHERE m.empresa_id = %L',
            v_schema, p_empresa_id
        ) INTO v_result;
    ELSE
        EXECUTE format(
            'SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.fecha DESC, m.created_at DESC), ''[]''::jsonb)
             FROM %I.inventario_movimientos m
             WHERE m.empresa_id = %L AND m.periodo = %L',
            v_schema, p_empresa_id, p_periodo
        ) INTO v_result;
    END IF;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_save(
    p_user_id uuid,
    p_row     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema          text;
    v_id              text;
    v_producto_id     text;
    v_tipo            text;
    v_fecha           date;
    v_periodo         text;
    v_cantidad        numeric(14,4);
    v_costo_unitario  numeric(14,4);
    v_costo_total     numeric(14,4);
    v_saldo_cantidad  numeric(14,4);
    v_existencia_act  numeric(14,4);
    v_costo_prom      numeric(14,4);
    v_result          jsonb;
    v_is_entrada      boolean;
BEGIN
    v_schema         := public.tenant_get_schema(p_user_id);
    v_id             := COALESCE(NULLIF(p_row->>'id', ''), gen_random_uuid()::text);
    v_producto_id    := p_row->>'producto_id';
    v_tipo           := p_row->>'tipo';
    v_fecha          := COALESCE(NULLIF(p_row->>'fecha', ''), CURRENT_DATE::text)::date;
    v_periodo        := to_char(v_fecha, 'YYYY-MM');
    v_cantidad       := (p_row->>'cantidad')::numeric;
    v_costo_unitario := COALESCE(NULLIF(p_row->>'costo_unitario', ''), '0')::numeric;
    v_costo_total    := v_cantidad * v_costo_unitario;

    -- Determine if this is an entrada or salida
    v_is_entrada := v_tipo IN ('entrada_compra','entrada_produccion','devolucion_compra','ajuste_positivo');

    -- Fetch current existencia and costo_promedio
    EXECUTE format(
        'SELECT existencia_actual, costo_promedio FROM %I.inventario_productos WHERE id = %L',
        v_schema, v_producto_id
    ) INTO v_existencia_act, v_costo_prom;

    IF v_is_entrada THEN
        -- Weighted average cost
        IF (v_existencia_act + v_cantidad) > 0 THEN
            v_costo_prom := (v_existencia_act * v_costo_prom + v_cantidad * v_costo_unitario)
                            / (v_existencia_act + v_cantidad);
        END IF;
        v_saldo_cantidad := v_existencia_act + v_cantidad;
    ELSE
        v_saldo_cantidad := v_existencia_act - v_cantidad;
    END IF;

    -- Update producto existencia and costo_promedio
    EXECUTE format(
        'UPDATE %I.inventario_productos
         SET existencia_actual = %L,
             costo_promedio    = %L,
             updated_at        = now()
         WHERE id = %L',
        v_schema,
        v_saldo_cantidad,
        v_costo_prom,
        v_producto_id
    );

    -- Insert the movement
    EXECUTE format($sql$
        INSERT INTO %I.inventario_movimientos
            (id, empresa_id, producto_id, tipo, fecha, periodo, cantidad,
             costo_unitario, costo_total, saldo_cantidad, referencia, notas, transformacion_id)
        VALUES (
            %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L,
            NULLIF(%L, '')
        )
        RETURNING row_to_json(inventario_movimientos)
    $sql$,
        v_schema,
        v_id,
        p_row->>'empresa_id',
        v_producto_id,
        v_tipo,
        v_fecha,
        v_periodo,
        v_cantidad,
        v_costo_unitario,
        v_costo_total,
        v_saldo_cantidad,
        COALESCE(p_row->>'referencia', ''),
        COALESCE(p_row->>'notas', ''),
        p_row->>'transformacion_id'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ── Kardex ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tenant_inventario_kardex(
    p_user_id    uuid,
    p_empresa_id text,
    p_producto_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.fecha ASC, m.created_at ASC), ''[]''::jsonb)
         FROM %I.inventario_movimientos m
         WHERE m.empresa_id = %L AND m.producto_id = %L',
        v_schema, p_empresa_id, p_producto_id
    ) INTO v_result;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ── Transformaciones ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tenant_inventario_transformaciones_get(
    p_user_id    uuid,
    p_empresa_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.fecha DESC, t.created_at DESC), ''[]''::jsonb)
         FROM %I.inventario_transformaciones t
         WHERE t.empresa_id = %L',
        v_schema, p_empresa_id
    ) INTO v_result;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_inventario_transformacion_save(
    p_user_id       uuid,
    p_transformacion jsonb,
    p_consumos       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema        text;
    v_trans_id      text;
    v_fecha         date;
    v_periodo       text;
    v_consumo       jsonb;
    v_result        jsonb;
    v_cantidad      numeric(14,4);
    v_costo_unit    numeric(14,4);
    v_existencia    numeric(14,4);
    v_costo_prom    numeric(14,4);
    v_nuevo_saldo   numeric(14,4);
    v_costo_prom_new numeric(14,4);
BEGIN
    v_schema   := public.tenant_get_schema(p_user_id);
    v_trans_id := COALESCE(NULLIF(p_transformacion->>'id', ''), gen_random_uuid()::text);
    v_fecha    := COALESCE(NULLIF(p_transformacion->>'fecha', ''), CURRENT_DATE::text)::date;
    v_periodo  := to_char(v_fecha, 'YYYY-MM');

    -- Insert transformacion
    EXECUTE format($sql$
        INSERT INTO %I.inventario_transformaciones
            (id, empresa_id, descripcion, fecha, periodo, producto_terminado_id, cantidad_producida, notas)
        VALUES (%L, %L, %L, %L, %L, NULLIF(%L, ''), %L, %L)
        RETURNING row_to_json(inventario_transformaciones)
    $sql$,
        v_schema,
        v_trans_id,
        p_transformacion->>'empresa_id',
        COALESCE(p_transformacion->>'descripcion', ''),
        v_fecha,
        v_periodo,
        p_transformacion->>'producto_terminado_id',
        COALESCE((p_transformacion->>'cantidad_producida')::numeric, 0),
        COALESCE(p_transformacion->>'notas', '')
    ) INTO v_result;

    -- Process consumos (salida_produccion for each raw material)
    FOR v_consumo IN SELECT * FROM jsonb_array_elements(p_consumos) LOOP
        v_cantidad   := (v_consumo->>'cantidad')::numeric;
        v_costo_unit := COALESCE(NULLIF(v_consumo->>'costo_unitario', ''), '0')::numeric;

        -- Fetch current state
        EXECUTE format(
            'SELECT existencia_actual, costo_promedio FROM %I.inventario_productos WHERE id = %L',
            v_schema, v_consumo->>'producto_id'
        ) INTO v_existencia, v_costo_prom;

        v_nuevo_saldo := v_existencia - v_cantidad;

        EXECUTE format(
            'UPDATE %I.inventario_productos SET existencia_actual = %L, updated_at = now() WHERE id = %L',
            v_schema, v_nuevo_saldo, v_consumo->>'producto_id'
        );

        EXECUTE format($sql$
            INSERT INTO %I.inventario_movimientos
                (id, empresa_id, producto_id, tipo, fecha, periodo, cantidad,
                 costo_unitario, costo_total, saldo_cantidad, referencia, notas, transformacion_id)
            VALUES (
                gen_random_uuid()::text,
                %L, %L, 'salida_produccion', %L, %L, %L, %L,
                %L * %L, %L, %L, '', %L
            )
        $sql$,
            v_schema,
            p_transformacion->>'empresa_id',
            v_consumo->>'producto_id',
            v_fecha, v_periodo,
            v_cantidad,
            v_costo_unit,
            v_cantidad, v_costo_unit,
            v_nuevo_saldo,
            'Consumo en transformación',
            v_trans_id
        );
    END LOOP;

    -- entrada_produccion for finished product
    IF (p_transformacion->>'producto_terminado_id') IS NOT NULL AND
       (p_transformacion->>'producto_terminado_id') <> '' AND
       (p_transformacion->>'cantidad_producida')::numeric > 0 THEN

        EXECUTE format(
            'SELECT existencia_actual, costo_promedio FROM %I.inventario_productos WHERE id = %L',
            v_schema, p_transformacion->>'producto_terminado_id'
        ) INTO v_existencia, v_costo_prom;

        -- Calculate cost of production from consumos
        SELECT COALESCE(SUM((c->>'cantidad')::numeric * COALESCE(NULLIF(c->>'costo_unitario',''),'0')::numeric), 0)
        INTO v_costo_unit
        FROM jsonb_array_elements(p_consumos) AS c;

        -- Cost per unit of finished product
        IF (p_transformacion->>'cantidad_producida')::numeric > 0 THEN
            v_costo_unit := v_costo_unit / (p_transformacion->>'cantidad_producida')::numeric;
        END IF;

        v_nuevo_saldo := v_existencia + (p_transformacion->>'cantidad_producida')::numeric;

        -- Update weighted average
        IF v_nuevo_saldo > 0 THEN
            v_costo_prom_new := (v_existencia * v_costo_prom +
                                 (p_transformacion->>'cantidad_producida')::numeric * v_costo_unit)
                                / v_nuevo_saldo;
        ELSE
            v_costo_prom_new := v_costo_prom;
        END IF;

        EXECUTE format(
            'UPDATE %I.inventario_productos SET existencia_actual = %L, costo_promedio = %L, updated_at = now() WHERE id = %L',
            v_schema, v_nuevo_saldo, v_costo_prom_new, p_transformacion->>'producto_terminado_id'
        );

        EXECUTE format($sql$
            INSERT INTO %I.inventario_movimientos
                (id, empresa_id, producto_id, tipo, fecha, periodo, cantidad,
                 costo_unitario, costo_total, saldo_cantidad, referencia, notas, transformacion_id)
            VALUES (
                gen_random_uuid()::text,
                %L, %L, 'entrada_produccion', %L, %L, %L, %L,
                %L * %L, %L, %L, '', %L
            )
        $sql$,
            v_schema,
            p_transformacion->>'empresa_id',
            p_transformacion->>'producto_terminado_id',
            v_fecha, v_periodo,
            (p_transformacion->>'cantidad_producida')::numeric,
            v_costo_unit,
            (p_transformacion->>'cantidad_producida')::numeric, v_costo_unit,
            v_nuevo_saldo,
            'Producción de lote',
            v_trans_id
        );
    END IF;

    RETURN v_result;
END;
$$;

-- ── Cierres ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tenant_inventario_cierres_get(
    p_user_id    uuid,
    p_empresa_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.periodo DESC), ''[]''::jsonb)
         FROM %I.inventario_cierres c
         WHERE c.empresa_id = %L',
        v_schema, p_empresa_id
    ) INTO v_result;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_inventario_cierre_save(
    p_user_id    uuid,
    p_empresa_id text,
    p_periodo    text,
    p_notas      text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format($sql$
        INSERT INTO %I.inventario_cierres (id, empresa_id, periodo, notas)
        VALUES (gen_random_uuid()::text, %L, %L, %L)
        ON CONFLICT (empresa_id, periodo) DO NOTHING
        RETURNING row_to_json(inventario_cierres)
    $sql$,
        v_schema,
        p_empresa_id,
        p_periodo,
        COALESCE(p_notas, '')
    ) INTO v_result;
    RETURN v_result;
END;
$$;
