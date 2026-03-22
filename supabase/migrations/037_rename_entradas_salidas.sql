-- =============================================================================
-- 037_rename_entradas_salidas.sql
-- Renombra los valores de TipoMovimiento para que el sistema use
-- "entrada"/"salida" en lugar de "entrada_compra"/"salida_venta".
-- Elimina columnas de ventas no utilizadas de inventario_movimientos.
--
-- Cambios de tipo:
--   entrada_compra   → entrada
--   salida_venta     → salida
--   devolucion_compra → devolucion_entrada
--   devolucion_venta  → devolucion_salida
--
-- Columnas eliminadas de inventario_movimientos:
--   numero_factura_venta, cliente_rif, cliente_nombre,
--   precio_venta_unitario, iva_venta_monto, iva_venta_alicuota
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Migrar todos los schemas de tenants existentes
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r        record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;

        -- 1a. Eliminar el CHECK constraint del campo tipo (nombre auto-generado)
        EXECUTE format(
            'ALTER TABLE %I.inventario_movimientos DROP CONSTRAINT IF EXISTS inventario_movimientos_tipo_check',
            v_schema
        );

        -- 1b. Renombrar valores existentes
        EXECUTE format('UPDATE %I.inventario_movimientos SET tipo = ''entrada''            WHERE tipo = ''entrada_compra''',   v_schema);
        EXECUTE format('UPDATE %I.inventario_movimientos SET tipo = ''salida''             WHERE tipo = ''salida_venta''',     v_schema);
        EXECUTE format('UPDATE %I.inventario_movimientos SET tipo = ''devolucion_entrada'' WHERE tipo = ''devolucion_compra''', v_schema);
        EXECUTE format('UPDATE %I.inventario_movimientos SET tipo = ''devolucion_salida''  WHERE tipo = ''devolucion_venta''',  v_schema);

        -- 1c. Agregar nuevo CHECK constraint
        EXECUTE format($sql$
            ALTER TABLE %I.inventario_movimientos
                ADD CONSTRAINT inventario_movimientos_tipo_check
                CHECK (tipo IN (
                    'entrada', 'salida',
                    'entrada_produccion', 'salida_produccion',
                    'ajuste_positivo', 'ajuste_negativo',
                    'devolucion_entrada', 'devolucion_salida', 'autoconsumo'
                ))
        $sql$, v_schema);

        -- 1d. Eliminar columnas de ventas no utilizadas
        EXECUTE format('ALTER TABLE %I.inventario_movimientos DROP COLUMN IF EXISTS numero_factura_venta',  v_schema);
        EXECUTE format('ALTER TABLE %I.inventario_movimientos DROP COLUMN IF EXISTS cliente_rif',           v_schema);
        EXECUTE format('ALTER TABLE %I.inventario_movimientos DROP COLUMN IF EXISTS cliente_nombre',        v_schema);
        EXECUTE format('ALTER TABLE %I.inventario_movimientos DROP COLUMN IF EXISTS precio_venta_unitario', v_schema);
        EXECUTE format('ALTER TABLE %I.inventario_movimientos DROP COLUMN IF EXISTS iva_venta_monto',       v_schema);
        EXECUTE format('ALTER TABLE %I.inventario_movimientos DROP COLUMN IF EXISTS iva_venta_alicuota',    v_schema);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Actualizar provision_tenant_schema — tabla inventario_movimientos limpia
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_tenant_schema(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema  text;
    v_plan_id uuid;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    SELECT id INTO v_plan_id FROM public.plans WHERE name = 'Emprendedor' LIMIT 1;

    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon', v_schema);

    -- companies
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.companies (
            id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            owner_id   text        NOT NULL,
            name       text        NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema);

    -- employees
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.employees (
            id              text          PRIMARY KEY,
            company_id      text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            cedula          text          NOT NULL,
            nombre          text          NOT NULL,
            cargo           text          NOT NULL DEFAULT '',
            salario_mensual numeric(14,2) NOT NULL DEFAULT 0,
            estado          text          NOT NULL DEFAULT 'activo',
            created_at      timestamptz   NOT NULL DEFAULT now(),
            updated_at      timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS employees_company_idx ON %I.employees(company_id)', v_schema);

    -- payroll_runs
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.payroll_runs (
            id            text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id    text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            period_start  date          NOT NULL,
            period_end    date          NOT NULL,
            exchange_rate numeric(12,4) NOT NULL DEFAULT 1,
            status        text          NOT NULL DEFAULT 'draft',
            created_at    timestamptz   NOT NULL DEFAULT now(),
            updated_at    timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_runs_company_idx ON %I.payroll_runs(company_id)', v_schema);

    -- payroll_receipts
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.payroll_receipts (
            id              text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            run_id          text          NOT NULL REFERENCES %I.payroll_runs(id) ON DELETE CASCADE,
            company_id      text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            employee_id     text          NOT NULL REFERENCES %I.employees(id) ON DELETE RESTRICT,
            cedula          text          NOT NULL,
            nombre          text          NOT NULL,
            cargo           text          NOT NULL DEFAULT '',
            salario_mensual numeric(14,2) NOT NULL DEFAULT 0,
            gross           numeric(14,2) NOT NULL DEFAULT 0,
            deductions      numeric(14,2) NOT NULL DEFAULT 0,
            net             numeric(14,2) NOT NULL DEFAULT 0,
            exchange_rate   numeric(12,4) NOT NULL DEFAULT 1,
            net_usd         numeric(14,4) NOT NULL DEFAULT 0,
            rows_json       jsonb         NOT NULL DEFAULT '[]',
            created_at      timestamptz   NOT NULL DEFAULT now(),
            updated_at      timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema, v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_run_idx      ON %I.payroll_receipts(run_id)',      v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_employee_idx ON %I.payroll_receipts(employee_id)', v_schema);

    -- inventario_departamentos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_departamentos (
            id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id  text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            nombre      text        NOT NULL,
            descripcion text        NOT NULL DEFAULT '',
            activo      boolean     NOT NULL DEFAULT true,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_departamentos_empresa_idx ON %I.inventario_departamentos(empresa_id)', v_schema);

    -- inventario_productos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_productos (
            id               text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id       text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            departamento_id  text          REFERENCES %I.inventario_departamentos(id) ON DELETE SET NULL,
            codigo           text          NOT NULL DEFAULT '',
            nombre           text          NOT NULL,
            descripcion      text          NOT NULL DEFAULT '',
            unidad_medida    text          NOT NULL DEFAULT 'unidad',
            tipo             text          NOT NULL DEFAULT 'mercancia'
                                 CHECK (tipo IN ('mercancia','materia_prima','producto_terminado')),
            metodo_valuacion text          NOT NULL DEFAULT 'promedio_ponderado'
                                 CHECK (metodo_valuacion IN ('promedio_ponderado','peps')),
            existencia_actual numeric(14,4) NOT NULL DEFAULT 0,
            existencia_minima numeric(14,4) NOT NULL DEFAULT 0,
            costo_promedio    numeric(14,4) NOT NULL DEFAULT 0,
            activo            boolean       NOT NULL DEFAULT true,
            iva_tipo          text          NOT NULL DEFAULT 'general'
                                 CHECK (iva_tipo IN ('exento','general')),
            created_at        timestamptz   NOT NULL DEFAULT now(),
            updated_at        timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_productos_empresa_idx ON %I.inventario_productos(empresa_id)', v_schema);

    -- inventario_transformaciones
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_transformaciones (
            id                 text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id         text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            fecha              date          NOT NULL DEFAULT CURRENT_DATE,
            periodo            text          NOT NULL,
            producto_salida_id text          NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE RESTRICT,
            cantidad_producida numeric(14,4) NOT NULL CHECK (cantidad_producida > 0),
            costo_total        numeric(14,2) NOT NULL DEFAULT 0,
            notas              text          NOT NULL DEFAULT '',
            created_at         timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_trans_empresa_idx ON %I.inventario_transformaciones(empresa_id)', v_schema);

    -- inventario_transformaciones_insumos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_transformaciones_insumos (
            id                text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            transformacion_id text          NOT NULL REFERENCES %I.inventario_transformaciones(id) ON DELETE CASCADE,
            producto_id       text          NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE RESTRICT,
            cantidad          numeric(14,4) NOT NULL CHECK (cantidad > 0),
            costo_unitario    numeric(14,4) NOT NULL DEFAULT 0,
            costo_total       numeric(14,2) NOT NULL DEFAULT 0,
            created_at        timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    -- inventario_movimientos (sin columnas de ventas, tipo renombrado)
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_movimientos (
            id                text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id        text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            producto_id       text          NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE RESTRICT,
            transformacion_id text          REFERENCES %I.inventario_transformaciones(id) ON DELETE SET NULL,
            tipo              text          NOT NULL CHECK (tipo IN (
                                                'entrada', 'salida',
                                                'entrada_produccion', 'salida_produccion',
                                                'ajuste_positivo', 'ajuste_negativo',
                                                'devolucion_entrada', 'devolucion_salida', 'autoconsumo'
                                            )),
            fecha             date          NOT NULL DEFAULT CURRENT_DATE,
            periodo           text          NOT NULL,
            cantidad          numeric(14,4) NOT NULL,
            costo_unitario    numeric(14,4) NOT NULL DEFAULT 0,
            costo_total       numeric(14,2) NOT NULL DEFAULT 0,
            saldo_cantidad    numeric(14,4) NOT NULL DEFAULT 0,
            saldo_valor       numeric(14,2) NOT NULL DEFAULT 0,
            referencia        text          NOT NULL DEFAULT '',
            notas             text          NOT NULL DEFAULT '',
            moneda            char(1)       NOT NULL DEFAULT 'B' CHECK (moneda IN ('B','D')),
            costo_moneda      numeric(12,4),
            tasa_dolar        numeric(12,4),
            factura_compra_id text,
            created_at        timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema, v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_empresa_idx  ON %I.inventario_movimientos(empresa_id)',  v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_producto_idx ON %I.inventario_movimientos(producto_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_periodo_idx  ON %I.inventario_movimientos(periodo)',     v_schema);

    -- inventario_cierres
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_cierres (
            id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            periodo    text        NOT NULL,
            cerrado_at timestamptz NOT NULL DEFAULT now(),
            notas      text        NOT NULL DEFAULT '',
            tasa_dolar numeric(12,4),
            UNIQUE(empresa_id, periodo)
        )
    $tbl$, v_schema, v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_cierres_empresa_idx ON %I.inventario_cierres(empresa_id)', v_schema);

    -- inventario_proveedores
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_proveedores (
            id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            nombre     text        NOT NULL,
            rif        text        NOT NULL DEFAULT '',
            contacto   text        NOT NULL DEFAULT '',
            telefono   text        NOT NULL DEFAULT '',
            email      text        NOT NULL DEFAULT '',
            direccion  text        NOT NULL DEFAULT '',
            notas      text        NOT NULL DEFAULT '',
            activo     boolean     NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_proveedores_empresa_idx ON %I.inventario_proveedores(empresa_id)', v_schema);

    -- inventario_facturas_compra
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_facturas_compra (
            id             text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id     text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            proveedor_id   text          NOT NULL REFERENCES %I.inventario_proveedores(id) ON DELETE RESTRICT,
            numero_factura text          NOT NULL DEFAULT '',
            numero_control text          NOT NULL DEFAULT '',
            fecha          date          NOT NULL DEFAULT CURRENT_DATE,
            periodo        text          NOT NULL,
            estado         text          NOT NULL DEFAULT 'borrador'
                               CHECK (estado IN ('borrador','confirmada')),
            subtotal       numeric(14,2) NOT NULL DEFAULT 0,
            iva_porcentaje numeric(5,2)  NOT NULL DEFAULT 0,
            iva_monto      numeric(14,2) NOT NULL DEFAULT 0,
            total          numeric(14,2) NOT NULL DEFAULT 0,
            notas          text          NOT NULL DEFAULT '',
            confirmada_at  timestamptz,
            created_at     timestamptz   NOT NULL DEFAULT now(),
            updated_at     timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_facturas_empresa_idx   ON %I.inventario_facturas_compra(empresa_id)',   v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_facturas_proveedor_idx ON %I.inventario_facturas_compra(proveedor_id)', v_schema);

    -- inventario_facturas_compra_items
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_facturas_compra_items (
            id             text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            factura_id     text          NOT NULL REFERENCES %I.inventario_facturas_compra(id) ON DELETE CASCADE,
            producto_id    text          NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE RESTRICT,
            cantidad       numeric(14,4) NOT NULL CHECK (cantidad > 0),
            costo_unitario numeric(14,4) NOT NULL DEFAULT 0,
            costo_total    numeric(14,2) NOT NULL DEFAULT 0,
            iva_alicuota   text          NOT NULL DEFAULT 'general_16'
                               CHECK (iva_alicuota IN ('exenta','reducida_8','general_16')),
            moneda         char(1)       NOT NULL DEFAULT 'B' CHECK (moneda IN ('B','D')),
            costo_moneda   numeric(12,4),
            tasa_dolar     numeric(12,4),
            created_at     timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_factura_items_factura_idx ON %I.inventario_facturas_compra_items(factura_id)', v_schema);

    -- RLS
    EXECUTE format('ALTER TABLE %I.companies                           ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employees                           ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_runs                        ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_receipts                    ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_departamentos            ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_productos                ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_transformaciones         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_transformaciones_insumos ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_movimientos              ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_cierres                  ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_proveedores              ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_facturas_compra          ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_facturas_compra_items    ENABLE ROW LEVEL SECURITY', v_schema);

    -- Policies
    EXECUTE format('CREATE POLICY tenant_owner ON %I.companies                           FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.employees                           FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_runs                        FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.payroll_receipts                    FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_departamentos            FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_productos                FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_transformaciones         FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_transformaciones_insumos FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_movimientos              FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_cierres                  FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_proveedores              FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_facturas_compra          FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);
    EXECUTE format('CREATE POLICY tenant_owner ON %I.inventario_facturas_compra_items    FOR ALL USING (auth.uid() = %L::uuid)', v_schema, p_user_id);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', v_schema);

    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. tenant_inventario_movimientos_save — sin columnas de ventas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_save(
    p_user_id uuid,
    p_row     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema         text;
    v_id             text;
    v_fecha          date;
    v_periodo        text;
    v_producto_id    text;
    v_empresa_id     text;
    v_tipo           text;
    v_cantidad       numeric(14,4);
    v_costo_unit     numeric(14,4);
    v_costo_total    numeric(14,2);
    v_saldo_cant     numeric(14,4);
    v_saldo_valor    numeric(14,2);
    v_prev_cant      numeric(14,4);
    v_prev_costo     numeric(14,4);
    v_new_costo_unit numeric(14,4);
    v_tipos_salida   text[] := ARRAY['salida','salida_produccion','ajuste_negativo',
                                     'devolucion_entrada','autoconsumo'];
    v_result         jsonb;
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

    EXECUTE format(
        'SELECT existencia_actual, costo_promedio FROM %I.inventario_productos WHERE id = %L',
        v_schema, v_producto_id
    ) INTO v_prev_cant, v_prev_costo;

    IF v_tipo = ANY(v_tipos_salida) THEN
        v_saldo_cant  := GREATEST(0, COALESCE(v_prev_cant, 0) - v_cantidad);
        v_saldo_valor := ROUND(v_saldo_cant * COALESCE(v_prev_costo, 0), 2);
        v_new_costo_unit := v_prev_costo;
    ELSE
        v_saldo_cant := COALESCE(v_prev_cant, 0) + v_cantidad;
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

    EXECUTE format($sql$
        INSERT INTO %I.inventario_movimientos (
            id, empresa_id, producto_id, transformacion_id, tipo,
            fecha, periodo, cantidad, costo_unitario, costo_total,
            saldo_cantidad, saldo_valor, referencia, notas,
            moneda, costo_moneda, tasa_dolar
        ) VALUES (
            %L, %L, %L, %L, %L,
            %L, %L, %L, %L, %L,
            %L, %L, %L, %L,
            %L, %L, %L
        )
        ON CONFLICT (id) DO UPDATE SET
            tipo           = EXCLUDED.tipo,
            fecha          = EXCLUDED.fecha,
            periodo        = EXCLUDED.periodo,
            cantidad       = EXCLUDED.cantidad,
            costo_unitario = EXCLUDED.costo_unitario,
            costo_total    = EXCLUDED.costo_total,
            saldo_cantidad = EXCLUDED.saldo_cantidad,
            saldo_valor    = EXCLUDED.saldo_valor,
            referencia     = EXCLUDED.referencia,
            notas          = EXCLUDED.notas,
            moneda         = EXCLUDED.moneda,
            costo_moneda   = EXCLUDED.costo_moneda,
            tasa_dolar     = EXCLUDED.tasa_dolar
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
        COALESCE(NULLIF(p_row->>'moneda', ''), 'B'),
        CASE WHEN p_row->>'costo_moneda' IS NOT NULL AND p_row->>'costo_moneda' != ''
             THEN (p_row->>'costo_moneda')::numeric ELSE NULL END,
        CASE WHEN p_row->>'tasa_dolar' IS NOT NULL AND p_row->>'tasa_dolar' != ''
             THEN (p_row->>'tasa_dolar')::numeric ELSE NULL END,
        v_schema
    ) INTO v_result;

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
-- 4. tenant_inventario_movimientos_get — sin columnas de ventas
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
                    'id',                m.id,
                    'empresa_id',        m.empresa_id,
                    'producto_id',       m.producto_id,
                    'transformacion_id', m.transformacion_id,
                    'tipo',              m.tipo,
                    'fecha',             m.fecha,
                    'periodo',           m.periodo,
                    'cantidad',          m.cantidad,
                    'costo_unitario',    m.costo_unitario,
                    'costo_total',       m.costo_total,
                    'saldo_cantidad',    m.saldo_cantidad,
                    'saldo_valor',       m.saldo_valor,
                    'referencia',        m.referencia,
                    'notas',             m.notas,
                    'moneda',            m.moneda,
                    'costo_moneda',      m.costo_moneda,
                    'tasa_dolar',        m.tasa_dolar,
                    'created_at',        m.created_at
                ) ORDER BY m.fecha DESC, m.created_at DESC
            ), '[]'::jsonb)
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L AND m.periodo = %L
        $q$, v_schema, p_empresa_id, p_periodo) INTO v_result;
    ELSE
        EXECUTE format($q$
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id',                m.id,
                    'empresa_id',        m.empresa_id,
                    'producto_id',       m.producto_id,
                    'transformacion_id', m.transformacion_id,
                    'tipo',              m.tipo,
                    'fecha',             m.fecha,
                    'periodo',           m.periodo,
                    'cantidad',          m.cantidad,
                    'costo_unitario',    m.costo_unitario,
                    'costo_total',       m.costo_total,
                    'saldo_cantidad',    m.saldo_cantidad,
                    'saldo_valor',       m.saldo_valor,
                    'referencia',        m.referencia,
                    'notas',             m.notas,
                    'moneda',            m.moneda,
                    'costo_moneda',      m.costo_moneda,
                    'tasa_dolar',        m.tasa_dolar,
                    'created_at',        m.created_at
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
-- 5. tenant_inventario_libro_ventas → ahora retorna salidas del período
--    (sin IVA ni datos de cliente, que ya no existen)
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
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',             m.id,
                'fecha',          m.fecha::text,
                'producto_id',    m.producto_id,
                'tipo',           m.tipo,
                'cantidad',       m.cantidad,
                'costo_unitario', m.costo_unitario,
                'costo_total',    m.costo_total,
                'saldo_cantidad', m.saldo_cantidad,
                'referencia',     m.referencia,
                'notas',          m.notas
            ) ORDER BY m.fecha ASC, m.created_at ASC
        ), '[]'::jsonb)
        FROM %I.inventario_movimientos m
        WHERE m.empresa_id = %L
          AND m.periodo    = %L
          AND m.tipo       = 'salida'
    $q$, v_schema, p_empresa_id, p_periodo) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. tenant_inventario_kardex_periodo (ISLR) — tipos actualizados
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_kardex_periodo(
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
        WITH productos_periodo AS (
            SELECT DISTINCT m.producto_id, p.codigo, p.nombre
            FROM %I.inventario_movimientos m
            JOIN %I.inventario_productos p ON p.id = m.producto_id
            WHERE m.empresa_id = %L
              AND m.periodo = %L
        ),
        apertura AS (
            SELECT DISTINCT ON (m.producto_id)
                m.producto_id,
                m.saldo_cantidad                    AS apertura_cantidad,
                m.saldo_cantidad * m.costo_unitario AS apertura_costo
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.periodo < %L
              AND m.producto_id IN (SELECT producto_id FROM productos_periodo)
            ORDER BY m.producto_id, m.fecha DESC, m.id DESC
        ),
        movs AS (
            SELECT
                m.producto_id,
                m.id,
                m.fecha,
                COALESCE(m.referencia, '')             AS referencia,
                m.tipo,
                CASE WHEN m.tipo IN ('entrada','entrada_produccion','devolucion_salida','ajuste_positivo')
                     THEN m.cantidad ELSE 0 END        AS cant_entrada,
                CASE WHEN m.tipo NOT IN ('entrada','entrada_produccion','devolucion_salida','ajuste_positivo')
                     THEN m.cantidad ELSE 0 END        AS cant_salida,
                m.saldo_cantidad,
                CASE WHEN m.tipo IN ('entrada','entrada_produccion','devolucion_salida','ajuste_positivo')
                     THEN COALESCE(m.costo_total, 0) ELSE 0 END AS costo_entrada,
                CASE WHEN m.tipo NOT IN ('entrada','entrada_produccion','devolucion_salida','ajuste_positivo')
                     THEN COALESCE(m.costo_total, 0) ELSE 0 END AS costo_salida,
                m.saldo_cantidad * m.costo_unitario    AS saldo_costo
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.periodo = %L
        )
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'producto_id',       pp.producto_id,
                'producto_codigo',   pp.codigo,
                'producto_nombre',   pp.nombre,
                'apertura_cantidad', COALESCE(a.apertura_cantidad, 0),
                'apertura_costo',    COALESCE(a.apertura_costo, 0),
                'movimientos', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id',             mv.id,
                            'fecha',          mv.fecha,
                            'referencia',     mv.referencia,
                            'tipo',           mv.tipo,
                            'cant_entrada',   mv.cant_entrada,
                            'cant_salida',    mv.cant_salida,
                            'saldo_cantidad', mv.saldo_cantidad,
                            'costo_entrada',  mv.costo_entrada,
                            'costo_salida',   mv.costo_salida,
                            'saldo_costo',    mv.saldo_costo
                        ) ORDER BY mv.fecha ASC, mv.id ASC
                    )
                    FROM movs mv WHERE mv.producto_id = pp.producto_id
                ), '[]'::jsonb)
            ) ORDER BY pp.codigo ASC
        ), '[]'::jsonb)
        FROM productos_periodo pp
        LEFT JOIN apertura a ON a.producto_id = pp.producto_id
    $q$,
        v_schema, v_schema, p_empresa_id, p_periodo,
        v_schema, p_empresa_id, p_periodo,
        v_schema, p_empresa_id, p_periodo
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. tenant_inventario_libro_inventarios — tipos actualizados
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_libro_inventarios(
    p_user_id    uuid,
    p_empresa_id text,
    p_anio       int
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema     text;
    v_fecha_ini  date;
    v_fecha_fin  date;
    v_result     jsonb;
BEGIN
    v_schema    := public.tenant_get_schema(p_user_id);
    v_fecha_ini := make_date(p_anio, 1, 1);
    v_fecha_fin := make_date(p_anio, 12, 31);

    EXECUTE format($q$
        WITH productos_anno AS (
            SELECT DISTINCT p.id, p.codigo, p.nombre, p.tipo, p.unidad_medida
            FROM %I.inventario_productos p
            JOIN %I.inventario_movimientos m ON m.producto_id = p.id
            WHERE m.empresa_id = %L
              AND m.fecha BETWEEN %L AND %L
        ),
        apertura AS (
            SELECT DISTINCT ON (m.producto_id)
                m.producto_id,
                m.saldo_cantidad                          AS cant_inicial,
                ROUND(m.saldo_cantidad * m.costo_unitario, 2) AS valor_inicial
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.fecha < %L
              AND m.producto_id IN (SELECT id FROM productos_anno)
            ORDER BY m.producto_id, m.fecha DESC, m.created_at DESC
        ),
        movs_anno AS (
            SELECT
                m.producto_id,
                SUM(CASE
                    WHEN m.tipo IN ('entrada','entrada_produccion','devolucion_salida','ajuste_positivo')
                    THEN m.cantidad ELSE 0
                END)                                      AS cant_entradas,
                ROUND(SUM(CASE
                    WHEN m.tipo IN ('entrada','entrada_produccion','devolucion_salida','ajuste_positivo')
                    THEN COALESCE(m.costo_total, 0) ELSE 0
                END), 2)                                  AS valor_entradas,
                SUM(CASE
                    WHEN m.tipo IN ('salida','salida_produccion','devolucion_entrada','autoconsumo','ajuste_negativo')
                    THEN m.cantidad ELSE 0
                END)                                      AS cant_salidas,
                ROUND(SUM(CASE
                    WHEN m.tipo IN ('salida','salida_produccion','devolucion_entrada','autoconsumo','ajuste_negativo')
                    THEN COALESCE(m.costo_total, 0) ELSE 0
                END), 2)                                  AS valor_salidas,
                ROUND(SUM(CASE
                    WHEN m.tipo = 'entrada'
                    THEN COALESCE(m.costo_total, 0) ELSE 0
                END), 2)                                  AS valor_compras
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.fecha BETWEEN %L AND %L
            GROUP BY m.producto_id
        ),
        cierre AS (
            SELECT DISTINCT ON (m.producto_id)
                m.producto_id,
                m.saldo_cantidad                              AS cant_final,
                ROUND(m.saldo_cantidad * m.costo_unitario, 2) AS valor_final
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.fecha <= %L
              AND m.producto_id IN (SELECT id FROM productos_anno)
            ORDER BY m.producto_id, m.fecha DESC, m.created_at DESC
        )
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',              p.id,
                'codigo',          p.codigo,
                'nombre',          p.nombre,
                'tipo',            p.tipo,
                'unidad_medida',   p.unidad_medida,
                'cant_inicial',    COALESCE(a.cant_inicial,   0),
                'valor_inicial',   COALESCE(a.valor_inicial,  0),
                'cant_entradas',   COALESCE(ma.cant_entradas, 0),
                'valor_entradas',  COALESCE(ma.valor_entradas,0),
                'cant_salidas',    COALESCE(ma.cant_salidas,  0),
                'valor_salidas',   COALESCE(ma.valor_salidas, 0),
                'cant_final',      COALESCE(c.cant_final,     0),
                'valor_final',     COALESCE(c.valor_final,    0),
                'valor_compras',   COALESCE(ma.valor_compras, 0)
            ) ORDER BY p.nombre ASC
        ), '[]'::jsonb)
        FROM productos_anno p
        LEFT JOIN apertura   a  ON a.producto_id  = p.id
        LEFT JOIN movs_anno  ma ON ma.producto_id = p.id
        LEFT JOIN cierre     c  ON c.producto_id  = p.id
    $q$,
        v_schema, v_schema, p_empresa_id, v_fecha_ini, v_fecha_fin,
        v_schema, p_empresa_id, v_fecha_ini,
        v_schema, p_empresa_id, v_fecha_ini, v_fecha_fin,
        v_schema, p_empresa_id, v_fecha_fin
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. tenant_inventario_reporte_saldo — tipos actualizados
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_reporte_saldo(
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
        mov_periodo AS (
            SELECT
                m.producto_id,
                SUM(CASE WHEN m.tipo IN ('entrada','entrada_produccion','devolucion_entrada','ajuste_positivo')
                         THEN m.cantidad ELSE 0 END) AS unidades_entradas,
                SUM(CASE WHEN m.tipo IN ('salida','salida_produccion','devolucion_salida','ajuste_negativo','autoconsumo')
                         THEN m.cantidad ELSE 0 END) AS unidades_salidas,
                SUM(CASE WHEN m.tipo IN ('entrada','entrada_produccion','devolucion_entrada','ajuste_positivo')
                         THEN m.costo_total ELSE 0 END) AS costo_entradas,
                SUM(CASE WHEN m.tipo IN ('salida','salida_produccion','devolucion_salida','ajuste_negativo','autoconsumo')
                         THEN m.costo_total ELSE 0 END) AS costo_salidas
            FROM %I.inventario_movimientos m
            WHERE m.empresa_id = %L
              AND m.periodo = %L
            GROUP BY m.producto_id
        ),
        por_producto AS (
            SELECT
                COALESCE(d.nombre, 'Sin departamento')           AS departamento_nombre,
                COALESCE(ii.saldo, 0)                            AS unidades_inicial,
                COALESCE(ii.saldo, 0) * p.costo_promedio         AS costo_inicial,
                COALESCE(mp.unidades_entradas, 0)                AS unidades_entradas,
                COALESCE(mp.costo_entradas, 0)                   AS costo_entradas,
                COALESCE(mp.unidades_salidas, 0)                 AS unidades_salidas,
                COALESCE(mp.costo_salidas, 0)                    AS costo_salidas,
                p.existencia_actual                              AS unidades_existencia,
                p.existencia_actual * p.costo_promedio           AS costo_existencia
            FROM %I.inventario_productos p
            LEFT JOIN %I.inventario_departamentos d ON d.id = p.departamento_id
            LEFT JOIN inv_inicial ii                 ON ii.producto_id = p.id
            LEFT JOIN mov_periodo mp                 ON mp.producto_id = p.id
            WHERE p.empresa_id = %L
              AND p.activo = true
        )
        SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
        FROM (
            SELECT
                departamento_nombre,
                SUM(unidades_inicial)    AS unidades_inicial,
                SUM(costo_inicial)       AS costo_inicial,
                SUM(unidades_entradas)   AS unidades_entradas,
                SUM(costo_entradas)      AS costo_entradas,
                SUM(unidades_salidas)    AS unidades_salidas,
                SUM(costo_salidas)       AS costo_salidas,
                SUM(unidades_existencia) AS unidades_existencia,
                SUM(costo_existencia)    AS costo_existencia
            FROM por_producto
            GROUP BY departamento_nombre
            ORDER BY departamento_nombre
        ) t
    $sql$,
        v_schema, p_empresa_id, p_periodo,
        v_schema, p_periodo,
        v_schema, p_empresa_id, p_periodo,
        v_schema, v_schema,
        p_empresa_id
    ) INTO v_result;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
