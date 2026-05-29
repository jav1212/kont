-- =============================================================================
-- 112_reconcile_tenant_schema_full.sql
--
-- PROBLEMA
-- --------
-- public.provision_tenant_schema solo creaba las ~10 tablas core de nomina y,
-- ademas, fue regresada por migraciones posteriores (102/104, bono_guerra y
-- bonificaciones) que reusaron una definicion VIEJA de `companies`, perdiendo la
-- correccion de 084 (taxpayer_type, contact_email). Las tablas de inventario,
-- contabilidad, ventas, documentos e historial salarial NUNCA se agregaron a la
-- funcion de provisioning: se anadieron a los tenants existentes via migraciones
-- puntuales que recorrian los esquemas vigentes en su momento.
--
-- Resultado: todo tenant creado despues del ultimo backfill (desde 2026-05-08)
-- nace con un esquema incompleto: sin taxpayer_type (rompe tenant_company_save),
-- sin suscripciones y sin 21 tablas de modulos.
--
-- SOLUCION
-- --------
-- 1. Nueva funcion idempotente public.reconcile_tenant_schema(uuid) que crea o
--    completa el esquema COMPLETO y actual de un tenant (DDL extraido del esquema
--    sano de referencia). Segura de llamar multiples veces.
-- 2. provision_tenant_schema delega en reconcile_tenant_schema -> los registros
--    nuevos nacen completos.
-- 3. Se ejecuta reconcile para TODOS los tenants existentes (sana los rotos,
--    no-op para los sanos).
--
-- Anterior: 111_inventory_purchase_impuestos.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- reconcile_tenant_schema: crea/completa el esquema completo de un tenant
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_tenant_schema(
    p_user_id         uuid,
    p_reference_schema text DEFAULT NULL  -- esquema de tenant COMPLETO usado para
                                          -- copiar columnas faltantes en tablas que
                                          -- ya existian (drift intra-tabla). NULL en
                                          -- el alta de un tenant nuevo (CREATE TABLE
                                          -- ya crea todo completo).
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    v_schema text;
    r        record;
    col      record;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    -- Esquema + uso
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon', v_schema);

    -- A partir de aqui todo el DDL es sin prefijo de esquema; se resuelve dentro
    -- de v_schema gracias al search_path local. La clausula SET search_path = public
    -- de la funcion restaura el valor original al salir (sin fugas a la transaccion).
    PERFORM set_config('search_path', quote_ident(v_schema) || ', public', true);

    -- ===== TABLAS (orden por dependencias de FK) ============================

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS companies (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        owner_id text NOT NULL,
        name text NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        rif text,
        config_fiscal jsonb NOT NULL DEFAULT '{}'::jsonb,
        phone text,
        address text,
        logo_url text,
        payroll_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
        show_logo_in_pdf boolean NOT NULL DEFAULT false,
        sector text,
        inventory_config jsonb NOT NULL DEFAULT '{}'::jsonb,
        taxpayer_type text NOT NULL DEFAULT 'ordinario'::text,
        contact_email text,
        proximo_numero_factura_venta integer DEFAULT 1,
        PRIMARY KEY (id),
        CHECK ((taxpayer_type = ANY (ARRAY['ordinario'::text, 'especial'::text])))
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS employees (
        id text NOT NULL,
        company_id text NOT NULL,
        cedula text NOT NULL,
        nombre text NOT NULL,
        cargo text NOT NULL DEFAULT ''::text,
        salario_mensual numeric(14,2) NOT NULL DEFAULT 0,
        estado text NOT NULL DEFAULT 'activo'::text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        fecha_ingreso date,
        moneda text NOT NULL DEFAULT 'VES'::text,
        porcentaje_islr numeric(5,2) NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS employee_salary_history (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        employee_cedula text NOT NULL,
        company_id text NOT NULL,
        salario_mensual numeric(12,2) NOT NULL,
        moneda character varying(3) NOT NULL DEFAULT 'VES'::character varying,
        fecha_desde date NOT NULL DEFAULT CURRENT_DATE,
        created_at timestamp with time zone DEFAULT now(),
        PRIMARY KEY (id)
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS payroll_runs (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        company_id text NOT NULL,
        period_start date NOT NULL,
        period_end date NOT NULL,
        exchange_rate numeric(14,4) NOT NULL,
        status text NOT NULL DEFAULT 'confirmed'::text,
        confirmed_at timestamp with time zone NOT NULL DEFAULT now(),
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS payroll_receipts (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        run_id text NOT NULL,
        company_id text NOT NULL,
        employee_id text NOT NULL,
        employee_cedula text NOT NULL,
        employee_nombre text NOT NULL,
        employee_cargo text NOT NULL DEFAULT ''::text,
        monthly_salary numeric(14,2) NOT NULL DEFAULT 0,
        total_earnings numeric(14,2) NOT NULL DEFAULT 0,
        total_deductions numeric(14,2) NOT NULL DEFAULT 0,
        total_bonuses numeric(14,2) NOT NULL DEFAULT 0,
        net_pay numeric(14,2) NOT NULL DEFAULT 0,
        calculation_data jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS cesta_ticket_runs (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        company_id text NOT NULL,
        period_start date NOT NULL,
        period_end date NOT NULL,
        monto_usd numeric(14,2) NOT NULL,
        exchange_rate numeric(14,4) NOT NULL,
        status text NOT NULL DEFAULT 'confirmed'::text,
        confirmed_at timestamp with time zone NOT NULL DEFAULT now(),
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS cesta_ticket_receipts (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        run_id text NOT NULL,
        company_id text NOT NULL,
        employee_id text NOT NULL,
        employee_cedula text NOT NULL,
        employee_nombre text NOT NULL,
        employee_cargo text NOT NULL DEFAULT ''::text,
        monto_usd numeric(14,2) NOT NULL,
        monto_ves numeric(14,2) NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY (run_id) REFERENCES cesta_ticket_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id)
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS bono_guerra_runs (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        company_id text NOT NULL,
        period_start date NOT NULL,
        period_end date NOT NULL,
        monto_usd numeric(14,2) NOT NULL,
        exchange_rate numeric(14,4) NOT NULL,
        status text NOT NULL DEFAULT 'confirmed'::text,
        confirmed_at timestamp with time zone NOT NULL DEFAULT now(),
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS bono_guerra_receipts (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        run_id text NOT NULL,
        company_id text NOT NULL,
        employee_id text NOT NULL,
        employee_cedula text NOT NULL,
        employee_nombre text NOT NULL,
        employee_cargo text NOT NULL DEFAULT ''::text,
        monto_usd numeric(14,2) NOT NULL,
        monto_ves numeric(14,2) NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY (run_id) REFERENCES bono_guerra_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id)
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS bonificaciones_runs (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        company_id text NOT NULL,
        period_start date NOT NULL,
        period_end date NOT NULL,
        exchange_rate numeric(14,4) NOT NULL,
        total_ves numeric(14,2) NOT NULL DEFAULT 0,
        employee_count integer NOT NULL DEFAULT 0,
        line_count integer NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'confirmed'::text,
        confirmed_at timestamp with time zone NOT NULL DEFAULT now(),
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS bonificaciones_receipts (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        run_id text NOT NULL,
        company_id text NOT NULL,
        employee_id text NOT NULL,
        employee_cedula text NOT NULL,
        employee_nombre text NOT NULL,
        employee_cargo text NOT NULL DEFAULT ''::text,
        total_ves numeric(14,2) NOT NULL DEFAULT 0,
        bonus_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (run_id) REFERENCES bonificaciones_runs(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS accounting_periods (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        company_id text NOT NULL,
        name text NOT NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        status text NOT NULL DEFAULT 'open'::text,
        closed_at timestamp with time zone,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text]))),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS accounting_charts (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        company_id text NOT NULL,
        name text NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS accounting_accounts (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        company_id text NOT NULL,
        code text NOT NULL,
        name text NOT NULL,
        type text NOT NULL,
        parent_code text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        chart_id text,
        is_group boolean NOT NULL DEFAULT false,
        saldo_inicial numeric(18,2) NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        UNIQUE (company_id, code),
        CHECK ((type = ANY (ARRAY['asset'::text, 'liability'::text, 'equity'::text, 'revenue'::text, 'expense'::text]))),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS accounting_entries (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        company_id text NOT NULL,
        period_id text NOT NULL,
        entry_number integer NOT NULL,
        date date NOT NULL,
        description text NOT NULL DEFAULT ''::text,
        status text NOT NULL DEFAULT 'draft'::text,
        source text NOT NULL DEFAULT 'manual'::text,
        source_ref text,
        posted_at timestamp with time zone,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        CHECK ((source = ANY (ARRAY['manual'::text, 'payroll'::text, 'inventory'::text]))),
        CHECK ((status = ANY (ARRAY['draft'::text, 'posted'::text]))),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (period_id) REFERENCES accounting_periods(id)
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS accounting_entry_lines (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        entry_id text NOT NULL,
        account_id text NOT NULL,
        type text NOT NULL,
        amount numeric(18,4) NOT NULL,
        description text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        CHECK ((type = ANY (ARRAY['debit'::text, 'credit'::text]))),
        CHECK ((amount > (0)::numeric)),
        FOREIGN KEY (account_id) REFERENCES accounting_accounts(id),
        FOREIGN KEY (entry_id) REFERENCES accounting_entries(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS accounting_integration_log (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        company_id text NOT NULL,
        source text NOT NULL,
        source_ref text NOT NULL,
        entry_id text,
        status text NOT NULL,
        error_message text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        CHECK ((status = ANY (ARRAY['success'::text, 'error'::text, 'skipped'::text]))),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (entry_id) REFERENCES accounting_entries(id) ON DELETE SET NULL
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS accounting_integration_rules (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        company_id text NOT NULL,
        source text NOT NULL,
        debit_account_id text NOT NULL,
        credit_account_id text NOT NULL,
        amount_field text NOT NULL DEFAULT 'total'::text,
        description text NOT NULL DEFAULT ''::text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        CHECK ((source = ANY (ARRAY['payroll'::text, 'inventory_purchase'::text, 'inventory_movement'::text]))),
        FOREIGN KEY (credit_account_id) REFERENCES accounting_accounts(id),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (debit_account_id) REFERENCES accounting_accounts(id)
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS inventario_departamentos (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        empresa_id text NOT NULL,
        nombre text NOT NULL,
        descripcion text NOT NULL DEFAULT ''::text,
        activo boolean NOT NULL DEFAULT true,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY (empresa_id) REFERENCES companies(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS inventario_proveedores (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        empresa_id text NOT NULL,
        rif text NOT NULL DEFAULT ''::text,
        nombre text NOT NULL,
        contacto text NOT NULL DEFAULT ''::text,
        telefono text NOT NULL DEFAULT ''::text,
        email text NOT NULL DEFAULT ''::text,
        direccion text NOT NULL DEFAULT ''::text,
        notas text NOT NULL DEFAULT ''::text,
        activo boolean NOT NULL DEFAULT true,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY (empresa_id) REFERENCES companies(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS inventario_productos (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        empresa_id text NOT NULL,
        codigo text NOT NULL DEFAULT ''::text,
        nombre text NOT NULL,
        descripcion text NOT NULL DEFAULT ''::text,
        tipo text NOT NULL DEFAULT 'mercancia'::text,
        unidad_medida text NOT NULL DEFAULT 'unidad'::text,
        metodo_valuacion text NOT NULL DEFAULT 'promedio_ponderado'::text,
        existencia_actual numeric(14,4) NOT NULL DEFAULT 0,
        costo_promedio numeric(14,4) NOT NULL DEFAULT 0,
        activo boolean NOT NULL DEFAULT true,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        departamento_id text,
        iva_tipo text NOT NULL DEFAULT 'general'::text,
        moneda_defecto character(1) NOT NULL DEFAULT 'B'::bpchar,
        custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
        PRIMARY KEY (id),
        CHECK ((moneda_defecto = ANY (ARRAY['B'::bpchar, 'D'::bpchar]))),
        CHECK ((metodo_valuacion = ANY (ARRAY['promedio_ponderado'::text, 'peps'::text]))),
        CHECK ((tipo = 'mercancia'::text)),
        CHECK ((iva_tipo = ANY (ARRAY['exento'::text, 'general'::text]))),
        FOREIGN KEY (departamento_id) REFERENCES inventario_departamentos(id) ON DELETE SET NULL,
        FOREIGN KEY (empresa_id) REFERENCES companies(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS inventario_movimientos (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        empresa_id text NOT NULL,
        producto_id text NOT NULL,
        tipo text NOT NULL,
        fecha date NOT NULL DEFAULT CURRENT_DATE,
        periodo text NOT NULL,
        cantidad numeric(14,4) NOT NULL,
        costo_unitario numeric(14,4) NOT NULL DEFAULT 0,
        costo_total numeric(14,4) NOT NULL DEFAULT 0,
        saldo_cantidad numeric(14,4) NOT NULL DEFAULT 0,
        referencia text NOT NULL DEFAULT ''::text,
        notas text NOT NULL DEFAULT ''::text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        saldo_valor numeric(14,2) NOT NULL DEFAULT 0,
        moneda character(1) NOT NULL DEFAULT 'B'::bpchar,
        costo_moneda numeric(12,4),
        tasa_dolar numeric(12,4),
        factura_compra_id text,
        descuento_tipo text,
        descuento_valor numeric(14,4) DEFAULT 0,
        descuento_monto numeric(14,2) DEFAULT 0,
        recargo_tipo text,
        recargo_valor numeric(14,4) DEFAULT 0,
        recargo_monto numeric(14,2) DEFAULT 0,
        impuesto_tipo text,
        impuesto_valor numeric(14,4) DEFAULT 0,
        impuesto_monto numeric(14,2) DEFAULT 0,
        impuesto_concepto text DEFAULT ''::text,
        base_iva numeric(14,2) DEFAULT 0,
        precio_venta_unitario numeric(14,4) DEFAULT NULL::numeric,
        PRIMARY KEY (id),
        CHECK ((cantidad > (0)::numeric)),
        CHECK (((recargo_tipo IS NULL) OR (recargo_tipo = ANY (ARRAY['monto'::text, 'porcentaje'::text])))),
        CHECK ((moneda = ANY (ARRAY['B'::bpchar, 'D'::bpchar]))),
        CHECK (((impuesto_tipo IS NULL) OR (impuesto_tipo = ANY (ARRAY['monto'::text, 'porcentaje'::text])))),
        CHECK (((descuento_tipo IS NULL) OR (descuento_tipo = ANY (ARRAY['monto'::text, 'porcentaje'::text])))),
        CHECK ((tipo = ANY (ARRAY['entrada'::text, 'salida'::text, 'ajuste_positivo'::text, 'ajuste_negativo'::text, 'devolucion_entrada'::text, 'devolucion_salida'::text, 'autoconsumo'::text]))),
        FOREIGN KEY (empresa_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES inventario_productos(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS inventario_movimientos_drafts (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        draft_group_id uuid NOT NULL,
        empresa_id text NOT NULL,
        producto_id text NOT NULL,
        tipo text NOT NULL,
        fecha date NOT NULL DEFAULT CURRENT_DATE,
        cantidad numeric(14,4) NOT NULL DEFAULT 0,
        costo_unitario numeric(14,4) NOT NULL DEFAULT 0,
        moneda text NOT NULL DEFAULT 'B'::text,
        costo_moneda numeric(14,4),
        tasa_dolar numeric(14,4),
        referencia text NOT NULL DEFAULT ''::text,
        notas text NOT NULL DEFAULT ''::text,
        descuento_tipo text,
        descuento_valor numeric(14,4) NOT NULL DEFAULT 0,
        descuento_monto numeric(14,2) NOT NULL DEFAULT 0,
        recargo_tipo text,
        recargo_valor numeric(14,4) NOT NULL DEFAULT 0,
        recargo_monto numeric(14,2) NOT NULL DEFAULT 0,
        base_iva numeric(14,2),
        precio_venta_unitario numeric(14,4),
        kind text NOT NULL DEFAULT 'entrada'::text,
        direction text NOT NULL DEFAULT 'inbound'::text,
        iva_mode text NOT NULL DEFAULT 'agregado'::text,
        context jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY (empresa_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES inventario_productos(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS inventario_facturas_compra (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        empresa_id text NOT NULL,
        proveedor_id text NOT NULL,
        numero_factura text NOT NULL DEFAULT ''::text,
        fecha date NOT NULL DEFAULT CURRENT_DATE,
        periodo text NOT NULL,
        estado text NOT NULL DEFAULT 'borrador'::text,
        subtotal numeric(14,2) NOT NULL DEFAULT 0,
        iva_porcentaje numeric(5,2) NOT NULL DEFAULT 16,
        iva_monto numeric(14,2) NOT NULL DEFAULT 0,
        total numeric(14,2) NOT NULL DEFAULT 0,
        notas text NOT NULL DEFAULT ''::text,
        confirmada_at timestamp with time zone,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        numero_control text NOT NULL DEFAULT ''::text,
        tasa_dolar numeric(14,6),
        tasa_decimales smallint,
        descuento_tipo text,
        descuento_valor numeric(14,4) DEFAULT 0,
        descuento_monto numeric(14,2) DEFAULT 0,
        recargo_tipo text,
        recargo_valor numeric(14,4) DEFAULT 0,
        recargo_monto numeric(14,2) DEFAULT 0,
        impuesto_tipo text,
        impuesto_valor numeric(14,4) DEFAULT 0,
        impuesto_monto numeric(14,2) DEFAULT 0,
        impuesto_concepto text DEFAULT ''::text,
        periodo_manual boolean DEFAULT false,
        retencion_iva_pct numeric(5,2) DEFAULT 0,
        retencion_iva_monto numeric(14,2) DEFAULT 0,
        comprobante_retencion_iva_numero text,
        islr_concepto text,
        islr_porcentaje numeric(7,4) DEFAULT 0,
        islr_base_retencion numeric(14,2) DEFAULT 0,
        islr_sustraendo numeric(14,2) DEFAULT 0,
        islr_monto numeric(14,2) DEFAULT 0,
        islr_unidad_tributaria numeric(14,2),
        comprobante_islr_numero text,
        igtf_aplica boolean DEFAULT false,
        igtf_porcentaje numeric(5,2) DEFAULT 0,
        igtf_base_divisa numeric(14,4) DEFAULT 0,
        igtf_base_bs numeric(14,2) DEFAULT 0,
        igtf_monto numeric(14,2) DEFAULT 0,
        impuestos jsonb DEFAULT '[]'::jsonb,
        PRIMARY KEY (id),
        CHECK (((recargo_tipo IS NULL) OR (recargo_tipo = ANY (ARRAY['monto'::text, 'porcentaje'::text])))),
        CHECK (((impuesto_tipo IS NULL) OR (impuesto_tipo = ANY (ARRAY['monto'::text, 'porcentaje'::text])))),
        CHECK (((descuento_tipo IS NULL) OR (descuento_tipo = ANY (ARRAY['monto'::text, 'porcentaje'::text])))),
        CHECK ((estado = ANY (ARRAY['borrador'::text, 'confirmada'::text]))),
        FOREIGN KEY (proveedor_id) REFERENCES inventario_proveedores(id) ON DELETE RESTRICT,
        FOREIGN KEY (empresa_id) REFERENCES companies(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS inventario_facturas_compra_items (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        factura_id text NOT NULL,
        producto_id text NOT NULL,
        cantidad numeric(14,4) NOT NULL,
        costo_unitario numeric(14,4) NOT NULL DEFAULT 0,
        costo_total numeric(14,2) NOT NULL DEFAULT 0,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        iva_alicuota text NOT NULL DEFAULT 'general_16'::text,
        moneda character(1) NOT NULL DEFAULT 'B'::bpchar,
        costo_moneda numeric(12,4),
        tasa_dolar numeric(12,4),
        descuento_tipo text,
        descuento_valor numeric(14,4) DEFAULT 0,
        descuento_monto numeric(14,2) DEFAULT 0,
        recargo_tipo text,
        recargo_valor numeric(14,4) DEFAULT 0,
        recargo_monto numeric(14,2) DEFAULT 0,
        impuesto_tipo text,
        impuesto_valor numeric(14,4) DEFAULT 0,
        impuesto_monto numeric(14,2) DEFAULT 0,
        impuesto_concepto text DEFAULT ''::text,
        base_iva numeric(14,2) DEFAULT 0,
        iva_incluido boolean DEFAULT false,
        PRIMARY KEY (id),
        CHECK (((descuento_tipo IS NULL) OR (descuento_tipo = ANY (ARRAY['monto'::text, 'porcentaje'::text])))),
        CHECK ((iva_alicuota = ANY (ARRAY['exenta'::text, 'reducida_8'::text, 'general_16'::text]))),
        CHECK (((impuesto_tipo IS NULL) OR (impuesto_tipo = ANY (ARRAY['monto'::text, 'porcentaje'::text])))),
        CHECK (((recargo_tipo IS NULL) OR (recargo_tipo = ANY (ARRAY['monto'::text, 'porcentaje'::text])))),
        CHECK ((moneda = ANY (ARRAY['B'::bpchar, 'D'::bpchar]))),
        CHECK ((cantidad > (0)::numeric)),
        FOREIGN KEY (factura_id) REFERENCES inventario_facturas_compra(id) ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES inventario_productos(id) ON DELETE RESTRICT
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS inventario_cierres (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        empresa_id text NOT NULL,
        periodo text NOT NULL,
        cerrado_at timestamp with time zone NOT NULL DEFAULT now(),
        notas text NOT NULL DEFAULT ''::text,
        tasa_dolar numeric(12,4),
        PRIMARY KEY (id),
        UNIQUE (empresa_id, periodo),
        FOREIGN KEY (empresa_id) REFERENCES companies(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS ventas_clientes (
        id text NOT NULL,
        empresa_id text NOT NULL,
        rif text NOT NULL,
        nombre text NOT NULL,
        contacto text DEFAULT ''::text,
        telefono text DEFAULT ''::text,
        email text DEFAULT ''::text,
        direccion text DEFAULT ''::text,
        notas text DEFAULT ''::text,
        activo boolean NOT NULL DEFAULT true,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id)
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS ventas_facturas (
        id text NOT NULL,
        empresa_id text NOT NULL,
        cliente_id text NOT NULL,
        numero_factura text NOT NULL,
        numero_control text DEFAULT ''::text,
        fecha date NOT NULL,
        periodo text NOT NULL,
        periodo_manual boolean NOT NULL DEFAULT false,
        fecha_vencimiento date,
        condiciones_pago text DEFAULT 'contado'::text,
        estado text NOT NULL DEFAULT 'borrador'::text,
        subtotal numeric(14,2) NOT NULL DEFAULT 0,
        iva_monto numeric(14,2) NOT NULL DEFAULT 0,
        total numeric(14,2) NOT NULL DEFAULT 0,
        notas text DEFAULT ''::text,
        tasa_dolar numeric(14,4),
        tasa_decimales smallint,
        descuento_tipo text,
        descuento_valor numeric(14,2) DEFAULT 0,
        descuento_monto numeric(14,2) DEFAULT 0,
        recargo_tipo text,
        recargo_valor numeric(14,2) DEFAULT 0,
        recargo_monto numeric(14,2) DEFAULT 0,
        igtf_percepcion_aplica boolean DEFAULT false,
        igtf_percepcion_concepto text,
        igtf_percepcion_porcentaje numeric(5,2) DEFAULT 0,
        igtf_percepcion_base_divisa numeric(14,4) DEFAULT 0,
        igtf_percepcion_base_bs numeric(14,2) DEFAULT 0,
        igtf_percepcion_monto numeric(14,2) DEFAULT 0,
        confirmada_at timestamp with time zone,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        CHECK ((estado = ANY (ARRAY['borrador'::text, 'confirmada'::text, 'anulada'::text]))),
        FOREIGN KEY (cliente_id) REFERENCES ventas_clientes(id)
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS ventas_facturas_items (
        id text NOT NULL,
        factura_id text NOT NULL,
        producto_id text,
        descripcion text NOT NULL,
        cantidad numeric(14,4) NOT NULL DEFAULT 1,
        precio_unitario numeric(14,2) NOT NULL DEFAULT 0,
        total_linea numeric(14,2) NOT NULL DEFAULT 0,
        iva_alicuota text NOT NULL DEFAULT 'general_16'::text,
        moneda text NOT NULL DEFAULT 'B'::text,
        precio_moneda numeric(14,4),
        tasa_dolar numeric(14,4),
        descuento_tipo text,
        descuento_valor numeric(14,2) DEFAULT 0,
        descuento_monto numeric(14,2) DEFAULT 0,
        recargo_tipo text,
        recargo_valor numeric(14,2) DEFAULT 0,
        recargo_monto numeric(14,2) DEFAULT 0,
        base_iva numeric(14,2),
        iva_incluido boolean NOT NULL DEFAULT false,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        CHECK ((moneda = ANY (ARRAY['B'::text, 'D'::text]))),
        CHECK ((iva_alicuota = ANY (ARRAY['exenta'::text, 'reducida_8'::text, 'general_16'::text]))),
        FOREIGN KEY (producto_id) REFERENCES inventario_productos(id),
        FOREIGN KEY (factura_id) REFERENCES ventas_facturas(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS document_folders (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        parent_id text,
        name text NOT NULL,
        company_id text,
        created_by uuid NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
        FOREIGN KEY (parent_id) REFERENCES document_folders(id) ON DELETE CASCADE
    )$t$;

    EXECUTE $t$
    CREATE TABLE IF NOT EXISTS documents (
        id text NOT NULL DEFAULT (gen_random_uuid())::text,
        folder_id text,
        company_id text,
        name text NOT NULL,
        storage_path text NOT NULL,
        mime_type text,
        size_bytes bigint,
        uploaded_by uuid NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        UNIQUE (storage_path),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
        FOREIGN KEY (folder_id) REFERENCES document_folders(id) ON DELETE SET NULL
    )$t$;

    -- ===== COLUMNAS faltantes en tablas que ya existian en tenants viejos =====
    -- (CREATE TABLE IF NOT EXISTS no altera tablas existentes, asi que las
    --  completamos explicitamente; idempotente.)
    EXECUTE $c$ALTER TABLE companies ADD COLUMN IF NOT EXISTS config_fiscal jsonb NOT NULL DEFAULT '{}'::jsonb $c$;
    EXECUTE $c$ALTER TABLE companies ADD COLUMN IF NOT EXISTS payroll_settings jsonb NOT NULL DEFAULT '{}'::jsonb $c$;
    EXECUTE $c$ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_logo_in_pdf boolean NOT NULL DEFAULT false $c$;
    EXECUTE $c$ALTER TABLE companies ADD COLUMN IF NOT EXISTS sector text $c$;
    EXECUTE $c$ALTER TABLE companies ADD COLUMN IF NOT EXISTS inventory_config jsonb NOT NULL DEFAULT '{}'::jsonb $c$;
    EXECUTE $c$ALTER TABLE companies ADD COLUMN IF NOT EXISTS taxpayer_type text NOT NULL DEFAULT 'ordinario'::text $c$;
    EXECUTE $c$ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_email text $c$;
    EXECUTE $c$ALTER TABLE companies ADD COLUMN IF NOT EXISTS proximo_numero_factura_venta integer DEFAULT 1 $c$;

    -- CHECK de taxpayer_type (solo si no existe ya alguno sobre esa columna).
    -- Se consulta el catalogo por nombre de esquema (NO via 'companies'::regclass)
    -- para evitar que plpgsql cachee el OID del primer tenant durante el loop de sanado.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class c   ON c.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
        WHERE nsp.nspname = v_schema AND c.relname = 'companies' AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%taxpayer_type%'
    ) THEN
        EXECUTE $c$ALTER TABLE companies ADD CONSTRAINT companies_taxpayer_type_chk
                   CHECK (taxpayer_type = ANY (ARRAY['ordinario'::text, 'especial'::text])) $c$;
    END IF;

    EXECUTE $c$ALTER TABLE employees ADD COLUMN IF NOT EXISTS fecha_ingreso date $c$;
    EXECUTE $c$ALTER TABLE employees ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT 'VES'::text $c$;
    EXECUTE $c$ALTER TABLE employees ADD COLUMN IF NOT EXISTS porcentaje_islr numeric(5,2) NOT NULL DEFAULT 0 $c$;

    -- ===== SYNC GENERICO DE COLUMNAS (drift intra-tabla en tenants viejos) =====
    -- Para cada tabla que ya existe en el tenant Y en el esquema de referencia,
    -- agrega cualquier columna presente en la referencia que falte en el tenant,
    -- copiando tipo y DEFAULT. Se omite NOT NULL salvo que haya DEFAULT (seguro
    -- frente a filas existentes). Se filtra por nombre de esquema (parametros) por
    -- lo que el plan cacheado no queda atado a OIDs de un tenant concreto.
    IF p_reference_schema IS NOT NULL AND p_reference_schema <> v_schema THEN
        FOR col IN
            SELECT rc.relname                                AS tbl,
                   a.attname                                 AS colname,
                   format_type(a.atttypid, a.atttypmod)      AS coltype,
                   pg_get_expr(ad.adbin, ad.adrelid)         AS coldef,
                   a.attnotnull                              AS notnull
            FROM pg_namespace rns
            JOIN pg_class      rc  ON rc.relnamespace = rns.oid AND rc.relkind = 'r'
            JOIN pg_attribute  a   ON a.attrelid = rc.oid AND a.attnum > 0 AND NOT a.attisdropped
            LEFT JOIN pg_attrdef ad ON ad.adrelid = rc.oid AND ad.adnum = a.attnum
            JOIN pg_namespace  tns ON tns.nspname = v_schema
            JOIN pg_class      tc  ON tc.relnamespace = tns.oid AND tc.relname = rc.relname AND tc.relkind = 'r'
            WHERE rns.nspname = p_reference_schema
              AND NOT EXISTS (
                  SELECT 1 FROM pg_attribute ta
                  WHERE ta.attrelid = tc.oid AND ta.attname = a.attname
                    AND ta.attnum > 0 AND NOT ta.attisdropped
              )
        LOOP
            EXECUTE format(
                'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS %I %s %s',
                v_schema, col.tbl, col.colname, col.coltype,
                CASE WHEN col.coldef IS NOT NULL THEN 'DEFAULT ' || col.coldef ELSE '' END
            );
            IF col.notnull AND col.coldef IS NOT NULL THEN
                EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET NOT NULL',
                               v_schema, col.tbl, col.colname);
            END IF;
        END LOOP;
    END IF;

    -- ===== INDICES (idempotentes) ==========================================
    EXECUTE $i$CREATE INDEX IF NOT EXISTS employees_company_idx ON employees (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS idx_salary_history_emp ON employee_salary_history (company_id, employee_cedula, fecha_desde DESC)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS payroll_runs_company_idx ON payroll_runs (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS payroll_receipts_run_idx ON payroll_receipts (run_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS payroll_receipts_company_idx ON payroll_receipts (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS cesta_ticket_runs_company_idx ON cesta_ticket_runs (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS cesta_ticket_receipts_run_idx ON cesta_ticket_receipts (run_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS cesta_ticket_receipts_company_idx ON cesta_ticket_receipts (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS bono_guerra_runs_company_idx ON bono_guerra_runs (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS bono_guerra_receipts_run_idx ON bono_guerra_receipts (run_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS bono_guerra_receipts_company_idx ON bono_guerra_receipts (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS bonificaciones_runs_company_idx ON bonificaciones_runs (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS bonificaciones_receipts_run_idx ON bonificaciones_receipts (run_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS bonificaciones_receipts_company_idx ON bonificaciones_receipts (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS acc_periods_company_idx ON accounting_periods (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS acc_charts_company_idx ON accounting_charts (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS acc_accounts_company_idx ON accounting_accounts (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS accounting_accounts_chart_id_idx ON accounting_accounts (chart_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS acc_entries_company_idx ON accounting_entries (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS acc_entries_period_idx ON accounting_entries (period_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS acc_lines_entry_idx ON accounting_entry_lines (entry_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS acc_lines_account_idx ON accounting_entry_lines (account_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS acc_int_log_company_idx ON accounting_integration_log (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS acc_int_log_ref_idx ON accounting_integration_log (source_ref)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS accounting_integration_log_entry_id_idx ON accounting_integration_log (entry_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS acc_int_rules_company_idx ON accounting_integration_rules (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS accounting_integration_rules_debit_acct_idx ON accounting_integration_rules (debit_account_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS accounting_integration_rules_credit_acct_idx ON accounting_integration_rules (credit_account_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS inv_departamentos_empresa_idx ON inventario_departamentos (empresa_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS inv_proveedores_empresa_idx ON inventario_proveedores (empresa_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS inv_productos_empresa_idx ON inventario_productos (empresa_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS inv_productos_departamento_id_idx ON inventario_productos (departamento_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS inv_movimientos_empresa_idx ON inventario_movimientos (empresa_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS inv_movimientos_producto_idx ON inventario_movimientos (producto_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS inv_movs_drafts_group_idx ON inventario_movimientos_drafts (empresa_id, kind, draft_group_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS inv_movs_drafts_producto_id_idx ON inventario_movimientos_drafts (producto_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS inv_movs_drafts_recent_idx ON inventario_movimientos_drafts (empresa_id, kind, updated_at DESC)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS inv_facturas_empresa_idx ON inventario_facturas_compra (empresa_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS inv_facturas_proveedor_idx ON inventario_facturas_compra (proveedor_id)$i$;
    EXECUTE $i$CREATE UNIQUE INDEX IF NOT EXISTS ux_facturas_compra_comprobante_islr ON inventario_facturas_compra (empresa_id, comprobante_islr_numero) WHERE (comprobante_islr_numero IS NOT NULL)$i$;
    EXECUTE $i$CREATE UNIQUE INDEX IF NOT EXISTS ux_facturas_compra_comprobante_retencion ON inventario_facturas_compra (empresa_id, comprobante_retencion_iva_numero) WHERE (comprobante_retencion_iva_numero IS NOT NULL)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS inv_factura_items_factura_idx ON inventario_facturas_compra_items (factura_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS inv_factura_items_producto_id_idx ON inventario_facturas_compra_items (producto_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS inv_cierres_empresa_idx ON inventario_cierres (empresa_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS ix_ventas_clientes_empresa ON ventas_clientes (empresa_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS ix_ventas_facturas_empresa_periodo ON ventas_facturas (empresa_id, periodo)$i$;
    EXECUTE $i$CREATE UNIQUE INDEX IF NOT EXISTS ux_ventas_facturas_empresa_numero ON ventas_facturas (empresa_id, numero_factura) WHERE (numero_factura <> ''::text)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS ventas_facturas_cliente_id_idx ON ventas_facturas (cliente_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS ventas_facturas_items_factura_id_idx ON ventas_facturas_items (factura_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS ventas_facturas_items_producto_id_idx ON ventas_facturas_items (producto_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS doc_folders_company_idx ON document_folders (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS doc_folders_parent_idx ON document_folders (parent_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS documents_company_idx ON documents (company_id)$i$;
    EXECUTE $i$CREATE INDEX IF NOT EXISTS documents_folder_idx ON documents (folder_id)$i$;

    -- ===== RLS + politica tenant_owner + grants (generico para todas las tablas) =====
    FOR r IN
        SELECT tablename FROM pg_tables WHERE schemaname = v_schema
    LOOP
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', v_schema, r.tablename);
        EXECUTE format('DROP POLICY IF EXISTS tenant_owner ON %I.%I', v_schema, r.tablename);
        EXECUTE format(
            'CREATE POLICY tenant_owner ON %I.%I FOR ALL USING ((SELECT auth.uid()) = %L::uuid)',
            v_schema, r.tablename, p_user_id
        );
    END LOOP;

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', v_schema);
END;
$func$;

-- Solo service_role puede ejecutar (defensa en profundidad, cf. migracion 098)
REVOKE EXECUTE ON FUNCTION public.reconcile_tenant_schema(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reconcile_tenant_schema(uuid, text) TO service_role;

-- -----------------------------------------------------------------------------
-- provision_tenant_schema: ahora delega en reconcile_tenant_schema
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

    -- Crea/completa el esquema COMPLETO del tenant
    PERFORM public.reconcile_tenant_schema(p_user_id);

    -- Registro del tenant (idempotente)
    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema, 'monthly')
    ON CONFLICT (id) DO NOTHING;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.provision_tenant_schema(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.provision_tenant_schema(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- Sanar TODOS los tenants existentes (no-op para los que ya estan completos).
-- Se usa como referencia el esquema de tenant con MAS columnas (el mas completo)
-- para copiar columnas faltantes en tablas con drift intra-tabla.
-- -----------------------------------------------------------------------------
DO $heal$
DECLARE
    t      record;
    v_ref  text;
BEGIN
    SELECT schema_name INTO v_ref
    FROM (
        SELECT tn.schema_name, count(*) AS n
        FROM public.tenants tn
        JOIN information_schema.columns col ON col.table_schema = tn.schema_name
        GROUP BY tn.schema_name
        ORDER BY n DESC
        LIMIT 1
    ) x;

    FOR t IN SELECT id FROM public.tenants LOOP
        PERFORM public.reconcile_tenant_schema(t.id, v_ref);
    END LOOP;
END;
$heal$;
