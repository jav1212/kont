-- =============================================================================
-- 028_companies_config_fiscal.sql
-- DT-2: Columna config_fiscal JSONB en companies
-- Prerequerido para REQ-INV-001 (retenciones IVA), REQ-INV-003 (ISLR),
-- REQ-INV-004 (número de control) y REQ-INV-006 (contabilidad).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Backfill: agregar config_fiscal a todas las companies existentes
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r        record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;

        EXECUTE format(
            $sql$ALTER TABLE %I.companies
                 ADD COLUMN IF NOT EXISTS config_fiscal jsonb NOT NULL DEFAULT '{}'::jsonb$sql$,
            v_schema
        );
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Actualizar provision_tenant_schema — agrega config_fiscal a companies
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

    -- companies (con config_fiscal)
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.companies (
            id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            owner_id     text        NOT NULL,
            name         text        NOT NULL,
            config_fiscal jsonb      NOT NULL DEFAULT '{}'::jsonb,
            created_at   timestamptz NOT NULL DEFAULT now(),
            updated_at   timestamptz NOT NULL DEFAULT now()
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
    EXECUTE format('CREATE INDEX IF NOT EXISTS payroll_receipts_run_idx      ON %I.payroll_receipts(run_id)', v_schema);
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
            moneda_defecto    char(1)       NOT NULL DEFAULT 'B'
                                 CHECK (moneda_defecto IN ('B','D')),
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

    -- inventario_movimientos
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_movimientos (
            id                    text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id            text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            producto_id           text          NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE RESTRICT,
            transformacion_id     text          REFERENCES %I.inventario_transformaciones(id) ON DELETE SET NULL,
            tipo                  text          NOT NULL CHECK (tipo IN (
                                      'entrada_compra','salida_venta',
                                      'entrada_produccion','salida_produccion',
                                      'ajuste_positivo','ajuste_negativo',
                                      'devolucion_compra','devolucion_venta','autoconsumo'
                                  )),
            fecha                 date          NOT NULL DEFAULT CURRENT_DATE,
            periodo               text          NOT NULL,
            cantidad              numeric(14,4) NOT NULL,
            costo_unitario        numeric(14,4) NOT NULL DEFAULT 0,
            costo_total           numeric(14,2) NOT NULL DEFAULT 0,
            saldo_cantidad        numeric(14,4) NOT NULL DEFAULT 0,
            saldo_valor           numeric(14,2) NOT NULL DEFAULT 0,
            referencia            text          NOT NULL DEFAULT '',
            notas                 text          NOT NULL DEFAULT '',
            moneda                char(1)       NOT NULL DEFAULT 'B' CHECK (moneda IN ('B','D')),
            costo_moneda          numeric(12,4),
            tasa_dolar            numeric(12,4),
            numero_factura_venta  text,
            cliente_rif           text,
            cliente_nombre        text,
            precio_venta_unitario numeric(14,4),
            iva_venta_monto       numeric(14,2),
            iva_venta_alicuota    text CHECK (iva_venta_alicuota IN ('exenta','reducida_8','general_16')),
            factura_compra_id     text,
            created_at            timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema, v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_empresa_idx  ON %I.inventario_movimientos(empresa_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_producto_idx ON %I.inventario_movimientos(producto_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_periodo_idx  ON %I.inventario_movimientos(periodo)', v_schema);

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
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_facturas_empresa_idx   ON %I.inventario_facturas_compra(empresa_id)', v_schema);
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
