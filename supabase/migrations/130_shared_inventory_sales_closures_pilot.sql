-- 130_shared_inventory_sales_closures_pilot.sql
-- Sales and period closures. All references include tenant_id.

CREATE TABLE IF NOT EXISTS public.shared_inventory_customers (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    company_id text NOT NULL,
    rif text NOT NULL,
    name text NOT NULL,
    contact text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '',
    address text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.shared_inventory_sales_invoices (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, company_id text NOT NULL, customer_id text NOT NULL,
    invoice_number text NOT NULL, control_number text NOT NULL DEFAULT '', invoice_date date NOT NULL,
    period text NOT NULL, manual_period boolean NOT NULL DEFAULT false, due_date date,
    payment_terms text DEFAULT 'contado', status text NOT NULL DEFAULT 'borrador',
    subtotal numeric(14,2) NOT NULL DEFAULT 0, vat_amount numeric(14,2) NOT NULL DEFAULT 0,
    total numeric(14,2) NOT NULL DEFAULT 0, notes text DEFAULT '', dollar_rate numeric(14,4),
    rate_decimals smallint, discount_type text, discount_value numeric(14,2) DEFAULT 0,
    discount_amount numeric(14,2) DEFAULT 0, surcharge_type text, surcharge_value numeric(14,2) DEFAULT 0,
    surcharge_amount numeric(14,2) DEFAULT 0, financial_tax_applies boolean DEFAULT false,
    financial_tax_concept text, financial_tax_percentage numeric(5,2) DEFAULT 0,
    financial_tax_currency_base numeric(14,4) DEFAULT 0, financial_tax_bs_base numeric(14,2) DEFAULT 0,
    financial_tax_amount numeric(14,2) DEFAULT 0, confirmed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id), CHECK (status IN ('borrador','confirmada','anulada')),
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id,customer_id) REFERENCES public.shared_inventory_customers(tenant_id,id)
);

CREATE TABLE IF NOT EXISTS public.shared_inventory_sales_invoice_items (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, invoice_id text NOT NULL, product_id text, description text NOT NULL,
    quantity numeric(14,4) NOT NULL DEFAULT 1, unit_price numeric(14,2) NOT NULL DEFAULT 0,
    line_total numeric(14,2) NOT NULL DEFAULT 0, vat_rate text NOT NULL DEFAULT 'general_16',
    currency text NOT NULL DEFAULT 'B', currency_price numeric(14,4), dollar_rate numeric(14,4),
    discount_type text, discount_value numeric(14,2) DEFAULT 0, discount_amount numeric(14,2) DEFAULT 0,
    surcharge_type text, surcharge_value numeric(14,2) DEFAULT 0, surcharge_amount numeric(14,2) DEFAULT 0,
    vat_base numeric(14,2), vat_included boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id), CHECK (currency IN ('B','D')),
    CHECK (vat_rate IN ('exenta','reducida_8','general_16')),
    FOREIGN KEY (tenant_id,invoice_id) REFERENCES public.shared_inventory_sales_invoices(tenant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id,product_id) REFERENCES public.shared_inventory_products(tenant_id,id)
);

CREATE TABLE IF NOT EXISTS public.shared_inventory_closures (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, company_id text NOT NULL, period text NOT NULL,
    closed_at timestamptz NOT NULL DEFAULT now(), notes text NOT NULL DEFAULT '', dollar_rate numeric(12,4),
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,company_id,period),
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS shared_sales_customers_company_idx ON public.shared_inventory_customers(tenant_id,company_id,active);
CREATE INDEX IF NOT EXISTS shared_sales_invoices_company_period_idx ON public.shared_inventory_sales_invoices(tenant_id,company_id,period);
CREATE INDEX IF NOT EXISTS shared_sales_invoices_customer_idx ON public.shared_inventory_sales_invoices(tenant_id,customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS shared_sales_invoices_number_idx ON public.shared_inventory_sales_invoices(tenant_id,company_id,invoice_number) WHERE invoice_number <> '';
CREATE INDEX IF NOT EXISTS shared_sales_items_invoice_idx ON public.shared_inventory_sales_invoice_items(tenant_id,invoice_id);
CREATE INDEX IF NOT EXISTS shared_sales_items_product_idx ON public.shared_inventory_sales_invoice_items(tenant_id,product_id);
CREATE INDEX IF NOT EXISTS shared_closures_company_period_idx ON public.shared_inventory_closures(tenant_id,company_id,period);

ALTER TABLE public.shared_inventory_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_inventory_sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_inventory_sales_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_inventory_closures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shared_customers_member_access ON public.shared_inventory_customers;
DROP POLICY IF EXISTS shared_sales_invoices_member_access ON public.shared_inventory_sales_invoices;
DROP POLICY IF EXISTS shared_sales_items_member_access ON public.shared_inventory_sales_invoice_items;
DROP POLICY IF EXISTS shared_closures_member_access ON public.shared_inventory_closures;
CREATE POLICY shared_customers_member_access ON public.shared_inventory_customers FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_customers.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL)) WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_customers.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL));
CREATE POLICY shared_sales_invoices_member_access ON public.shared_inventory_sales_invoices FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_sales_invoices.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL)) WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_sales_invoices.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL));
CREATE POLICY shared_sales_items_member_access ON public.shared_inventory_sales_invoice_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_sales_invoice_items.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL)) WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_sales_invoice_items.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL));
CREATE POLICY shared_closures_member_access ON public.shared_inventory_closures FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_closures.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL)) WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_closures.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL));

