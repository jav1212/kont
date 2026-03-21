-- =============================================================================
-- 023_inventory_multimoneda.sql
-- Fase A: Multi-moneda USD/Bs con tasa de cambio BCV
--
-- A.1 — tasa_dolar en inventario_cierres
-- A.2 — moneda_defecto en inventario_productos
-- A.3 — moneda/costo_moneda/tasa_dolar en inventario_facturas_compra_items
-- A.4 — moneda/costo_moneda/tasa_dolar en inventario_movimientos
--
-- Principio: costo_unitario siempre en Bs (canónico).
--            costo_moneda + tasa_dolar son referencia histórica/auditoría.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Backfill existing tenant schemas
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r        record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;

        -- A.1
        EXECUTE format(
            'ALTER TABLE %I.inventario_cierres ADD COLUMN IF NOT EXISTS tasa_dolar NUMERIC(12,4)',
            v_schema
        );
        -- notas may be missing on tenants provisioned after migration 020
        EXECUTE format(
            $sql$ALTER TABLE %I.inventario_cierres ADD COLUMN IF NOT EXISTS notas text NOT NULL DEFAULT ''$sql$,
            v_schema
        );

        -- A.2
        EXECUTE format(
            $sql$ALTER TABLE %I.inventario_productos
                 ADD COLUMN IF NOT EXISTS moneda_defecto CHAR(1) NOT NULL DEFAULT 'B'
                     CHECK (moneda_defecto IN ('B','D'))$sql$,
            v_schema
        );

        -- A.3
        EXECUTE format(
            $sql$ALTER TABLE %I.inventario_facturas_compra_items
                 ADD COLUMN IF NOT EXISTS moneda CHAR(1) NOT NULL DEFAULT 'B'
                     CHECK (moneda IN ('B','D'))$sql$,
            v_schema
        );
        EXECUTE format(
            'ALTER TABLE %I.inventario_facturas_compra_items ADD COLUMN IF NOT EXISTS costo_moneda NUMERIC(12,4)',
            v_schema
        );
        EXECUTE format(
            'ALTER TABLE %I.inventario_facturas_compra_items ADD COLUMN IF NOT EXISTS tasa_dolar NUMERIC(12,4)',
            v_schema
        );

        -- A.4
        EXECUTE format(
            $sql$ALTER TABLE %I.inventario_movimientos
                 ADD COLUMN IF NOT EXISTS moneda CHAR(1) NOT NULL DEFAULT 'B'
                     CHECK (moneda IN ('B','D'))$sql$,
            v_schema
        );
        EXECUTE format(
            'ALTER TABLE %I.inventario_movimientos ADD COLUMN IF NOT EXISTS costo_moneda NUMERIC(12,4)',
            v_schema
        );
        EXECUTE format(
            'ALTER TABLE %I.inventario_movimientos ADD COLUMN IF NOT EXISTS tasa_dolar NUMERIC(12,4)',
            v_schema
        );
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Update provision_tenant_schema — incluye todas las columnas nuevas
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
            id           text          PRIMARY KEY DEFAULT gen_random_uuid()::text,
            company_id   text          NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            period_start date          NOT NULL,
            period_end   date          NOT NULL,
            exchange_rate numeric(12,4) NOT NULL DEFAULT 1,
            status       text          NOT NULL DEFAULT 'draft',
            created_at   timestamptz   NOT NULL DEFAULT now(),
            updated_at   timestamptz   NOT NULL DEFAULT now()
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

    -- inventario_productos (con moneda_defecto)
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

    -- inventario_movimientos (con moneda/costo_moneda/tasa_dolar)
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
            created_at            timestamptz   NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema, v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_empresa_idx  ON %I.inventario_movimientos(empresa_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_producto_idx ON %I.inventario_movimientos(producto_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movimientos_periodo_idx  ON %I.inventario_movimientos(periodo)', v_schema);

    -- inventario_cierres (con notas + tasa_dolar)
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

    -- inventario_facturas_compra_items (con iva_alicuota + moneda/costo_moneda/tasa_dolar)
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
-- 3. A.1 — tenant_inventario_cierre_save: acepta tasa_dolar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_cierre_save(
    p_user_id    uuid,
    p_empresa_id text,
    p_periodo    text,
    p_notas      text    DEFAULT '',
    p_tasa_dolar numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format($sql$
        INSERT INTO %I.inventario_cierres (id, empresa_id, periodo, notas, tasa_dolar)
        VALUES (gen_random_uuid()::text, %L, %L, %L, %L)
        ON CONFLICT (empresa_id, periodo) DO UPDATE
            SET notas      = EXCLUDED.notas,
                tasa_dolar = EXCLUDED.tasa_dolar
        RETURNING row_to_json(inventario_cierres)
    $sql$,
        v_schema, p_empresa_id, p_periodo,
        COALESCE(p_notas, ''), p_tasa_dolar
    ) INTO v_result;
    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. A.2 — tenant_inventario_productos_upsert: agrega departamento_id,
--    iva_tipo (corrección omisión previa) y moneda_defecto
-- ---------------------------------------------------------------------------
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
            (id, empresa_id, departamento_id, codigo, nombre, descripcion, tipo, unidad_medida,
             metodo_valuacion, existencia_actual, existencia_minima, costo_promedio,
             activo, iva_tipo, moneda_defecto, updated_at)
        VALUES (
            %L, %L,
            NULLIF(%L, ''),
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
            COALESCE(NULLIF(%L,''), 'general'),
            COALESCE(NULLIF(%L,''), 'B'),
            now()
        )
        ON CONFLICT (id) DO UPDATE SET
            departamento_id  = EXCLUDED.departamento_id,
            codigo           = EXCLUDED.codigo,
            nombre           = EXCLUDED.nombre,
            descripcion      = EXCLUDED.descripcion,
            tipo             = EXCLUDED.tipo,
            unidad_medida    = EXCLUDED.unidad_medida,
            metodo_valuacion = EXCLUDED.metodo_valuacion,
            existencia_minima = EXCLUDED.existencia_minima,
            activo           = EXCLUDED.activo,
            iva_tipo         = EXCLUDED.iva_tipo,
            moneda_defecto   = EXCLUDED.moneda_defecto,
            updated_at       = now()
        RETURNING row_to_json(inventario_productos)
    $sql$,
        v_schema, v_id,
        p_row->>'empresa_id',
        p_row->>'departamento_id',
        p_row->>'codigo',
        p_row->>'nombre',
        p_row->>'descripcion',
        p_row->>'tipo',
        p_row->>'unidad_medida',
        p_row->>'metodo_valuacion',
        p_row->>'existencia_actual',
        p_row->>'existencia_minima',
        p_row->>'costo_promedio',
        p_row->>'activo',
        p_row->>'iva_tipo',
        p_row->>'moneda_defecto'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. A.3 — tenant_inventario_factura_save: persiste moneda/costo_moneda/tasa_dolar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_save(
    p_user_id uuid,
    p_factura jsonb,
    p_items   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema    text;
    v_id        text;
    v_fecha     date;
    v_periodo   text;
    v_subtotal  numeric(14,2);
    v_iva_monto numeric(14,2);
    v_total     numeric(14,2);
    v_item      jsonb;
    v_result    jsonb;
    v_estado    text;
BEGIN
    v_schema  := public.tenant_get_schema(p_user_id);
    v_id      := COALESCE(NULLIF(p_factura->>'id', ''), gen_random_uuid()::text);
    v_fecha   := COALESCE(NULLIF(p_factura->>'fecha', ''), CURRENT_DATE::text)::date;
    v_periodo := to_char(v_fecha, 'YYYY-MM');

    IF NULLIF(p_factura->>'id', '') IS NOT NULL THEN
        EXECUTE format(
            'SELECT estado FROM %I.inventario_facturas_compra WHERE id = %L',
            v_schema, v_id
        ) INTO v_estado;
        IF v_estado = 'confirmada' THEN
            RAISE EXCEPTION 'No se puede modificar una factura confirmada';
        END IF;
    END IF;

    -- Subtotal (siempre en Bs — costo_total ya está convertido)
    SELECT COALESCE(SUM((item->>'costo_total')::numeric), 0)
    INTO v_subtotal
    FROM jsonb_array_elements(p_items) AS item;

    -- IVA por alícuota por línea
    SELECT ROUND(COALESCE(SUM(
        CASE COALESCE(item->>'iva_alicuota', 'general_16')
            WHEN 'reducida_8' THEN (item->>'costo_total')::numeric * 8  / 100
            WHEN 'general_16' THEN (item->>'costo_total')::numeric * 16 / 100
            ELSE 0
        END
    ), 0), 2)
    INTO v_iva_monto
    FROM jsonb_array_elements(p_items) AS item;

    v_total := v_subtotal + v_iva_monto;

    EXECUTE format($sql$
        INSERT INTO %I.inventario_facturas_compra
            (id, empresa_id, proveedor_id, numero_factura, numero_control,
             fecha, periodo, estado, subtotal, iva_porcentaje, iva_monto, total, notas, updated_at)
        VALUES (%L, %L, %L, %L, %L, %L, %L, 'borrador', %L, 0, %L, %L, COALESCE(%L,''), now())
        ON CONFLICT (id) DO UPDATE SET
            proveedor_id   = EXCLUDED.proveedor_id,
            numero_factura = EXCLUDED.numero_factura,
            numero_control = EXCLUDED.numero_control,
            fecha          = EXCLUDED.fecha,
            periodo        = EXCLUDED.periodo,
            subtotal       = EXCLUDED.subtotal,
            iva_porcentaje = 0,
            iva_monto      = EXCLUDED.iva_monto,
            total          = EXCLUDED.total,
            notas          = EXCLUDED.notas,
            updated_at     = now()
        RETURNING row_to_json(inventario_facturas_compra)
    $sql$,
        v_schema, v_id,
        p_factura->>'empresa_id', p_factura->>'proveedor_id',
        COALESCE(p_factura->>'numero_factura',''), COALESCE(p_factura->>'numero_control',''),
        v_fecha, v_periodo,
        v_subtotal, v_iva_monto, v_total, p_factura->>'notas'
    ) INTO v_result;

    EXECUTE format('DELETE FROM %I.inventario_facturas_compra_items WHERE factura_id = %L', v_schema, v_id);

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        EXECUTE format($sql$
            INSERT INTO %I.inventario_facturas_compra_items
                (id, factura_id, producto_id, cantidad, costo_unitario, costo_total,
                 iva_alicuota, moneda, costo_moneda, tasa_dolar)
            VALUES (
                gen_random_uuid()::text, %L, %L,
                (%L)::numeric, (%L)::numeric, (%L)::numeric,
                COALESCE(NULLIF(%L,''), 'general_16'),
                COALESCE(NULLIF(%L,''), 'B'),
                CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END,
                CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END
            )
        $sql$,
            v_schema, v_id,
            v_item->>'producto_id',
            v_item->>'cantidad', v_item->>'costo_unitario', v_item->>'costo_total',
            v_item->>'iva_alicuota',
            v_item->>'moneda',
            v_item->>'costo_moneda', v_item->>'costo_moneda', v_item->>'costo_moneda',
            v_item->>'tasa_dolar',   v_item->>'tasa_dolar',   v_item->>'tasa_dolar'
        );
    END LOOP;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. A.3 — tenant_inventario_factura_get: devuelve campos moneda en items
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_get(
    p_user_id    uuid,
    p_factura_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema  text;
    v_factura jsonb;
    v_items   jsonb;
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
                'costo_total',    i.costo_total,
                'iva_alicuota',   i.iva_alicuota,
                'moneda',         i.moneda,
                'costo_moneda',   i.costo_moneda,
                'tasa_dolar',     i.tasa_dolar
            ) ORDER BY i.created_at ASC
        ), '[]'::jsonb)
        FROM %I.inventario_facturas_compra_items i
        JOIN %I.inventario_productos p ON p.id = i.producto_id
        WHERE i.factura_id = %L$q$,
        v_schema, v_schema, p_factura_id
    ) INTO v_items;

    RETURN v_factura || jsonb_build_object('items', v_items);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. A.3 — tenant_inventario_factura_confirmar: pasa campos moneda al movimiento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_confirmar(
    p_user_id    uuid,
    p_factura_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema         text;
    v_factura        record;
    v_item           record;
    v_existencia_act numeric(14,4);
    v_costo_prom     numeric(14,4);
    v_new_existencia numeric(14,4);
    v_new_costo_prom numeric(14,4);
    v_result         jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'SELECT * FROM %I.inventario_facturas_compra WHERE id = %L',
        v_schema, p_factura_id
    ) INTO v_factura;

    IF v_factura IS NULL THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
    IF v_factura.estado = 'confirmada' THEN RAISE EXCEPTION 'La factura ya está confirmada'; END IF;

    EXECUTE format(
        'UPDATE %I.inventario_facturas_compra SET estado=''confirmada'', confirmada_at=now(), updated_at=now() WHERE id=%L',
        v_schema, p_factura_id
    );

    FOR v_item IN
        EXECUTE format(
            'SELECT * FROM %I.inventario_facturas_compra_items WHERE factura_id = %L',
            v_schema, p_factura_id
        )
    LOOP
        EXECUTE format(
            'SELECT existencia_actual, costo_promedio FROM %I.inventario_productos WHERE id = %L',
            v_schema, v_item.producto_id
        ) INTO v_existencia_act, v_costo_prom;

        v_new_existencia := v_existencia_act + v_item.cantidad;

        IF v_existencia_act > 0 THEN
            v_new_costo_prom := (v_existencia_act * v_costo_prom + v_item.cantidad * v_item.costo_unitario)
                                / v_new_existencia;
        ELSE
            v_new_costo_prom := v_item.costo_unitario;
        END IF;

        EXECUTE format(
            'UPDATE %I.inventario_productos SET existencia_actual=%L, costo_promedio=%L, updated_at=now() WHERE id=%L',
            v_schema, v_new_existencia, v_new_costo_prom, v_item.producto_id
        );

        EXECUTE format($sql$
            INSERT INTO %I.inventario_movimientos
                (id, empresa_id, producto_id, tipo, fecha, periodo,
                 cantidad, costo_unitario, costo_total, saldo_cantidad,
                 moneda, costo_moneda, tasa_dolar, referencia, notas)
            VALUES (
                gen_random_uuid()::text,
                %L, %L, 'entrada_compra', %L, %L,
                %L, %L, %L, %L,
                %L, %L, %L, %L, ''
            )
        $sql$,
            v_schema,
            v_factura.empresa_id, v_item.producto_id,
            v_factura.fecha, v_factura.periodo,
            v_item.cantidad, v_item.costo_unitario,
            v_item.cantidad * v_item.costo_unitario, v_new_existencia,
            v_item.moneda, v_item.costo_moneda, v_item.tasa_dolar,
            COALESCE(v_factura.numero_factura, '')
        );
    END LOOP;

    EXECUTE format(
        'SELECT row_to_json(f)::jsonb FROM %I.inventario_facturas_compra f WHERE f.id = %L',
        v_schema, p_factura_id
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. A.4 — tenant_inventario_movimientos_save: persiste moneda/costo_moneda/tasa_dolar
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
    v_producto_id    text;
    v_tipo           text;
    v_fecha          date;
    v_periodo        text;
    v_cantidad       numeric(14,4);
    v_costo_unitario numeric(14,4);
    v_costo_total    numeric(14,4);
    v_saldo_cantidad numeric(14,4);
    v_existencia_act numeric(14,4);
    v_costo_prom     numeric(14,4);
    v_result         jsonb;
    v_is_entrada     boolean;
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

    v_is_entrada := v_tipo IN ('entrada_compra','entrada_produccion','devolucion_compra','ajuste_positivo');

    EXECUTE format(
        'SELECT existencia_actual, costo_promedio FROM %I.inventario_productos WHERE id = %L',
        v_schema, v_producto_id
    ) INTO v_existencia_act, v_costo_prom;

    IF v_is_entrada THEN
        IF (v_existencia_act + v_cantidad) > 0 THEN
            v_costo_prom := (v_existencia_act * v_costo_prom + v_cantidad * v_costo_unitario)
                            / (v_existencia_act + v_cantidad);
        END IF;
        v_saldo_cantidad := v_existencia_act + v_cantidad;
    ELSE
        v_saldo_cantidad := v_existencia_act - v_cantidad;
    END IF;

    EXECUTE format(
        'UPDATE %I.inventario_productos SET existencia_actual=%L, costo_promedio=%L, updated_at=now() WHERE id=%L',
        v_schema, v_saldo_cantidad, v_costo_prom, v_producto_id
    );

    EXECUTE format($sql$
        INSERT INTO %I.inventario_movimientos
            (id, empresa_id, producto_id, tipo, fecha, periodo, cantidad,
             costo_unitario, costo_total, saldo_cantidad,
             moneda, costo_moneda, tasa_dolar,
             referencia, notas, transformacion_id)
        VALUES (
            %L, %L, %L, %L, %L, %L, %L, %L, %L, %L,
            COALESCE(NULLIF(%L,''), 'B'),
            CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END,
            CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END,
            %L, %L, NULLIF(%L,'')
        )
        RETURNING row_to_json(inventario_movimientos)
    $sql$,
        v_schema,
        v_id, p_row->>'empresa_id', v_producto_id, v_tipo,
        v_fecha, v_periodo, v_cantidad, v_costo_unitario, v_costo_total, v_saldo_cantidad,
        p_row->>'moneda',
        p_row->>'costo_moneda', p_row->>'costo_moneda', p_row->>'costo_moneda',
        p_row->>'tasa_dolar',   p_row->>'tasa_dolar',   p_row->>'tasa_dolar',
        COALESCE(p_row->>'referencia', ''),
        COALESCE(p_row->>'notas', ''),
        p_row->>'transformacion_id'
    ) INTO v_result;

    RETURN v_result;
END;
$$;
