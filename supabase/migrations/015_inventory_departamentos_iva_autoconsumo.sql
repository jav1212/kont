-- =============================================================================
-- 015_inventory_departamentos_iva_autoconsumo.sql
-- Adds:
--   1. inventario_departamentos table (new entity)
--   2. departamento_id + iva_tipo columns to inventario_productos
--   3. 'autoconsumo' to the tipo check on inventario_movimientos
--   4. RPCs: departamentos CRUD + reporte_periodo
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Update provision_tenant_schema to include new tables + columns
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
            salario_mensual   numeric(14,2) NOT NULL DEFAULT 0,
            data              jsonb       NOT NULL DEFAULT '{}',
            created_at        timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_run_idx     ON %I.payroll_receipts(run_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_company_idx ON %I.payroll_receipts(company_id)', v_schema);

    -- inventario_departamentos (NEW)
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_departamentos (
            id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id  text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            nombre      text NOT NULL,
            descripcion text NOT NULL DEFAULT '',
            activo      boolean NOT NULL DEFAULT true,
            created_at  timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_departamentos_empresa_idx ON %I.inventario_departamentos(empresa_id)', v_schema);

    -- inventario_productos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_productos (
            id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id        text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            codigo            text NOT NULL DEFAULT '',
            nombre            text NOT NULL,
            descripcion       text NOT NULL DEFAULT '',
            tipo              text NOT NULL DEFAULT 'mercancia'
                                  CHECK (tipo IN ('mercancia','materia_prima','producto_terminado')),
            unidad_medida     text NOT NULL DEFAULT 'unidad',
            metodo_valuacion  text NOT NULL DEFAULT 'promedio_ponderado'
                                  CHECK (metodo_valuacion IN ('promedio_ponderado','peps')),
            existencia_actual numeric(14,4) NOT NULL DEFAULT 0,
            existencia_minima numeric(14,4) NOT NULL DEFAULT 0,
            costo_promedio    numeric(14,4) NOT NULL DEFAULT 0,
            activo            boolean NOT NULL DEFAULT true,
            departamento_id   text REFERENCES %I.inventario_departamentos(id) ON DELETE SET NULL,
            iva_tipo          text NOT NULL DEFAULT 'general'
                                  CHECK (iva_tipo IN ('exento','general')),
            created_at        timestamptz NOT NULL DEFAULT now(),
            updated_at        timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_productos_empresa_idx ON %I.inventario_productos(empresa_id)', v_schema);

    -- inventario_movimientos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_movimientos (
            id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id       text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            producto_id      text NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE RESTRICT,
            tipo             text NOT NULL
                                 CHECK (tipo IN (
                                     'entrada_compra','salida_venta',
                                     'entrada_produccion','salida_produccion',
                                     'ajuste_positivo','ajuste_negativo',
                                     'devolucion_compra','devolucion_venta',
                                     'autoconsumo'
                                 )),
            fecha            date NOT NULL,
            periodo          text NOT NULL,
            cantidad         numeric(14,4) NOT NULL,
            costo_unitario   numeric(14,4) NOT NULL DEFAULT 0,
            costo_total      numeric(14,2) NOT NULL DEFAULT 0,
            saldo_cantidad   numeric(14,4) NOT NULL DEFAULT 0,
            referencia       text NOT NULL DEFAULT '',
            notas            text NOT NULL DEFAULT '',
            transformacion_id text REFERENCES %I.inventario_transformaciones(id) ON DELETE SET NULL,
            created_at       timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_empresa_idx  ON %I.inventario_movimientos(empresa_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_producto_idx ON %I.inventario_movimientos(producto_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_periodo_idx  ON %I.inventario_movimientos(periodo)', v_schema);

    -- inventario_transformaciones
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_transformaciones (
            id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id      text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            producto_id     text NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE RESTRICT,
            fecha           date NOT NULL,
            periodo         text NOT NULL,
            cantidad_producida numeric(14,4) NOT NULL,
            costo_total     numeric(14,2) NOT NULL DEFAULT 0,
            estado          text NOT NULL DEFAULT 'borrador'
                                CHECK (estado IN ('borrador','confirmada')),
            notas           text NOT NULL DEFAULT '',
            created_at      timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    -- inventario_cierres
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_cierres (
            id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id  text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            periodo     text NOT NULL,
            cerrado_at  timestamptz NOT NULL DEFAULT now(),
            notas       text NOT NULL DEFAULT '',
            created_at  timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    -- inventario_proveedores
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_proveedores (
            id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id  text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            rif         text NOT NULL DEFAULT '',
            nombre      text NOT NULL,
            contacto    text NOT NULL DEFAULT '',
            telefono    text NOT NULL DEFAULT '',
            email       text NOT NULL DEFAULT '',
            direccion   text NOT NULL DEFAULT '',
            notas       text NOT NULL DEFAULT '',
            activo      boolean NOT NULL DEFAULT true,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_proveedores_empresa_idx ON %I.inventario_proveedores(empresa_id)', v_schema);

    -- inventario_facturas_compra
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_facturas_compra (
            id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id      text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            proveedor_id    text NOT NULL REFERENCES %I.inventario_proveedores(id) ON DELETE RESTRICT,
            numero_factura  text NOT NULL DEFAULT '',
            fecha           date NOT NULL DEFAULT CURRENT_DATE,
            periodo         text NOT NULL,
            estado          text NOT NULL DEFAULT 'borrador'
                                CHECK (estado IN ('borrador','confirmada')),
            subtotal        numeric(14,2) NOT NULL DEFAULT 0,
            iva_porcentaje  numeric(5,2) NOT NULL DEFAULT 16,
            iva_monto       numeric(14,2) NOT NULL DEFAULT 0,
            total           numeric(14,2) NOT NULL DEFAULT 0,
            notas           text NOT NULL DEFAULT '',
            confirmada_at   timestamptz,
            created_at      timestamptz NOT NULL DEFAULT now(),
            updated_at      timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_facturas_empresa_idx    ON %I.inventario_facturas_compra(empresa_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_facturas_proveedor_idx  ON %I.inventario_facturas_compra(proveedor_id)', v_schema);

    -- inventario_facturas_compra_items
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_facturas_compra_items (
            id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            factura_id      text NOT NULL REFERENCES %I.inventario_facturas_compra(id) ON DELETE CASCADE,
            producto_id     text NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE RESTRICT,
            cantidad        numeric(14,4) NOT NULL CHECK (cantidad > 0),
            costo_unitario  numeric(14,4) NOT NULL DEFAULT 0,
            costo_total     numeric(14,2) NOT NULL DEFAULT 0,
            created_at      timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_factura_items_factura_idx ON %I.inventario_facturas_compra_items(factura_id)', v_schema);

    -- RLS
    EXECUTE format('ALTER TABLE %I.companies                        ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employees                        ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_runs                     ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_receipts                 ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_departamentos         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_productos             ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_transformaciones      ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_movimientos           ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_cierres               ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_proveedores           ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_facturas_compra       ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_facturas_compra_items ENABLE ROW LEVEL SECURITY', v_schema);

    -- Policies
    EXECUTE format('CREATE POLICY tenant_owner ON %I.companies FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.employees FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_runs FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_receipts FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_departamentos FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_productos FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_transformaciones FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_movimientos FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_cierres FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_proveedores FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_facturas_compra FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_facturas_compra_items FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', v_schema);

    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Backfill existing tenant schemas
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;

        -- inventario_departamentos (new table)
        EXECUTE format($tbl$
            CREATE TABLE IF NOT EXISTS %I.inventario_departamentos (
                id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
                empresa_id  text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
                nombre      text NOT NULL,
                descripcion text NOT NULL DEFAULT '',
                activo      boolean NOT NULL DEFAULT true,
                created_at  timestamptz NOT NULL DEFAULT now()
            )
        $tbl$, v_schema, v_schema);

        EXECUTE format('CREATE INDEX IF NOT EXISTS inv_departamentos_empresa_idx ON %I.inventario_departamentos(empresa_id)', v_schema);

        -- Add departamento_id to inventario_productos (if not exists)
        EXECUTE format($sql$
            ALTER TABLE %I.inventario_productos
                ADD COLUMN IF NOT EXISTS departamento_id text
                    REFERENCES %I.inventario_departamentos(id) ON DELETE SET NULL
        $sql$, v_schema, v_schema);

        -- Add iva_tipo to inventario_productos (if not exists)
        EXECUTE format($sql$
            ALTER TABLE %I.inventario_productos
                ADD COLUMN IF NOT EXISTS iva_tipo text NOT NULL DEFAULT 'general'
                    CHECK (iva_tipo IN ('exento','general'))
        $sql$, v_schema);

        -- Add 'autoconsumo' to inventario_movimientos tipo check
        -- Drop old constraint, add new one (IF EXISTS handles idempotency)
        EXECUTE format($sql$
            DO $inner$
            BEGIN
                ALTER TABLE %I.inventario_movimientos
                    DROP CONSTRAINT IF EXISTS inventario_movimientos_tipo_check;
                ALTER TABLE %I.inventario_movimientos
                    ADD CONSTRAINT inventario_movimientos_tipo_check
                    CHECK (tipo IN (
                        'entrada_compra','salida_venta',
                        'entrada_produccion','salida_produccion',
                        'ajuste_positivo','ajuste_negativo',
                        'devolucion_compra','devolucion_venta',
                        'autoconsumo'
                    ));
            END;
            $inner$
        $sql$, v_schema, v_schema);

        -- Enable RLS for new table
        EXECUTE format('ALTER TABLE %I.inventario_departamentos ENABLE ROW LEVEL SECURITY', v_schema);

        -- Grant permissions
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPCs: Departamentos
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tenant_inventario_departamentos_get(
    p_user_id    uuid,
    p_empresa_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.nombre), ''[]''::jsonb)
         FROM %I.inventario_departamentos d
         WHERE d.empresa_id = %L',
        v_schema, p_empresa_id
    ) INTO v_result;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_inventario_departamentos_upsert(
    p_user_id uuid,
    p_data    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_id     text;
    v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    v_id := COALESCE(NULLIF(p_data->>'id', ''), gen_random_uuid()::text);

    EXECUTE format($sql$
        INSERT INTO %I.inventario_departamentos
            (id, empresa_id, nombre, descripcion, activo)
        VALUES (
            %L, %L, %L,
            COALESCE(%L, ''),
            COALESCE((%L)::boolean, true)
        )
        ON CONFLICT (id) DO UPDATE SET
            nombre      = EXCLUDED.nombre,
            descripcion = EXCLUDED.descripcion,
            activo      = EXCLUDED.activo
        RETURNING row_to_json(inventario_departamentos)
    $sql$,
        v_schema,
        v_id,
        p_data->>'empresa_id',
        p_data->>'nombre',
        p_data->>'descripcion',
        p_data->>'activo'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_inventario_departamentos_delete(
    p_user_id uuid,
    p_id      text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'DELETE FROM %I.inventario_departamentos WHERE id = %L',
        v_schema, p_id
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: Reporte de Período
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tenant_inventario_reporte_periodo(
    p_user_id    uuid,
    p_empresa_id text,
    p_periodo    text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format($sql$
        WITH
        -- Last known saldo before the period starts (inventory initial)
        inv_inicial AS (
            SELECT
                m.producto_id,
                m.saldo_cantidad AS saldo
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.periodo < %L
              AND m.created_at = (
                  SELECT MAX(m2.created_at)
                  FROM %I.inventario_movimientos m2
                  WHERE m2.producto_id = m.producto_id
                    AND m2.periodo < %L
              )
        ),
        -- Movimientos of the period aggregated
        mov_periodo AS (
            SELECT
                m.producto_id,
                SUM(CASE WHEN m.tipo IN ('entrada_compra','entrada_produccion','devolucion_compra','ajuste_positivo')
                         THEN m.cantidad ELSE 0 END) AS entradas,
                SUM(CASE WHEN m.tipo IN ('salida_venta','salida_produccion','devolucion_venta','ajuste_negativo','autoconsumo')
                         THEN m.cantidad ELSE 0 END) AS salidas,
                SUM(CASE WHEN m.tipo IN ('entrada_compra','entrada_produccion','devolucion_compra','ajuste_positivo')
                         THEN m.costo_total ELSE 0 END) AS costo_entradas_bs,
                SUM(CASE WHEN m.tipo = 'salida_venta'
                         THEN m.costo_total ELSE 0 END) AS total_salidas_s_iva_bs,
                SUM(CASE WHEN m.tipo IN ('salida_venta','salida_produccion','devolucion_venta','ajuste_negativo','autoconsumo')
                         THEN m.costo_total ELSE 0 END) AS costo_salidas_bs,
                SUM(CASE WHEN m.tipo = 'autoconsumo'
                         THEN m.costo_total ELSE 0 END) AS costo_autoconsumo,
                MAX(CASE WHEN m.tipo = 'entrada_compra' THEN m.costo_unitario ELSE NULL END) AS costo_factura
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.periodo = %L
            GROUP BY m.producto_id
        ),
        -- Last proveedor per product (from confirmed purchase invoices in period)
        proveedor_por_producto AS (
            SELECT DISTINCT ON (fi.producto_id)
                fi.producto_id,
                pv.nombre AS proveedor_nombre
            FROM %I.inventario_facturas_compra_items fi
            JOIN %I.inventario_facturas_compra fc ON fc.id = fi.factura_id
            JOIN %I.inventario_proveedores pv ON pv.id = fc.proveedor_id
            WHERE fc.empresa_id = %L
              AND fc.periodo = %L
              AND fc.estado = 'confirmada'
            ORDER BY fi.producto_id, fc.fecha DESC
        )
        SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
        FROM (
            SELECT
                p.codigo,
                p.nombre,
                COALESCE(d.nombre, '') AS departamento_nombre,
                COALESCE(pp.proveedor_nombre, '') AS proveedor_nombre,
                p.iva_tipo,
                COALESCE(ii.saldo, 0)           AS inventario_inicial,
                COALESCE(mp.costo_factura, 0)   AS costo_factura,
                p.existencia_actual * p.costo_promedio AS costo_total,
                p.costo_promedio,
                COALESCE(mp.entradas, 0)         AS entradas,
                COALESCE(mp.salidas, 0)          AS salidas,
                p.existencia_actual,
                COALESCE(mp.costo_entradas_bs, 0)    AS costo_entradas_bs,
                COALESCE(mp.total_salidas_s_iva_bs, 0) AS total_salidas_s_iva_bs,
                COALESCE(mp.costo_salidas_bs, 0)     AS costo_salidas_bs,
                COALESCE(mp.costo_autoconsumo, 0)    AS costo_autoconsumo,
                p.existencia_actual * p.costo_promedio AS costo_actual_bs
            FROM %I.inventario_productos p
            LEFT JOIN %I.inventario_departamentos d    ON d.id = p.departamento_id
            LEFT JOIN inv_inicial ii                   ON ii.producto_id = p.id
            LEFT JOIN mov_periodo mp                   ON mp.producto_id = p.id
            LEFT JOIN proveedor_por_producto pp        ON pp.producto_id = p.id
            WHERE p.empresa_id = %L
              AND p.activo = true
            ORDER BY COALESCE(d.nombre, 'ZZZZ'), p.nombre
        ) t
    $sql$,
        -- inv_inicial CTEs
        v_schema, p_empresa_id, p_periodo,
        v_schema, p_periodo,
        -- mov_periodo
        v_schema, p_empresa_id, p_periodo,
        -- proveedor_por_producto
        v_schema, v_schema, v_schema, p_empresa_id, p_periodo,
        -- main query
        v_schema, v_schema,
        p_empresa_id
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
