-- =============================================================================
-- 016_inventory_numero_control.sql
-- Adds numero_control to inventario_facturas_compra (Providencia SENIAT 0071)
-- Updates RPCs: tenant_inventario_factura_save, tenant_inventario_factura_get,
--               tenant_inventario_facturas_get, provision_tenant_schema
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Backfill existing tenant schemas — add the column
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;
        EXECUTE format(
            'ALTER TABLE %I.inventario_facturas_compra ADD COLUMN IF NOT EXISTS numero_control text NOT NULL DEFAULT ''''',
            v_schema
        );
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Update provision_tenant_schema to include numero_control in CREATE TABLE
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
            id              text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id      text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            period_start    date        NOT NULL,
            period_end      date        NOT NULL,
            exchange_rate   numeric(12,4) NOT NULL DEFAULT 1,
            status          text        NOT NULL DEFAULT 'draft',
            created_at      timestamptz NOT NULL DEFAULT now(),
            updated_at      timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_runs_company_idx ON %I.payroll_runs(company_id)', v_schema);

    -- payroll_receipts
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.payroll_receipts (
            id              text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            run_id          text        NOT NULL REFERENCES %I.payroll_runs(id) ON DELETE CASCADE,
            company_id      text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            employee_id     text        NOT NULL REFERENCES %I.employees(id) ON DELETE RESTRICT,
            cedula          text        NOT NULL,
            nombre          text        NOT NULL,
            cargo           text        NOT NULL DEFAULT '',
            salario_mensual numeric(14,2) NOT NULL DEFAULT 0,
            gross           numeric(14,2) NOT NULL DEFAULT 0,
            deductions      numeric(14,2) NOT NULL DEFAULT 0,
            net             numeric(14,2) NOT NULL DEFAULT 0,
            exchange_rate   numeric(12,4) NOT NULL DEFAULT 1,
            net_usd         numeric(14,4) NOT NULL DEFAULT 0,
            rows_json       jsonb        NOT NULL DEFAULT '[]',
            created_at      timestamptz NOT NULL DEFAULT now(),
            updated_at      timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_run_idx      ON %I.payroll_receipts(run_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_employee_idx ON %I.payroll_receipts(employee_id)', v_schema);

    -- inventario_departamentos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_departamentos (
            id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id  text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            nombre      text NOT NULL,
            descripcion text NOT NULL DEFAULT '',
            activo      boolean NOT NULL DEFAULT true,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_departamentos_empresa_idx ON %I.inventario_departamentos(empresa_id)', v_schema);

    -- inventario_productos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_productos (
            id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id          text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            departamento_id     text REFERENCES %I.inventario_departamentos(id) ON DELETE SET NULL,
            codigo              text NOT NULL DEFAULT '',
            nombre              text NOT NULL,
            descripcion         text NOT NULL DEFAULT '',
            unidad_medida       text NOT NULL DEFAULT 'unid',
            tipo                text NOT NULL DEFAULT 'mercancia'
                                    CHECK (tipo IN ('mercancia','materia_prima','producto_terminado')),
            metodo_valuacion    text NOT NULL DEFAULT 'promedio_ponderado'
                                    CHECK (metodo_valuacion IN ('promedio_ponderado','peps')),
            existencia_actual   numeric(14,4) NOT NULL DEFAULT 0,
            costo_promedio      numeric(14,4) NOT NULL DEFAULT 0,
            stock_minimo        numeric(14,4) NOT NULL DEFAULT 0,
            activo              boolean NOT NULL DEFAULT true,
            iva_tipo            text NOT NULL DEFAULT 'general'
                                    CHECK (iva_tipo IN ('exento','general')),
            created_at          timestamptz NOT NULL DEFAULT now(),
            updated_at          timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_productos_empresa_idx ON %I.inventario_productos(empresa_id)', v_schema);

    -- inventario_movimientos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_movimientos (
            id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id      text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            producto_id     text NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE RESTRICT,
            tipo            text NOT NULL CHECK (tipo IN (
                                'entrada_compra','salida_venta',
                                'entrada_produccion','salida_produccion',
                                'ajuste_positivo','ajuste_negativo',
                                'devolucion_compra','devolucion_venta',
                                'autoconsumo'
                            )),
            fecha           date NOT NULL DEFAULT CURRENT_DATE,
            periodo         text NOT NULL,
            cantidad        numeric(14,4) NOT NULL,
            costo_unitario  numeric(14,4) NOT NULL DEFAULT 0,
            costo_total     numeric(14,2) NOT NULL DEFAULT 0,
            saldo_cantidad  numeric(14,4) NOT NULL DEFAULT 0,
            saldo_valor     numeric(14,2) NOT NULL DEFAULT 0,
            referencia      text NOT NULL DEFAULT '',
            notas           text NOT NULL DEFAULT '',
            created_at      timestamptz NOT NULL DEFAULT now()
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
            fecha           date NOT NULL DEFAULT CURRENT_DATE,
            periodo         text NOT NULL,
            producto_salida_id text NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE RESTRICT,
            cantidad_producida numeric(14,4) NOT NULL CHECK (cantidad_producida > 0),
            costo_total     numeric(14,2) NOT NULL DEFAULT 0,
            notas           text NOT NULL DEFAULT '',
            created_at      timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_trans_empresa_idx ON %I.inventario_transformaciones(empresa_id)', v_schema);

    -- inventario_transformaciones_insumos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_transformaciones_insumos (
            id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            transformacion_id   text NOT NULL REFERENCES %I.inventario_transformaciones(id) ON DELETE CASCADE,
            producto_id         text NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE RESTRICT,
            cantidad            numeric(14,4) NOT NULL CHECK (cantidad > 0),
            costo_unitario      numeric(14,4) NOT NULL DEFAULT 0,
            costo_total         numeric(14,2) NOT NULL DEFAULT 0,
            created_at          timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    -- inventario_cierres
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_cierres (
            id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id  text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            periodo     text NOT NULL,
            cerrado_at  timestamptz NOT NULL DEFAULT now(),
            UNIQUE (empresa_id, periodo)
        )
    $tbl$, v_schema, v_schema);

    -- inventario_proveedores
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_proveedores (
            id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id  text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            nombre      text NOT NULL,
            rif         text NOT NULL DEFAULT '',
            telefono    text NOT NULL DEFAULT '',
            email       text NOT NULL DEFAULT '',
            direccion   text NOT NULL DEFAULT '',
            activo      boolean NOT NULL DEFAULT true,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_proveedores_empresa_idx ON %I.inventario_proveedores(empresa_id)', v_schema);

    -- inventario_facturas_compra (includes numero_control)
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_facturas_compra (
            id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id      text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            proveedor_id    text NOT NULL REFERENCES %I.inventario_proveedores(id) ON DELETE RESTRICT,
            numero_factura  text NOT NULL DEFAULT '',
            numero_control  text NOT NULL DEFAULT '',
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
    EXECUTE format('ALTER TABLE %I.companies                          ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employees                          ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_runs                       ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_receipts                   ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_departamentos           ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_productos               ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_transformaciones        ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_movimientos             ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_cierres                 ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_proveedores             ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_facturas_compra         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_facturas_compra_items   ENABLE ROW LEVEL SECURITY', v_schema);

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
-- 3. Update tenant_inventario_factura_get to return numero_control
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_get(
    p_user_id   uuid,
    p_factura_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema   text;
    v_factura  jsonb;
    v_items    jsonb;
    v_result   jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        $q$SELECT jsonb_build_object(
            'id',              f.id,
            'empresa_id',      f.empresa_id,
            'proveedor_id',    f.proveedor_id,
            'proveedor_nombre', pv.nombre,
            'numero_factura',  f.numero_factura,
            'numero_control',  f.numero_control,
            'fecha',           f.fecha,
            'periodo',         f.periodo,
            'estado',          f.estado,
            'subtotal',        f.subtotal,
            'iva_porcentaje',  f.iva_porcentaje,
            'iva_monto',       f.iva_monto,
            'total',           f.total,
            'notas',           f.notas,
            'confirmada_at',   f.confirmada_at,
            'created_at',      f.created_at,
            'updated_at',      f.updated_at
        )
        FROM %I.inventario_facturas_compra f
        JOIN %I.inventario_proveedores pv ON pv.id = f.proveedor_id
        WHERE f.id = %L$q$,
        v_schema, v_schema, p_factura_id
    ) INTO v_factura;

    EXECUTE format(
        $q$SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',             i.id,
                'factura_id',     i.factura_id,
                'producto_id',    i.producto_id,
                'producto_nombre', p.nombre,
                'cantidad',       i.cantidad,
                'costo_unitario', i.costo_unitario,
                'costo_total',    i.costo_total
            ) ORDER BY i.created_at ASC
        ), '[]'::jsonb)
        FROM %I.inventario_facturas_compra_items i
        JOIN %I.inventario_productos p ON p.id = i.producto_id
        WHERE i.factura_id = %L$q$,
        v_schema, v_schema, p_factura_id
    ) INTO v_items;

    v_result := v_factura || jsonb_build_object('items', v_items);
    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Update tenant_inventario_facturas_get (list) to return numero_control
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_facturas_get(
    p_user_id   uuid,
    p_empresa_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        $q$SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',              f.id,
                'empresa_id',      f.empresa_id,
                'proveedor_id',    f.proveedor_id,
                'proveedor_nombre', pv.nombre,
                'numero_factura',  f.numero_factura,
                'numero_control',  f.numero_control,
                'fecha',           f.fecha,
                'periodo',         f.periodo,
                'estado',          f.estado,
                'subtotal',        f.subtotal,
                'iva_porcentaje',  f.iva_porcentaje,
                'iva_monto',       f.iva_monto,
                'total',           f.total,
                'notas',           f.notas,
                'confirmada_at',   f.confirmada_at,
                'created_at',      f.created_at,
                'updated_at',      f.updated_at
            ) ORDER BY f.fecha DESC, f.created_at DESC
        ), '[]'::jsonb)
        FROM %I.inventario_facturas_compra f
        JOIN %I.inventario_proveedores pv ON pv.id = f.proveedor_id
        WHERE f.empresa_id = %L$q$,
        v_schema, v_schema, p_empresa_id
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Update tenant_inventario_factura_save to accept numero_control
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_save(
    p_user_id uuid,
    p_factura jsonb,
    p_items   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema       text;
    v_id           text;
    v_fecha        date;
    v_periodo      text;
    v_subtotal     numeric(14,2);
    v_iva_pct      numeric(5,2);
    v_iva_monto    numeric(14,2);
    v_total        numeric(14,2);
    v_item         jsonb;
    v_result       jsonb;
    v_estado       text;
BEGIN
    v_schema  := public.tenant_get_schema(p_user_id);
    v_id      := COALESCE(NULLIF(p_factura->>'id', ''), gen_random_uuid()::text);
    v_fecha   := COALESCE(NULLIF(p_factura->>'fecha', ''), CURRENT_DATE::text)::date;
    v_periodo := to_char(v_fecha, 'YYYY-MM');
    v_iva_pct := COALESCE(NULLIF(p_factura->>'iva_porcentaje', ''), '16')::numeric;

    -- If updating, check estado first
    IF NULLIF(p_factura->>'id', '') IS NOT NULL THEN
        EXECUTE format(
            'SELECT estado FROM %I.inventario_facturas_compra WHERE id = %L',
            v_schema, v_id
        ) INTO v_estado;

        IF v_estado = 'confirmada' THEN
            RAISE EXCEPTION 'No se puede modificar una factura confirmada';
        END IF;
    END IF;

    -- Compute totals from items
    SELECT COALESCE(SUM((item->>'costo_total')::numeric), 0)
    INTO v_subtotal
    FROM jsonb_array_elements(p_items) AS item;

    v_iva_monto := ROUND(v_subtotal * v_iva_pct / 100, 2);
    v_total     := v_subtotal + v_iva_monto;

    -- Upsert factura header (includes numero_control)
    EXECUTE format($sql$
        INSERT INTO %I.inventario_facturas_compra
            (id, empresa_id, proveedor_id, numero_factura, numero_control, fecha, periodo, estado,
             subtotal, iva_porcentaje, iva_monto, total, notas, updated_at)
        VALUES (
            %L, %L, %L, %L, %L, %L, %L, 'borrador',
            %L, %L, %L, %L,
            COALESCE(%L, ''), now()
        )
        ON CONFLICT (id) DO UPDATE SET
            proveedor_id    = EXCLUDED.proveedor_id,
            numero_factura  = EXCLUDED.numero_factura,
            numero_control  = EXCLUDED.numero_control,
            fecha           = EXCLUDED.fecha,
            periodo         = EXCLUDED.periodo,
            subtotal        = EXCLUDED.subtotal,
            iva_porcentaje  = EXCLUDED.iva_porcentaje,
            iva_monto       = EXCLUDED.iva_monto,
            total           = EXCLUDED.total,
            notas           = EXCLUDED.notas,
            updated_at      = now()
        RETURNING row_to_json(inventario_facturas_compra)
    $sql$,
        v_schema,
        v_id,
        p_factura->>'empresa_id',
        p_factura->>'proveedor_id',
        COALESCE(p_factura->>'numero_factura', ''),
        COALESCE(p_factura->>'numero_control', ''),
        v_fecha,
        v_periodo,
        v_subtotal,
        v_iva_pct,
        v_iva_monto,
        v_total,
        p_factura->>'notas'
    ) INTO v_result;

    -- Replace items: delete existing, insert new
    EXECUTE format('DELETE FROM %I.inventario_facturas_compra_items WHERE factura_id = %L', v_schema, v_id);

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        EXECUTE format($sql$
            INSERT INTO %I.inventario_facturas_compra_items
                (id, factura_id, producto_id, cantidad, costo_unitario, costo_total)
            VALUES (
                gen_random_uuid()::text,
                %L, %L,
                (%L)::numeric,
                (%L)::numeric,
                (%L)::numeric
            )
        $sql$,
            v_schema,
            v_id,
            v_item->>'producto_id',
            v_item->>'cantidad',
            v_item->>'costo_unitario',
            v_item->>'costo_total'
        );
    END LOOP;

    RETURN v_result;
END;
$$;
