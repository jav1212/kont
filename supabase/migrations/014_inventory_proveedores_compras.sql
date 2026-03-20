-- =============================================================================
-- 014_inventory_proveedores_compras.sql
-- Adds suppliers (proveedores) and purchase invoices (facturas de compra)
-- tables to provision_tenant_schema and backfills existing tenant schemas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Update provision_tenant_schema to include new tables
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
    EXECUTE format('ALTER TABLE %I.companies         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.employees         ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_runs      ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.payroll_receipts  ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_productos              ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_transformaciones       ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_movimientos            ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_cierres                ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_proveedores            ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_facturas_compra        ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.inventario_facturas_compra_items  ENABLE ROW LEVEL SECURITY', v_schema);

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
    EXECUTE format(
        'CREATE POLICY tenant_owner ON %I.inventario_proveedores FOR ALL USING (auth.uid() = %L::uuid)',
        v_schema, p_user_id
    );
    EXECUTE format(
        'CREATE POLICY tenant_owner ON %I.inventario_facturas_compra FOR ALL USING (auth.uid() = %L::uuid)',
        v_schema, p_user_id
    );
    EXECUTE format(
        'CREATE POLICY tenant_owner ON %I.inventario_facturas_compra_items FOR ALL USING (auth.uid() = %L::uuid)',
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
-- 2. Add new tables to all EXISTING tenant schemas
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
    v_schema text;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;

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

        -- Enable RLS
        EXECUTE format('ALTER TABLE %I.inventario_proveedores           ENABLE ROW LEVEL SECURITY', v_schema);
        EXECUTE format('ALTER TABLE %I.inventario_facturas_compra       ENABLE ROW LEVEL SECURITY', v_schema);
        EXECUTE format('ALTER TABLE %I.inventario_facturas_compra_items ENABLE ROW LEVEL SECURITY', v_schema);

        -- Grant permissions
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC Functions for Proveedores and Facturas de Compra
-- ---------------------------------------------------------------------------

-- ── Proveedores ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tenant_inventario_proveedores_get(
    p_user_id    uuid,
    p_empresa_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.nombre), ''[]''::jsonb)
         FROM %I.inventario_proveedores p
         WHERE p.empresa_id = %L',
        v_schema, p_empresa_id
    ) INTO v_result;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_inventario_proveedores_upsert(
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
        INSERT INTO %I.inventario_proveedores
            (id, empresa_id, rif, nombre, contacto, telefono, email, direccion, notas, activo, updated_at)
        VALUES (
            %L, %L,
            COALESCE(%L, ''),
            %L,
            COALESCE(%L, ''),
            COALESCE(%L, ''),
            COALESCE(%L, ''),
            COALESCE(%L, ''),
            COALESCE(%L, ''),
            COALESCE((%L)::boolean, true),
            now()
        )
        ON CONFLICT (id) DO UPDATE SET
            rif        = EXCLUDED.rif,
            nombre     = EXCLUDED.nombre,
            contacto   = EXCLUDED.contacto,
            telefono   = EXCLUDED.telefono,
            email      = EXCLUDED.email,
            direccion  = EXCLUDED.direccion,
            notas      = EXCLUDED.notas,
            activo     = EXCLUDED.activo,
            updated_at = now()
        RETURNING row_to_json(inventario_proveedores)
    $sql$,
        v_schema,
        v_id,
        p_row->>'empresa_id',
        p_row->>'rif',
        p_row->>'nombre',
        p_row->>'contacto',
        p_row->>'telefono',
        p_row->>'email',
        p_row->>'direccion',
        p_row->>'notas',
        p_row->>'activo'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_inventario_proveedores_delete(
    p_user_id uuid,
    p_id      text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format('DELETE FROM %I.inventario_proveedores WHERE id = %L', v_schema, p_id);
END;
$$;

-- ── Facturas de Compra ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tenant_inventario_facturas_get(
    p_user_id    uuid,
    p_empresa_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
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

    -- Upsert factura header
    EXECUTE format($sql$
        INSERT INTO %I.inventario_facturas_compra
            (id, empresa_id, proveedor_id, numero_factura, fecha, periodo, estado,
             subtotal, iva_porcentaje, iva_monto, total, notas, updated_at)
        VALUES (
            %L, %L, %L, %L, %L, %L, 'borrador',
            %L, %L, %L, %L,
            COALESCE(%L, ''), now()
        )
        ON CONFLICT (id) DO UPDATE SET
            proveedor_id    = EXCLUDED.proveedor_id,
            numero_factura  = EXCLUDED.numero_factura,
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

    -- 1. Get factura and verify it is a draft
    EXECUTE format(
        'SELECT * FROM %I.inventario_facturas_compra WHERE id = %L',
        v_schema, p_factura_id
    ) INTO v_factura;

    IF v_factura IS NULL THEN
        RAISE EXCEPTION 'Factura no encontrada';
    END IF;

    IF v_factura.estado = 'confirmada' THEN
        RAISE EXCEPTION 'La factura ya está confirmada';
    END IF;

    -- 2. Mark factura as confirmed
    EXECUTE format(
        'UPDATE %I.inventario_facturas_compra
         SET estado = ''confirmada'', confirmada_at = now(), updated_at = now()
         WHERE id = %L',
        v_schema, p_factura_id
    );

    -- 3. Process each item
    FOR v_item IN
        EXECUTE format(
            'SELECT * FROM %I.inventario_facturas_compra_items WHERE factura_id = %L',
            v_schema, p_factura_id
        )
    LOOP
        -- Get current product state
        EXECUTE format(
            'SELECT existencia_actual, costo_promedio FROM %I.inventario_productos WHERE id = %L',
            v_schema, v_item.producto_id
        ) INTO v_existencia_act, v_costo_prom;

        v_new_existencia := v_existencia_act + v_item.cantidad;

        -- Weighted average cost
        IF v_existencia_act > 0 THEN
            v_new_costo_prom := (v_existencia_act * v_costo_prom + v_item.cantidad * v_item.costo_unitario)
                                / v_new_existencia;
        ELSE
            v_new_costo_prom := v_item.costo_unitario;
        END IF;

        -- Update product stock and cost
        EXECUTE format(
            'UPDATE %I.inventario_productos
             SET existencia_actual = %L,
                 costo_promedio    = %L,
                 updated_at        = now()
             WHERE id = %L',
            v_schema,
            v_new_existencia,
            v_new_costo_prom,
            v_item.producto_id
        );

        -- Insert movement
        EXECUTE format($sql$
            INSERT INTO %I.inventario_movimientos
                (id, empresa_id, producto_id, tipo, fecha, periodo, cantidad,
                 costo_unitario, costo_total, saldo_cantidad, referencia, notas)
            VALUES (
                gen_random_uuid()::text,
                %L, %L, 'entrada_compra', %L, %L, %L, %L, %L, %L, %L, ''
            )
        $sql$,
            v_schema,
            v_factura.empresa_id,
            v_item.producto_id,
            v_factura.fecha,
            v_factura.periodo,
            v_item.cantidad,
            v_item.costo_unitario,
            v_item.costo_total,
            v_new_existencia,
            COALESCE(v_factura.numero_factura, '')
        );
    END LOOP;

    -- 4. Return updated factura
    EXECUTE format(
        'SELECT row_to_json(f) FROM %I.inventario_facturas_compra f WHERE f.id = %L',
        v_schema, p_factura_id
    ) INTO v_result;

    RETURN v_result;
END;
$$;
