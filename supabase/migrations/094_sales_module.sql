-- =============================================================================
-- 094_sales_module.sql
--
-- Sales module — customers, sales invoices, line items, IGTF percepción.
--
-- Legal basis:
--   * Providencia 0071/2011 (current binding for invoice issuance) — required
--     fields on a legal sales invoice in Venezuela.
--   * G.O. Extraordinaria 6.687 (25/02/2022) + PA SNAT/2022/000013 — IGTF
--     reform; SPE designados como agentes de percepción 3% sobre pagos en
--     divisa/cripto sin mediación financiera.
--
-- Tables (per tenant):
--   * ventas_clientes              — customer master
--   * ventas_facturas              — invoice header
--   * ventas_facturas_items        — invoice line items
--
-- Helper column on companies:
--   * proximo_numero_factura_venta — counter for auto-assigning N° de factura
--
-- IGTF percepción (recibido al SPE):
--   * igtf_percepcion_aplica      — flag de la operación
--   * igtf_percepcion_concepto    — uno de 7: efectivo / especies /
--     nota_credito / compensacion / novacion / condonacion / cesion
--     (PA SNAT/2022/000013, 7 conceptos para Forma 99021)
--   * igtf_percepcion_porcentaje  — 3 (alícuota vigente)
--   * igtf_percepcion_base_divisa — monto recibido en USD/cripto
--   * igtf_percepcion_base_bs     — base × tasa_dolar
--   * igtf_percepcion_monto       — base_bs × pct/100 (server-resolved)
--
-- RPCs registered in `public`:
--   * tenant_ventas_clientes_get
--   * tenant_ventas_cliente_save
--   * tenant_ventas_cliente_delete
--   * tenant_ventas_facturas_get        (list)
--   * tenant_ventas_factura_get         (one + items)
--   * tenant_ventas_factura_save
--   * tenant_ventas_factura_confirmar
--   * tenant_ventas_factura_desconfirmar
--   * tenant_ventas_factura_delete
--   * tenant_ventas_igtf_quincena       (cross-period aggregate for Forma 99021)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables (per tenant) + counter column on companies
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r          record;
    v_schema   text;
    v_has_rif  boolean;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;

        -- Skip legacy tenant if companies table is missing rif column
        EXECUTE format($q$
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = %L AND table_name = 'companies' AND column_name = 'rif'
            )
        $q$, v_schema) INTO v_has_rif;
        IF NOT v_has_rif THEN CONTINUE; END IF;

        -- Counter for sales invoice number (auto-increment per company)
        EXECUTE format($s$
            ALTER TABLE %I.companies
                ADD COLUMN IF NOT EXISTS proximo_numero_factura_venta integer DEFAULT 1
        $s$, v_schema);

        -- Customers master
        EXECUTE format($s$
            CREATE TABLE IF NOT EXISTS %I.ventas_clientes (
                id           text PRIMARY KEY,
                empresa_id   text NOT NULL,
                rif          text NOT NULL,
                nombre       text NOT NULL,
                contacto     text DEFAULT '',
                telefono     text DEFAULT '',
                email        text DEFAULT '',
                direccion    text DEFAULT '',
                notas        text DEFAULT '',
                activo       boolean NOT NULL DEFAULT true,
                created_at   timestamptz NOT NULL DEFAULT now(),
                updated_at   timestamptz NOT NULL DEFAULT now()
            )
        $s$, v_schema);

        EXECUTE format($s$
            CREATE INDEX IF NOT EXISTS ix_ventas_clientes_empresa
                ON %I.ventas_clientes (empresa_id)
        $s$, v_schema);

        -- Sales invoice header
        EXECUTE format($s$
            CREATE TABLE IF NOT EXISTS %I.ventas_facturas (
                id                text PRIMARY KEY,
                empresa_id        text NOT NULL,
                cliente_id        text NOT NULL REFERENCES %I.ventas_clientes(id),
                numero_factura    text NOT NULL,
                numero_control    text DEFAULT '',
                fecha             date NOT NULL,
                periodo           text NOT NULL,
                periodo_manual    boolean NOT NULL DEFAULT false,
                fecha_vencimiento date,
                condiciones_pago  text DEFAULT 'contado',
                estado            text NOT NULL DEFAULT 'borrador'
                                  CHECK (estado IN ('borrador','confirmada','anulada')),
                subtotal          numeric(14,2) NOT NULL DEFAULT 0,
                iva_monto         numeric(14,2) NOT NULL DEFAULT 0,
                total             numeric(14,2) NOT NULL DEFAULT 0,
                notas             text DEFAULT '',
                tasa_dolar        numeric(14,4),
                tasa_decimales    smallint,
                descuento_tipo    text,
                descuento_valor   numeric(14,2) DEFAULT 0,
                descuento_monto   numeric(14,2) DEFAULT 0,
                recargo_tipo      text,
                recargo_valor     numeric(14,2) DEFAULT 0,
                recargo_monto     numeric(14,2) DEFAULT 0,
                igtf_percepcion_aplica       boolean DEFAULT false,
                igtf_percepcion_concepto     text,
                igtf_percepcion_porcentaje   numeric(5,2) DEFAULT 0,
                igtf_percepcion_base_divisa  numeric(14,4) DEFAULT 0,
                igtf_percepcion_base_bs      numeric(14,2) DEFAULT 0,
                igtf_percepcion_monto        numeric(14,2) DEFAULT 0,
                confirmada_at     timestamptz,
                created_at        timestamptz NOT NULL DEFAULT now(),
                updated_at        timestamptz NOT NULL DEFAULT now()
            )
        $s$, v_schema, v_schema);

        EXECUTE format($s$
            CREATE INDEX IF NOT EXISTS ix_ventas_facturas_empresa_periodo
                ON %I.ventas_facturas (empresa_id, periodo)
        $s$, v_schema);

        EXECUTE format($s$
            CREATE UNIQUE INDEX IF NOT EXISTS ux_ventas_facturas_empresa_numero
                ON %I.ventas_facturas (empresa_id, numero_factura)
                WHERE numero_factura <> ''
        $s$, v_schema);

        -- Sales invoice items
        EXECUTE format($s$
            CREATE TABLE IF NOT EXISTS %I.ventas_facturas_items (
                id                text PRIMARY KEY,
                factura_id        text NOT NULL REFERENCES %I.ventas_facturas(id) ON DELETE CASCADE,
                producto_id       text REFERENCES %I.inventario_productos(id),
                descripcion       text NOT NULL,
                cantidad          numeric(14,4) NOT NULL DEFAULT 1,
                precio_unitario   numeric(14,2) NOT NULL DEFAULT 0,
                total_linea       numeric(14,2) NOT NULL DEFAULT 0,
                iva_alicuota      text NOT NULL DEFAULT 'general_16'
                                  CHECK (iva_alicuota IN ('exenta','reducida_8','general_16')),
                moneda            text NOT NULL DEFAULT 'B' CHECK (moneda IN ('B','D')),
                precio_moneda     numeric(14,4),
                tasa_dolar        numeric(14,4),
                descuento_tipo    text,
                descuento_valor   numeric(14,2) DEFAULT 0,
                descuento_monto   numeric(14,2) DEFAULT 0,
                recargo_tipo      text,
                recargo_valor     numeric(14,2) DEFAULT 0,
                recargo_monto     numeric(14,2) DEFAULT 0,
                base_iva          numeric(14,2),
                iva_incluido      boolean NOT NULL DEFAULT false,
                created_at        timestamptz NOT NULL DEFAULT now()
            )
        $s$, v_schema, v_schema, v_schema);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. tenant_ventas_clientes_get — list customers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_ventas_clientes_get(
    p_user_id uuid, p_empresa_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        $q$SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id, 'empresa_id', empresa_id, 'rif', rif, 'nombre', nombre,
                'contacto', contacto, 'telefono', telefono, 'email', email,
                'direccion', direccion, 'notas', notas, 'activo', activo,
                'created_at', created_at, 'updated_at', updated_at
            ) ORDER BY nombre ASC
        ), '[]'::jsonb)
        FROM %I.ventas_clientes WHERE empresa_id = %L$q$,
        v_schema, p_empresa_id
    ) INTO v_result;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. tenant_ventas_cliente_save — upsert customer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_ventas_cliente_save(
    p_user_id uuid, p_cliente jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_id     text;
    v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    v_id     := COALESCE(NULLIF(p_cliente->>'id', ''), gen_random_uuid()::text);

    EXECUTE format($sql$
        INSERT INTO %I.ventas_clientes
            (id, empresa_id, rif, nombre, contacto, telefono, email,
             direccion, notas, activo, updated_at)
        VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L,
                COALESCE(NULLIF(%L,'')::boolean, true), now())
        ON CONFLICT (id) DO UPDATE SET
            rif = EXCLUDED.rif, nombre = EXCLUDED.nombre,
            contacto = EXCLUDED.contacto, telefono = EXCLUDED.telefono,
            email = EXCLUDED.email, direccion = EXCLUDED.direccion,
            notas = EXCLUDED.notas, activo = EXCLUDED.activo,
            updated_at = now()
        RETURNING row_to_json(ventas_clientes)
    $sql$,
        v_schema, v_id,
        p_cliente->>'empresa_id', p_cliente->>'rif', p_cliente->>'nombre',
        COALESCE(p_cliente->>'contacto', ''), COALESCE(p_cliente->>'telefono', ''),
        COALESCE(p_cliente->>'email', ''), COALESCE(p_cliente->>'direccion', ''),
        COALESCE(p_cliente->>'notas', ''), p_cliente->>'activo'
    ) INTO v_result;
    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. tenant_ventas_cliente_delete — soft delete if has invoices, else hard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_ventas_cliente_delete(
    p_user_id uuid, p_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_refs int;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'SELECT COUNT(*) FROM %I.ventas_facturas WHERE cliente_id = %L',
        v_schema, p_id
    ) INTO v_refs;
    IF v_refs > 0 THEN
        EXECUTE format(
            'UPDATE %I.ventas_clientes SET activo=false, updated_at=now() WHERE id=%L',
            v_schema, p_id
        );
        RETURN jsonb_build_object('soft_deleted', true);
    END IF;
    EXECUTE format('DELETE FROM %I.ventas_clientes WHERE id=%L', v_schema, p_id);
    RETURN jsonb_build_object('soft_deleted', false);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. tenant_ventas_factura_save — upsert invoice + items
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_ventas_factura_save(
    p_user_id uuid, p_factura jsonb, p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema             text;
    v_id                 text;
    v_empresa_id         text;
    v_fecha              date;
    v_periodo            text;
    v_periodo_manual     boolean;
    v_subtotal           numeric(14,2);
    v_iva_monto          numeric(14,2);
    v_total              numeric(14,2);
    v_numero_factura     text;
    v_proximo            integer;
    v_igtf_aplica        boolean;
    v_igtf_concepto      text;
    v_igtf_pct           numeric(5,2);
    v_igtf_base_divisa   numeric(14,4);
    v_igtf_base_bs       numeric(14,2);
    v_igtf_monto         numeric(14,2);
    v_item               jsonb;
    v_estado             text;
    v_result             jsonb;
BEGIN
    v_schema         := public.tenant_get_schema(p_user_id);
    v_id             := COALESCE(NULLIF(p_factura->>'id', ''), gen_random_uuid()::text);
    v_empresa_id     := p_factura->>'empresa_id';
    v_fecha          := COALESCE(NULLIF(p_factura->>'fecha', ''), CURRENT_DATE::text)::date;
    v_periodo_manual := COALESCE((NULLIF(p_factura->>'periodo_manual',''))::boolean, false);

    IF v_periodo_manual AND NULLIF(p_factura->>'periodo','') IS NOT NULL THEN
        v_periodo := p_factura->>'periodo';
    ELSE
        v_periodo := to_char(v_fecha, 'YYYY-MM');
    END IF;

    -- Block edits to confirmed invoices
    IF NULLIF(p_factura->>'id', '') IS NOT NULL THEN
        EXECUTE format(
            'SELECT estado FROM %I.ventas_facturas WHERE id = %L',
            v_schema, v_id
        ) INTO v_estado;
        IF v_estado = 'confirmada' THEN
            RAISE EXCEPTION 'No se puede modificar una factura confirmada';
        END IF;
    END IF;

    -- Auto-assign N° factura on first save when blank
    v_numero_factura := COALESCE(NULLIF(p_factura->>'numero_factura',''), '');
    IF v_numero_factura = '' THEN
        EXECUTE format(
            'SELECT COALESCE(proximo_numero_factura_venta, 1) FROM %I.companies WHERE id=%L FOR UPDATE',
            v_schema, v_empresa_id
        ) INTO v_proximo;
        v_numero_factura := LPAD(v_proximo::text, 8, '0');
        EXECUTE format(
            'UPDATE %I.companies SET proximo_numero_factura_venta = %L WHERE id=%L',
            v_schema, v_proximo + 1, v_empresa_id
        );
    END IF;

    -- Subtotal = Σ base_iva por línea
    SELECT COALESCE(SUM(COALESCE((item->>'base_iva')::numeric, (item->>'total_linea')::numeric, 0)), 0)
    INTO v_subtotal
    FROM jsonb_array_elements(p_items) AS item;

    SELECT ROUND(COALESCE(SUM(
        CASE COALESCE(item->>'iva_alicuota', 'general_16')
            WHEN 'reducida_8' THEN COALESCE((item->>'base_iva')::numeric, (item->>'total_linea')::numeric, 0) * 8 / 100
            WHEN 'general_16' THEN COALESCE((item->>'base_iva')::numeric, (item->>'total_linea')::numeric, 0) * 16 / 100
            ELSE 0
        END
    ), 0), 2) INTO v_iva_monto
    FROM jsonb_array_elements(p_items) AS item;

    -- IGTF percepción
    v_igtf_aplica      := COALESCE((NULLIF(p_factura->>'igtf_percepcion_aplica',''))::boolean, false);
    v_igtf_concepto    := NULLIF(p_factura->>'igtf_percepcion_concepto','');
    v_igtf_pct         := COALESCE(NULLIF(p_factura->>'igtf_percepcion_porcentaje','')::numeric, 0);
    v_igtf_base_divisa := COALESCE(NULLIF(p_factura->>'igtf_percepcion_base_divisa','')::numeric, 0);
    v_igtf_base_bs     := COALESCE(NULLIF(p_factura->>'igtf_percepcion_base_bs','')::numeric, 0);
    IF v_igtf_aplica AND v_igtf_pct > 0 AND v_igtf_base_bs > 0 THEN
        v_igtf_monto := ROUND(v_igtf_base_bs * v_igtf_pct / 100, 2);
    ELSE
        v_igtf_aplica       := false;
        v_igtf_concepto     := NULL;
        v_igtf_pct          := 0;
        v_igtf_base_divisa  := 0;
        v_igtf_base_bs      := 0;
        v_igtf_monto        := 0;
    END IF;

    -- Total a cobrar = subtotal + iva + IGTF percepción (carga al cliente)
    v_total := v_subtotal + v_iva_monto + v_igtf_monto;

    EXECUTE format($sql$
        INSERT INTO %I.ventas_facturas
            (id, empresa_id, cliente_id, numero_factura, numero_control,
             fecha, periodo, periodo_manual, fecha_vencimiento, condiciones_pago, estado,
             subtotal, iva_monto, total, notas,
             tasa_dolar, tasa_decimales,
             descuento_tipo, descuento_valor, descuento_monto,
             recargo_tipo, recargo_valor, recargo_monto,
             igtf_percepcion_aplica, igtf_percepcion_concepto, igtf_percepcion_porcentaje,
             igtf_percepcion_base_divisa, igtf_percepcion_base_bs, igtf_percepcion_monto,
             updated_at)
        VALUES (
            %L, %L, %L, %L, COALESCE(%L,''),
            %L, %L, %L,
            CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::date END,
            COALESCE(NULLIF(%L,''), 'contado'),
            'borrador',
            %L, %L, %L, COALESCE(%L,''),
            CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END,
            CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::smallint END,
            NULLIF(%L,''), COALESCE(NULLIF(%L,'')::numeric, 0), COALESCE(NULLIF(%L,'')::numeric, 0),
            NULLIF(%L,''), COALESCE(NULLIF(%L,'')::numeric, 0), COALESCE(NULLIF(%L,'')::numeric, 0),
            %L, %L, %L, %L, %L, %L,
            now()
        )
        ON CONFLICT (id) DO UPDATE SET
            cliente_id      = EXCLUDED.cliente_id,
            numero_factura  = EXCLUDED.numero_factura,
            numero_control  = EXCLUDED.numero_control,
            fecha           = EXCLUDED.fecha,
            periodo         = EXCLUDED.periodo,
            periodo_manual  = EXCLUDED.periodo_manual,
            fecha_vencimiento = EXCLUDED.fecha_vencimiento,
            condiciones_pago  = EXCLUDED.condiciones_pago,
            subtotal        = EXCLUDED.subtotal,
            iva_monto       = EXCLUDED.iva_monto,
            total           = EXCLUDED.total,
            notas           = EXCLUDED.notas,
            tasa_dolar      = EXCLUDED.tasa_dolar,
            tasa_decimales  = EXCLUDED.tasa_decimales,
            descuento_tipo  = EXCLUDED.descuento_tipo,
            descuento_valor = EXCLUDED.descuento_valor,
            descuento_monto = EXCLUDED.descuento_monto,
            recargo_tipo    = EXCLUDED.recargo_tipo,
            recargo_valor   = EXCLUDED.recargo_valor,
            recargo_monto   = EXCLUDED.recargo_monto,
            igtf_percepcion_aplica       = EXCLUDED.igtf_percepcion_aplica,
            igtf_percepcion_concepto     = EXCLUDED.igtf_percepcion_concepto,
            igtf_percepcion_porcentaje   = EXCLUDED.igtf_percepcion_porcentaje,
            igtf_percepcion_base_divisa  = EXCLUDED.igtf_percepcion_base_divisa,
            igtf_percepcion_base_bs      = EXCLUDED.igtf_percepcion_base_bs,
            igtf_percepcion_monto        = EXCLUDED.igtf_percepcion_monto,
            updated_at      = now()
        RETURNING row_to_json(ventas_facturas)
    $sql$,
        v_schema,
        v_id, v_empresa_id, p_factura->>'cliente_id', v_numero_factura,
        p_factura->>'numero_control',
        v_fecha, v_periodo, v_periodo_manual,
        p_factura->>'fecha_vencimiento', p_factura->>'fecha_vencimiento', p_factura->>'fecha_vencimiento',
        p_factura->>'condiciones_pago',
        v_subtotal, v_iva_monto, v_total, p_factura->>'notas',
        p_factura->>'tasa_dolar',     p_factura->>'tasa_dolar',     p_factura->>'tasa_dolar',
        p_factura->>'tasa_decimales', p_factura->>'tasa_decimales', p_factura->>'tasa_decimales',
        p_factura->>'descuento_tipo', p_factura->>'descuento_valor', p_factura->>'descuento_monto',
        p_factura->>'recargo_tipo',   p_factura->>'recargo_valor',   p_factura->>'recargo_monto',
        v_igtf_aplica, v_igtf_concepto, v_igtf_pct, v_igtf_base_divisa, v_igtf_base_bs, v_igtf_monto
    ) INTO v_result;

    -- Replace items
    EXECUTE format('DELETE FROM %I.ventas_facturas_items WHERE factura_id = %L', v_schema, v_id);
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        EXECUTE format($sql$
            INSERT INTO %I.ventas_facturas_items
                (id, factura_id, producto_id, descripcion, cantidad, precio_unitario, total_linea,
                 iva_alicuota, moneda, precio_moneda, tasa_dolar,
                 descuento_tipo, descuento_valor, descuento_monto,
                 recargo_tipo, recargo_valor, recargo_monto,
                 base_iva, iva_incluido)
            VALUES (
                gen_random_uuid()::text, %L,
                NULLIF(%L,''), %L,
                (%L)::numeric, (%L)::numeric, (%L)::numeric,
                COALESCE(NULLIF(%L,''), 'general_16'),
                COALESCE(NULLIF(%L,''), 'B'),
                CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END,
                CASE WHEN %L IS NULL OR %L = '' THEN NULL ELSE (%L)::numeric END,
                NULLIF(%L,''), COALESCE(NULLIF(%L,'')::numeric, 0), COALESCE(NULLIF(%L,'')::numeric, 0),
                NULLIF(%L,''), COALESCE(NULLIF(%L,'')::numeric, 0), COALESCE(NULLIF(%L,'')::numeric, 0),
                COALESCE(NULLIF(%L,'')::numeric, (%L)::numeric),
                COALESCE((NULLIF(%L,''))::boolean, false)
            )
        $sql$,
            v_schema, v_id,
            v_item->>'producto_id', COALESCE(v_item->>'descripcion', ''),
            v_item->>'cantidad', v_item->>'precio_unitario', v_item->>'total_linea',
            v_item->>'iva_alicuota',
            v_item->>'moneda',
            v_item->>'precio_moneda', v_item->>'precio_moneda', v_item->>'precio_moneda',
            v_item->>'tasa_dolar',    v_item->>'tasa_dolar',    v_item->>'tasa_dolar',
            v_item->>'descuento_tipo', v_item->>'descuento_valor', v_item->>'descuento_monto',
            v_item->>'recargo_tipo',   v_item->>'recargo_valor',   v_item->>'recargo_monto',
            v_item->>'base_iva', v_item->>'total_linea',
            v_item->>'iva_incluido'
        );
    END LOOP;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. tenant_ventas_factura_get — single invoice with items + customer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_ventas_factura_get(
    p_user_id uuid, p_factura_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_factura jsonb; v_items jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        $q$SELECT jsonb_build_object(
            'id', f.id, 'empresa_id', f.empresa_id,
            'cliente_id', f.cliente_id, 'cliente_nombre', cl.nombre, 'cliente_rif', cl.rif,
            'cliente_direccion', cl.direccion,
            'numero_factura', f.numero_factura, 'numero_control', f.numero_control,
            'fecha', f.fecha, 'periodo', f.periodo, 'periodo_manual', f.periodo_manual,
            'fecha_vencimiento', f.fecha_vencimiento, 'condiciones_pago', f.condiciones_pago,
            'estado', f.estado,
            'subtotal', f.subtotal, 'iva_monto', f.iva_monto, 'total', f.total, 'notas', f.notas,
            'tasa_dolar', f.tasa_dolar, 'tasa_decimales', f.tasa_decimales,
            'descuento_tipo', f.descuento_tipo, 'descuento_valor', f.descuento_valor, 'descuento_monto', f.descuento_monto,
            'recargo_tipo', f.recargo_tipo, 'recargo_valor', f.recargo_valor, 'recargo_monto', f.recargo_monto,
            'igtf_percepcion_aplica', f.igtf_percepcion_aplica,
            'igtf_percepcion_concepto', f.igtf_percepcion_concepto,
            'igtf_percepcion_porcentaje', f.igtf_percepcion_porcentaje,
            'igtf_percepcion_base_divisa', f.igtf_percepcion_base_divisa,
            'igtf_percepcion_base_bs', f.igtf_percepcion_base_bs,
            'igtf_percepcion_monto', f.igtf_percepcion_monto,
            'confirmada_at', f.confirmada_at,
            'created_at', f.created_at, 'updated_at', f.updated_at
        )
        FROM %I.ventas_facturas f
        JOIN %I.ventas_clientes cl ON cl.id = f.cliente_id
        WHERE f.id = %L$q$,
        v_schema, v_schema, p_factura_id
    ) INTO v_factura;

    EXECUTE format(
        $q$SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', i.id, 'factura_id', i.factura_id, 'producto_id', i.producto_id,
                'producto_nombre', p.nombre,
                'descripcion', i.descripcion,
                'cantidad', i.cantidad, 'precio_unitario', i.precio_unitario, 'total_linea', i.total_linea,
                'iva_alicuota', i.iva_alicuota, 'moneda', i.moneda,
                'precio_moneda', i.precio_moneda, 'tasa_dolar', i.tasa_dolar,
                'descuento_tipo', i.descuento_tipo, 'descuento_valor', i.descuento_valor, 'descuento_monto', i.descuento_monto,
                'recargo_tipo', i.recargo_tipo, 'recargo_valor', i.recargo_valor, 'recargo_monto', i.recargo_monto,
                'base_iva', i.base_iva, 'iva_incluido', i.iva_incluido
            ) ORDER BY i.created_at ASC
        ), '[]'::jsonb)
        FROM %I.ventas_facturas_items i
        LEFT JOIN %I.inventario_productos p ON p.id = i.producto_id
        WHERE i.factura_id = %L$q$,
        v_schema, v_schema, p_factura_id
    ) INTO v_items;

    RETURN v_factura || jsonb_build_object('items', v_items);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. tenant_ventas_facturas_get — list (no items)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_ventas_facturas_get(
    p_user_id uuid, p_empresa_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        $q$SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', f.id, 'empresa_id', f.empresa_id,
                'cliente_id', f.cliente_id, 'cliente_nombre', cl.nombre, 'cliente_rif', cl.rif,
                'numero_factura', f.numero_factura, 'numero_control', f.numero_control,
                'fecha', f.fecha, 'periodo', f.periodo, 'periodo_manual', f.periodo_manual,
                'fecha_vencimiento', f.fecha_vencimiento, 'condiciones_pago', f.condiciones_pago,
                'estado', f.estado,
                'subtotal', f.subtotal, 'iva_monto', f.iva_monto, 'total', f.total, 'notas', f.notas,
                'tasa_dolar', f.tasa_dolar, 'tasa_decimales', f.tasa_decimales,
                'descuento_tipo', f.descuento_tipo, 'descuento_valor', f.descuento_valor, 'descuento_monto', f.descuento_monto,
                'recargo_tipo', f.recargo_tipo, 'recargo_valor', f.recargo_valor, 'recargo_monto', f.recargo_monto,
                'igtf_percepcion_aplica', f.igtf_percepcion_aplica,
                'igtf_percepcion_concepto', f.igtf_percepcion_concepto,
                'igtf_percepcion_porcentaje', f.igtf_percepcion_porcentaje,
                'igtf_percepcion_base_divisa', f.igtf_percepcion_base_divisa,
                'igtf_percepcion_base_bs', f.igtf_percepcion_base_bs,
                'igtf_percepcion_monto', f.igtf_percepcion_monto,
                'confirmada_at', f.confirmada_at,
                'created_at', f.created_at, 'updated_at', f.updated_at
            ) ORDER BY f.fecha DESC, f.created_at DESC
        ), '[]'::jsonb)
        FROM %I.ventas_facturas f
        JOIN %I.ventas_clientes cl ON cl.id = f.cliente_id
        WHERE f.empresa_id = %L$q$,
        v_schema, v_schema, p_empresa_id
    ) INTO v_result;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. tenant_ventas_factura_confirmar