DO $$
DECLARE t record; n bigint;
BEGIN
  FOR t IN SELECT id,schema_name FROM public.tenants LOOP
    EXECUTE format('SELECT count(*) FROM %I.ventas_clientes v LEFT JOIN public.shared_companies c ON c.tenant_id=%L::uuid AND c.id=v.empresa_id WHERE c.id IS NULL',t.schema_name,t.id) INTO n;
    IF n>0 THEN RAISE EXCEPTION 'Tenant % has % customers without same-tenant company',t.id,n; END IF;
    EXECUTE format('SELECT count(*) FROM %I.ventas_facturas f LEFT JOIN public.shared_inventory_customers c ON c.tenant_id=%L::uuid AND c.id=f.cliente_id WHERE c.id IS NULL',t.schema_name,t.id) INTO n;
    IF n>0 THEN RAISE EXCEPTION 'Tenant % has % sales invoices without same-tenant customer',t.id,n; END IF;
    EXECUTE format('SELECT count(*) FROM %I.ventas_facturas_items i LEFT JOIN %I.ventas_facturas f ON f.id=i.factura_id WHERE f.id IS NULL',t.schema_name,t.schema_name) INTO n;
    IF n>0 THEN RAISE EXCEPTION 'Tenant % has % sales items without local invoice',t.id,n; END IF;
    EXECUTE format('SELECT count(*) FROM %I.inventario_cierres c LEFT JOIN public.shared_companies x ON x.tenant_id=%L::uuid AND x.id=c.empresa_id WHERE x.id IS NULL',t.schema_name,t.id) INTO n;
    IF n>0 THEN RAISE EXCEPTION 'Tenant % has % closures without same-tenant company',t.id,n; END IF;
    EXECUTE format($sql$INSERT INTO public.shared_inventory_customers(tenant_id,id,company_id,rif,name,contact,phone,email,address,notes,active,created_at,updated_at) SELECT %L::uuid,id,empresa_id,rif,nombre,contacto,telefono,email,direccion,notas,activo,created_at,updated_at FROM %I.ventas_clientes ON CONFLICT DO NOTHING$sql$,t.id,t.schema_name);
    EXECUTE format($sql$INSERT INTO public.shared_inventory_sales_invoices(tenant_id,id,company_id,customer_id,invoice_number,control_number,invoice_date,period,manual_period,due_date,payment_terms,status,subtotal,vat_amount,total,notes,dollar_rate,rate_decimals,discount_type,discount_value,discount_amount,surcharge_type,surcharge_value,surcharge_amount,financial_tax_applies,financial_tax_concept,financial_tax_percentage,financial_tax_currency_base,financial_tax_bs_base,financial_tax_amount,confirmed_at,created_at,updated_at) SELECT %L::uuid,id,empresa_id,cliente_id,numero_factura,numero_control,fecha,periodo,periodo_manual,fecha_vencimiento,condiciones_pago,estado,subtotal,iva_monto,total,notas,tasa_dolar,tasa_decimales,descuento_tipo,descuento_valor,descuento_monto,recargo_tipo,recargo_valor,recargo_monto,igtf_percepcion_aplica,igtf_percepcion_concepto,igtf_percepcion_porcentaje,igtf_percepcion_base_divisa,igtf_percepcion_base_bs,igtf_percepcion_monto,confirmada_at,created_at,updated_at FROM %I.ventas_facturas ON CONFLICT DO NOTHING$sql$,t.id,t.schema_name);
    EXECUTE format($sql$INSERT INTO public.shared_inventory_sales_invoice_items(tenant_id,id,invoice_id,product_id,description,quantity,unit_price,line_total,vat_rate,currency,currency_price,dollar_rate,discount_type,discount_value,discount_amount,surcharge_type,surcharge_value,surcharge_amount,vat_base,vat_included,created_at) SELECT %L::uuid,id,factura_id,producto_id,descripcion,cantidad,precio_unitario,total_linea,iva_alicuota,moneda,precio_moneda,tasa_dolar,descuento_tipo,descuento_valor,descuento_monto,recargo_tipo,recargo_valor,recargo_monto,base_iva,iva_incluido,created_at FROM %I.ventas_facturas_items ON CONFLICT DO NOTHING$sql$,t.id,t.schema_name);
    EXECUTE format($sql$INSERT INTO public.shared_inventory_closures(tenant_id,id,company_id,period,closed_at,notes,dollar_rate) SELECT %L::uuid,id,empresa_id,periodo,cerrado_at,notas,tasa_dolar FROM %I.inventario_cierres ON CONFLICT DO NOTHING$sql$,t.id,t.schema_name);
  END LOOP;
END $$;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.shared_inventory_customers TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.shared_inventory_sales_invoices TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.shared_inventory_sales_invoice_items TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.shared_inventory_closures TO authenticated;
