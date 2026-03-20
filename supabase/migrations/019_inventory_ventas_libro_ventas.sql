-- =============================================================================
-- 019_inventory_ventas_libro_ventas.sql
-- Fase 5: Salidas por Venta + Libro de Ventas IVA
-- Adds venta fields to inventario_movimientos and creates libro_ventas RPC
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Backfill existing tenant schemas — add venta columns to movimientos
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;
        EXECUTE format('ALTER TABLE %I.inventario_movimientos ADD COLUMN IF NOT EXISTS numero_factura_venta text',             v_schema);
        EXECUTE format('ALTER TABLE %I.inventario_movimientos ADD COLUMN IF NOT EXISTS cliente_rif         text',             v_schema);
        EXECUTE format('ALTER TABLE %I.inventario_movimientos ADD COLUMN IF NOT EXISTS cliente_nombre      text',             v_schema);
        EXECUTE format('ALTER TABLE %I.inventario_movimientos ADD COLUMN IF NOT EXISTS precio_venta_unitario numeric(14,4)', v_schema);
        EXECUTE format('ALTER TABLE %I.inventario_movimientos ADD COLUMN IF NOT EXISTS iva_venta_monto     numeric(14,2)',    v_schema);
        -- also fix transformacion_id if missing from earlier migration omission
        EXECUTE format('ALTER TABLE %I.inventario_movimientos ADD COLUMN IF NOT EXISTS transformacion_id text REFERENCES %I.inventario_transformaciones(id) ON DELETE SET NULL', v_schema, v_schema);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Update provision_tenant_schema to include new venta columns
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
            existencia_minima   numeric(14,4) NOT NULL DEFAULT 0,
            costo_promedio      numeric(14,4) NOT NULL DEFAULT 0,
            activo              boolean NOT NULL DEFAULT true,
            iva_tipo            text NOT NULL DEFAULT 'general'
                                    CHECK (iva_tipo IN ('exento','general')),
            created_at          timestamptz NOT NULL DEFAULT now(),
            updated_at          timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_productos_empresa_idx ON %I.inventario_productos(empresa_id)', v_schema);

    -- inventario_transformaciones
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_transformaciones (
            id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id         text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            fecha              date NOT NULL DEFAULT CURRENT_DATE,
            periodo            text NOT NULL,
            producto_salida_id text NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE RESTRICT,
            cantidad_producida numeric(14,4) NOT NULL CHECK (cantidad_producida > 0),
            costo_total        numeric(14,2) NOT NULL DEFAULT 0,
            notas              text NOT NULL DEFAULT '',
            created_at         timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_trans_empresa_idx ON %I.inventario_transformaciones(empresa_id)', v_schema);

    -- inventario_transformaciones_insumos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_transformaciones_insumos (
            id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            transformacion_id text NOT NULL REFERENCES %I.inventario_transformaciones(id) ON DELETE CASCADE,
            producto_id       text NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE RESTRICT,
            cantidad          numeric(14,4) NOT NULL CHECK (cantidad > 0),
            costo_unitario    numeric(14,4) NOT NULL DEFAULT 0,
            costo_total       numeric(14,2) NOT NULL DEFAULT 0,
            created_at        timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    -- inventario_movimientos (includes transformacion_id and venta fields)
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_movimientos (
            id                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id            text NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            producto_id           text NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE RESTRICT,
            transformacion_id     text REFERENCES %I.inventario_transformaciones(id) ON DELETE SET NULL,
            tipo                  text NOT NULL CHECK (tipo IN (
                                      'entrada_compra','salida_venta',
                                      'entrada_produccion','salida_produccion',
                                      'ajuste_positivo','ajuste_negativo',
                                      'devolucion_compra','devolucion_venta',
                                      'autoconsumo'
                                  )),
            fecha                 date NOT NULL DEFAULT CURRENT_DATE,
            periodo               text NOT NULL,
            cantidad              numeric(14,4) NOT NULL,
            costo_unitario        numeric(14,4) NOT NULL DEFAULT 0,
            costo_total           numeric(14,2) NOT NULL DEFAULT 0,
            saldo_cantidad        numeric(14,4) NOT NULL DEFAULT 0,
            saldo_valor           numeric(14,2) NOT NULL DEFAULT 0,
            referencia            text NOT NULL DEFAULT '',
            notas                 text NOT NULL DEFAULT '',
            numero_factura_venta  text,
            cliente_rif           text,
            cliente_nombre        text,
            precio_venta_unitario numeric(14,4),
            iva_venta_monto       numeric(14,2),
            created_at            timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_empresa_idx  ON %I.inventario_movimientos(empresa_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_producto_idx ON %I.inventario_movimientos(producto_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_periodo_idx  ON %I.inventario_movimientos(periodo)', v_schema);

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

    -- inventario_facturas_compra
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
            iva_porcentaje  numeric(5,2)  NOT NULL DEFAULT 16,
            iva_monto       numeric(14,2) NOT NULL DEFAULT 0,
            total           numeric(14,2) NOT NULL DEFAULT 0,
            notas           text NOT NULL DEFAULT '',
            confirmada_at   timestamptz,
            created_at      timestamptz NOT NULL DEFAULT now(),
            updated_at      timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_facturas_empresa_idx   ON %I.inventario_facturas_compra(empresa_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_facturas_proveedor_idx ON %I.inventario_facturas_compra(proveedor_id)', v_schema);

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
    EXECUTE format('ALTER TABLE %I.inventario_transformaciones_insumos ENABLE ROW LEVEL SECURITY', v_schema);
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
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_transformaciones_insumos FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
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
-- 3. Update tenant_inventario_movimientos_save to handle venta fields
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_save(
    p_user_id uuid,
    p_row     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema          text;
    v_id              text;
    v_fecha           date;
    v_periodo         text;
    v_producto_id     text;
    v_empresa_id      text;
    v_tipo            text;
    v_cantidad        numeric(14,4);
    v_costo_unit      numeric(14,4);
    v_costo_total     numeric(14,2);
    v_saldo_cant      numeric(14,4);
    v_saldo_valor     numeric(14,2);
    v_prev_cant       numeric(14,4);
    v_prev_costo      numeric(14,4);
    v_new_costo_unit  numeric(14,4);
    v_tipos_salida    text[] := ARRAY['salida_venta','salida_produccion','ajuste_negativo',
                                       'devolucion_compra','autoconsumo'];
    v_result          jsonb;
BEGIN
    v_schema      := public.tenant_get_schema(p_user_id);
    v_id          := COALESCE(NULLIF(p_row->>'id',''), gen_random_uuid()::text);
    v_fecha       := COALESCE(NULLIF(p_row->>'fecha',''), CURRENT_DATE::text)::date;
    v_periodo     := COALESCE(NULLIF(p_row->>'periodo',''), to_char(v_fecha,'YYYY-MM'));
    v_producto_id := p_row->>'producto_id';
    v_empresa_id  := p_row->>'empresa_id';
    v_tipo        := p_row->>'tipo';
    v_cantidad    := (p_row->>'cantidad')::numeric;
    v_costo_unit  := COALESCE(NULLIF(p_row->>'costo_unitario',''), '0')::numeric;
    v_costo_total := ROUND(v_cantidad * v_costo_unit, 2);

    -- Get current product estado for running saldo
    EXECUTE format(
        'SELECT existencia_actual, costo_promedio FROM %I.inventario_productos WHERE id = %L',
        v_schema, v_producto_id
    ) INTO v_prev_cant, v_prev_costo;

    IF v_tipo = ANY(v_tipos_salida) THEN
        v_saldo_cant  := GREATEST(0, COALESCE(v_prev_cant, 0) - v_cantidad);
        v_saldo_valor := ROUND(v_saldo_cant * COALESCE(v_prev_costo, 0), 2);
        v_new_costo_unit := v_prev_costo;
    ELSE
        -- entrada: recalculate weighted average cost
        v_saldo_cant  := COALESCE(v_prev_cant, 0) + v_cantidad;
        IF v_saldo_cant > 0 THEN
            v_new_costo_unit := ROUND(
                (COALESCE(v_prev_cant, 0) * COALESCE(v_prev_costo, 0) + v_costo_total) / v_saldo_cant,
                4
            );
        ELSE
            v_new_costo_unit := v_costo_unit;
        END IF;
        v_saldo_valor := ROUND(v_saldo_cant * v_new_costo_unit, 2);
    END IF;

    -- Insert movement
    EXECUTE format($sql$
        INSERT INTO %I.inventario_movimientos (
            id, empresa_id, producto_id, transformacion_id, tipo,
            fecha, periodo, cantidad, costo_unitario, costo_total,
            saldo_cantidad, saldo_valor, referencia, notas,
            numero_factura_venta, cliente_rif, cliente_nombre,
            precio_venta_unitario, iva_venta_monto
        ) VALUES (
            %L, %L, %L, %L, %L,
            %L, %L, %L, %L, %L,
            %L, %L, %L, %L,
            %L, %L, %L, %L, %L
        )
        ON CONFLICT (id) DO UPDATE SET
            tipo                  = EXCLUDED.tipo,
            fecha                 = EXCLUDED.fecha,
            periodo               = EXCLUDED.periodo,
            cantidad              = EXCLUDED.cantidad,
            costo_unitario        = EXCLUDED.costo_unitario,
            costo_total           = EXCLUDED.costo_total,
            saldo_cantidad        = EXCLUDED.saldo_cantidad,
            saldo_valor           = EXCLUDED.saldo_valor,
            referencia            = EXCLUDED.referencia,
            notas                 = EXCLUDED.notas,
            numero_factura_venta  = EXCLUDED.numero_factura_venta,
            cliente_rif           = EXCLUDED.cliente_rif,
            cliente_nombre        = EXCLUDED.cliente_nombre,
            precio_venta_unitario = EXCLUDED.precio_venta_unitario,
            iva_venta_monto       = EXCLUDED.iva_venta_monto
        RETURNING row_to_json(%I.inventario_movimientos)::jsonb
    $sql$,
        v_schema,
        v_id, v_empresa_id, v_producto_id,
        NULLIF(p_row->>'transformacion_id', ''),
        v_tipo,
        v_fecha, v_periodo, v_cantidad, v_costo_unit, v_costo_total,
        v_saldo_cant, v_saldo_valor,
        COALESCE(p_row->>'referencia', ''),
        COALESCE(p_row->>'notas', ''),
        NULLIF(p_row->>'numero_factura_venta', ''),
        NULLIF(p_row->>'cliente_rif', ''),
        NULLIF(p_row->>'cliente_nombre', ''),
        CASE WHEN p_row->>'precio_venta_unitario' IS NOT NULL AND p_row->>'precio_venta_unitario' != ''
             THEN (p_row->>'precio_venta_unitario')::numeric ELSE NULL END,
        CASE WHEN p_row->>'iva_venta_monto' IS NOT NULL AND p_row->>'iva_venta_monto' != ''
             THEN (p_row->>'iva_venta_monto')::numeric ELSE NULL END,
        v_schema
    ) INTO v_result;

    -- Update product stock and costo_promedio
    IF v_tipo = ANY(v_tipos_salida) THEN
        EXECUTE format(
            'UPDATE %I.inventario_productos SET existencia_actual = %L, updated_at = now() WHERE id = %L',
            v_schema, v_saldo_cant, v_producto_id
        );
    ELSE
        EXECUTE format(
            'UPDATE %I.inventario_productos SET existencia_actual = %L, costo_promedio = %L, updated_at = now() WHERE id = %L',
            v_schema, v_saldo_cant, v_new_costo_unit, v_producto_id
        );
    END IF;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Update tenant_inventario_movimientos_get to return venta fields
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_get(
    p_user_id    uuid,
    p_empresa_id text,
    p_periodo    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    IF p_periodo IS NOT NULL THEN
        EXECUTE format($q$
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id',                    m.id,
                    'empresa_id',            m.empresa_id,
                    'producto_id',           m.producto_id,
                    'transformacion_id',     m.transformacion_id,
                    'tipo',                  m.tipo,
                    'fecha',                 m.fecha,
                    'periodo',               m.periodo,
                    'cantidad',              m.cantidad,
                    'costo_unitario',        m.costo_unitario,
                    'costo_total',           m.costo_total,
                    'saldo_cantidad',        m.saldo_cantidad,
                    'saldo_valor',           m.saldo_valor,
                    'referencia',            m.referencia,
                    'notas',                 m.notas,
                    'numero_factura_venta',  m.numero_factura_venta,
                    'cliente_rif',           m.cliente_rif,
                    'cliente_nombre',        m.cliente_nombre,
                    'precio_venta_unitario', m.precio_venta_unitario,
                    'iva_venta_monto',       m.iva_venta_monto,
                    'created_at',            m.created_at
                ) ORDER BY m.fecha DESC, m.created_at DESC
            ), '[]'::jsonb)
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L AND m.periodo = %L
        $q$, v_schema, p_empresa_id, p_periodo) INTO v_result;
    ELSE
        EXECUTE format($q$
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id',                    m.id,
                    'empresa_id',            m.empresa_id,
                    'producto_id',           m.producto_id,
                    'transformacion_id',     m.transformacion_id,
                    'tipo',                  m.tipo,
                    'fecha',                 m.fecha,
                    'periodo',               m.periodo,
                    'cantidad',              m.cantidad,
                    'costo_unitario',        m.costo_unitario,
                    'costo_total',           m.costo_total,
                    'saldo_cantidad',        m.saldo_cantidad,
                    'saldo_valor',           m.saldo_valor,
                    'referencia',            m.referencia,
                    'notas',                 m.notas,
                    'numero_factura_venta',  m.numero_factura_venta,
                    'cliente_rif',           m.cliente_rif,
                    'cliente_nombre',        m.cliente_nombre,
                    'precio_venta_unitario', m.precio_venta_unitario,
                    'iva_venta_monto',       m.iva_venta_monto,
                    'created_at',            m.created_at
                ) ORDER BY m.fecha DESC, m.created_at DESC
            ), '[]'::jsonb)
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
        $q$, v_schema, p_empresa_id) INTO v_result;
    END IF;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Create tenant_inventario_libro_ventas RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_libro_ventas(
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

    EXECUTE format($q$
        SELECT COALESCE(jsonb_agg(row ORDER BY row.fecha ASC, row.numero_factura ASC), '[]'::jsonb)
        FROM (
            -- Facturas de venta (grouped by numero_factura_venta / cliente / fecha)
            SELECT
                MIN(m.id)                                            AS id,
                m.fecha::text                                        AS fecha,
                COALESCE(m.numero_factura_venta, '')                 AS numero_factura,
                COALESCE(m.cliente_rif, '')                          AS cliente_rif,
                COALESCE(m.cliente_nombre, '')                       AS cliente_nombre,
                ROUND(SUM(CASE WHEN COALESCE(m.iva_venta_monto, 0) > 0
                               THEN m.precio_venta_unitario * m.cantidad ELSE 0 END), 2) AS base_gravada,
                ROUND(SUM(COALESCE(m.iva_venta_monto, 0)), 2)        AS iva_debito,
                ROUND(SUM(CASE WHEN COALESCE(m.iva_venta_monto, 0) = 0
                               THEN m.precio_venta_unitario * m.cantidad ELSE 0 END), 2) AS base_exenta,
                0::numeric                                           AS autoconsumo,
                0::numeric                                           AS iva_autoconsumo,
                ROUND(SUM(
                    m.precio_venta_unitario * m.cantidad + COALESCE(m.iva_venta_monto, 0)
                ), 2)                                                AS total,
                'venta'                                              AS tipo
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.periodo    = %L
              AND m.tipo       = 'salida_venta'
              AND m.precio_venta_unitario IS NOT NULL
            GROUP BY m.fecha, m.numero_factura_venta, m.cliente_rif, m.cliente_nombre

            UNION ALL

            -- Autoconsumos (individual rows)
            SELECT
                m.id                                                 AS id,
                m.fecha::text                                        AS fecha,
                ''                                                   AS numero_factura,
                ''                                                   AS cliente_rif,
                COALESCE(NULLIF(m.notas,''), 'Autoconsumo')          AS cliente_nombre,
                0::numeric                                           AS base_gravada,
                0::numeric                                           AS iva_debito,
                0::numeric                                           AS base_exenta,
                ROUND(m.costo_total, 2)                              AS autoconsumo,
                ROUND(COALESCE(m.iva_venta_monto, 0), 2)            AS iva_autoconsumo,
                ROUND(m.costo_total + COALESCE(m.iva_venta_monto,0), 2) AS total,
                'autoconsumo'                                        AS tipo
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.periodo    = %L
              AND m.tipo       = 'autoconsumo'
        ) row
    $q$,
        v_schema, p_empresa_id, p_periodo,
        v_schema, p_empresa_id, p_periodo
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