-- ---------------------------------------------------------------------------
-- v1: only flips estado + confirmada_at. Inventory movements integration
-- (when items are products) lives in a follow-up sprint.
CREATE OR REPLACE FUNCTION public.tenant_ventas_factura_confirmar(
    p_user_id uuid, p_factura_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_estado text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'SELECT estado FROM %I.ventas_facturas WHERE id = %L',
        v_schema, p_factura_id
    ) INTO v_estado;
    IF v_estado IS NULL THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
    IF v_estado = 'confirmada' THEN RAISE EXCEPTION 'La factura ya está confirmada'; END IF;
    IF v_estado = 'anulada' THEN RAISE EXCEPTION 'La factura está anulada — no se puede confirmar'; END IF;

    EXECUTE format(
        'UPDATE %I.ventas_facturas SET estado=''confirmada'', confirmada_at=now(), updated_at=now() WHERE id=%L',
        v_schema, p_factura_id
    );
    EXECUTE format(
        'SELECT row_to_json(f)::jsonb FROM %I.ventas_facturas f WHERE id=%L',
        v_schema, p_factura_id
    ) INTO v_result;
    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. tenant_ventas_factura_desconfirmar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_ventas_factura_desconfirmar(
    p_user_id uuid, p_factura_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_estado text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'SELECT estado FROM %I.ventas_facturas WHERE id = %L',
        v_schema, p_factura_id
    ) INTO v_estado;
    IF v_estado IS NULL THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
    IF v_estado <> 'confirmada' THEN RAISE EXCEPTION 'La factura no está confirmada'; END IF;

    EXECUTE format(
        'UPDATE %I.ventas_facturas SET estado=''borrador'', confirmada_at=NULL, updated_at=now() WHERE id=%L',
        v_schema, p_factura_id
    );
    EXECUTE format(
        'SELECT row_to_json(f)::jsonb FROM %I.ventas_facturas f WHERE id=%L',
        v_schema, p_factura_id
    ) INTO v_result;
    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. tenant_ventas_factura_delete — only drafts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_ventas_factura_delete(
    p_user_id uuid, p_factura_id text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_estado text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'SELECT estado FROM %I.ventas_facturas WHERE id = %L',
        v_schema, p_factura_id
    ) INTO v_estado;
    IF v_estado IS NULL THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
    IF v_estado = 'confirmada' THEN
        RAISE EXCEPTION 'No se puede eliminar una factura confirmada — desconfirma primero';
    END IF;
    EXECUTE format('DELETE FROM %I.ventas_facturas WHERE id=%L', v_schema, p_factura_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. tenant_ventas_igtf_quincena
-- ---------------------------------------------------------------------------
-- Aggregates IGTF percibido por concepto en una quincena (1ª: días 1-15;
-- 2ª: 16 al último). Output: 7 conceptos × { count, base_bs }, listo para
-- llenar el portal SENIAT con la Forma 99021. Si la empresa también
-- percibió IGTF por compras en USD a SPE, el contador suma manualmente.
CREATE OR REPLACE FUNCTION public.tenant_ventas_igtf_quincena(
    p_user_id    uuid,
    p_empresa_id text,
    p_year       integer,
    p_month      integer,
    p_quincena   integer  -- 1 (días 1-15) o 2 (días 16-fin)
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema   text;
    v_rif      text;
    v_periodo  text;
    v_start    date;
    v_end      date;
    v_rows     jsonb;
    v_total    numeric(14,2);
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    IF p_quincena NOT IN (1, 2) THEN
        RAISE EXCEPTION 'Quincena inválida (esperado 1 o 2): %', p_quincena;
    END IF;
    IF p_month < 1 OR p_month > 12 THEN
        RAISE EXCEPTION 'Mes inválido (1-12): %', p_month;
    END IF;

    v_periodo := to_char(make_date(p_year, p_month, 1), 'YYYY-MM');
    IF p_quincena = 1 THEN
        v_start := make_date(p_year, p_month, 1);
        v_end   := make_date(p_year, p_month, 15);
    ELSE
        v_start := make_date(p_year, p_month, 16);
        v_end   := (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date;
    END IF;

    EXECUTE format('SELECT rif FROM %I.companies WHERE id=%L', v_schema, p_empresa_id) INTO v_rif;
    IF v_rif IS NULL OR v_rif = '' THEN
        RAISE EXCEPTION 'La empresa no tiene RIF configurado — requerido por SENIAT';
    END IF;

    EXECUTE format($q$
        SELECT
            COALESCE(jsonb_object_agg(concepto, jsonb_build_object(
                'cantidad_operaciones', cant,
                'base_imponible_bs',    base_bs,
                'monto_igtf',           monto_igtf
            )), '{}'::jsonb),
            COALESCE(SUM(monto_igtf), 0)
        FROM (
            SELECT
                igtf_percepcion_concepto AS concepto,
                COUNT(*)                 AS cant,
                SUM(igtf_percepcion_base_bs)::numeric(14,2) AS base_bs,
                SUM(igtf_percepcion_monto)::numeric(14,2)   AS monto_igtf
            FROM %I.ventas_facturas
            WHERE empresa_id = %L
              AND estado = 'confirmada'
              AND igtf_percepcion_aplica = true
              AND igtf_percepcion_concepto IS NOT NULL
              AND fecha BETWEEN %L AND %L
            GROUP BY igtf_percepcion_concepto
        ) agg
    $q$, v_schema, p_empresa_id, v_start, v_end) INTO v_rows, v_total;

    RETURN jsonb_build_object(
        'agente_rif',      v_rif,
        'periodo',         v_periodo,
        'quincena',        p_quincena,
        'fecha_inicio',    v_start,
        'fecha_fin',       v_end,
        'conceptos',       v_rows,
        'total_igtf',      v_total
    );
END;
$$;
