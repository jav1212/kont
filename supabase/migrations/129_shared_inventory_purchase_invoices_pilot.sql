-- 129_shared_inventory_purchase_invoices_pilot.sql
-- Purchase invoices and lines in the shared schema.  The tenant_id is part of
-- every key and FK so an invoice can never reference another tenant's data.

CREATE TABLE IF NOT EXISTS public.shared_inventory_purchase_invoices (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    company_id text NOT NULL,
    supplier_id text NOT NULL,
    invoice_number text NOT NULL DEFAULT '',
    invoice_date date NOT NULL DEFAULT CURRENT_DATE,
    period text NOT NULL,
    status text NOT NULL DEFAULT 'borrador',
    subtotal numeric(14,2) NOT NULL DEFAULT 0,
    vat_percentage numeric(5,2) NOT NULL DEFAULT 16,
    vat_amount numeric(14,2) NOT NULL DEFAULT 0,
    total numeric(14,2) NOT NULL DEFAULT 0,
    notes text NOT NULL DEFAULT '',
    confirmed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    control_number text NOT NULL DEFAULT '',
    dollar_rate numeric(14,6),
    rate_decimals smallint,
    discount_type text,
    discount_value numeric(14,4) DEFAULT 0,
    discount_amount numeric(14,2) DEFAULT 0,
    surcharge_type text,
    surcharge_value numeric(14,4) DEFAULT 0,
    surcharge_amount numeric(14,2) DEFAULT 0,
    tax_type text,
    tax_value numeric(14,4) DEFAULT 0,
    tax_amount numeric(14,2) DEFAULT 0,
    tax_concept text DEFAULT '',
    manual_period boolean DEFAULT false,
    vat_retention_percentage numeric(5,2) DEFAULT 0,
    vat_retention_amount numeric(14,2) DEFAULT 0,
    vat_retention_receipt_number text,
    income_tax_concept text,
    income_tax_percentage numeric(7,4) DEFAULT 0,
    income_tax_base numeric(14,2) DEFAULT 0,
    income_tax_subtrahend numeric(14,2) DEFAULT 0,
    income_tax_amount numeric(14,2) DEFAULT 0,
    tax_unit_value numeric(14,2),
    income_tax_receipt_number text,
    financial_tax_applies boolean DEFAULT false,
    financial_tax_percentage numeric(5,2) DEFAULT 0,
    financial_tax_currency_base numeric(14,4) DEFAULT 0,
    financial_tax_bs_base numeric(14,2) DEFAULT 0,
    financial_tax_amount numeric(14,2) DEFAULT 0,
    taxes jsonb DEFAULT '[]'::jsonb,
    PRIMARY KEY (tenant_id,id),
    CHECK (status IN ('borrador','confirmada')),
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id,supplier_id) REFERENCES public.shared_inventory_suppliers(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.shared_inventory_purchase_invoice_items (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    invoice_id text NOT NULL,
    product_id text NOT NULL,
    quantity numeric(14,4) NOT NULL,
    unit_cost numeric(14,4) NOT NULL DEFAULT 0,
    total_cost numeric(14,2) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    vat_rate text NOT NULL DEFAULT 'general_16',
    currency char(1) NOT NULL DEFAULT 'B',
    currency_cost numeric(12,4),
    dollar_rate numeric(12,4),
    discount_type text,
    discount_value numeric(14,4) DEFAULT 0,
    discount_amount numeric(14,2) DEFAULT 0,
    surcharge_type text,
    surcharge_value numeric(14,4) DEFAULT 0,
    surcharge_amount numeric(14,2) DEFAULT 0,
    tax_type text,
    tax_value numeric(14,4) DEFAULT 0,
    tax_amount numeric(14,2) DEFAULT 0,
    tax_concept text DEFAULT '',
    vat_base numeric(14,2) DEFAULT 0,
    vat_included boolean DEFAULT false,
    PRIMARY KEY (tenant_id,id),
    CHECK (vat_rate IN ('exenta','reducida_8','general_16')),
    CHECK (currency IN ('B','D')),
    CHECK (quantity > 0),
    FOREIGN KEY (tenant_id,invoice_id) REFERENCES public.shared_inventory_purchase_invoices(tenant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id,product_id) REFERENCES public.shared_inventory_products(tenant_id,id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS shared_purchase_invoices_company_period_idx
    ON public.shared_inventory_purchase_invoices(tenant_id,company_id,period);
CREATE INDEX IF NOT EXISTS shared_purchase_invoices_supplier_idx
    ON public.shared_inventory_purchase_invoices(tenant_id,supplier_id);
CREATE UNIQUE INDEX IF NOT EXISTS shared_purchase_invoices_islr_receipt_idx
    ON public.shared_inventory_purchase_invoices(tenant_id,company_id,income_tax_receipt_number)
    WHERE income_tax_receipt_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shared_purchase_invoices_vat_receipt_idx
    ON public.shared_inventory_purchase_invoices(tenant_id,company_id,vat_retention_receipt_number)
    WHERE vat_retention_receipt_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS shared_purchase_items_invoice_idx
    ON public.shared_inventory_purchase_invoice_items(tenant_id,invoice_id);
CREATE INDEX IF NOT EXISTS shared_purchase_items_product_idx
    ON public.shared_inventory_purchase_invoice_items(tenant_id,product_id);

ALTER TABLE public.shared_inventory_purchase_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shared_purchase_invoices_member_access ON public.shared_inventory_purchase_invoices;
CREATE POLICY shared_purchase_invoices_member_access ON public.shared_inventory_purchase_invoices FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_purchase_invoices.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL))
WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_purchase_invoices.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL));

ALTER TABLE public.shared_inventory_purchase_invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shared_purchase_items_member_access ON public.shared_inventory_purchase_invoice_items;
CREATE POLICY shared_purchase_items_member_access ON public.shared_inventory_purchase_invoice_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_purchase_invoice_items.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL))
WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_purchase_invoice_items.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL));

DO $$
DECLARE
    t record;
    n bigint;
BEGIN
    FOR t IN SELECT id, schema_name FROM public.tenants LOOP
        EXECUTE format('SELECT count(*) FROM %I.inventario_facturas_compra f LEFT JOIN public.shared_companies c ON c.tenant_id=%L::uuid AND c.id=f.empresa_id WHERE c.id IS NULL', t.schema_name, t.id) INTO n;
        IF n > 0 THEN RAISE EXCEPTION 'Tenant % has % purchase invoices without a same-tenant company', t.id, n; END IF;
        EXECUTE format('SELECT count(*) FROM %I.inventario_facturas_compra f LEFT JOIN public.shared_inventory_suppliers s ON s.tenant_id=%L::uuid AND s.id=f.proveedor_id WHERE s.id IS NULL', t.schema_name, t.id) INTO n;
        IF n > 0 THEN RAISE EXCEPTION 'Tenant % has % purchase invoices without a same-tenant supplier', t.id, n; END IF;
        EXECUTE format('SELECT count(*) FROM %I.inventario_facturas_compra_items i LEFT JOIN public.shared_inventory_products p ON p.tenant_id=%L::uuid AND p.id=i.producto_id WHERE p.id IS NULL', t.schema_name, t.id) INTO n;
        IF n > 0 THEN RAISE EXCEPTION 'Tenant % has % purchase items without a same-tenant product', t.id, n; END IF;
        EXECUTE format('SELECT count(*) FROM %I.inventario_facturas_compra_items i LEFT JOIN %I.inventario_facturas_compra f ON f.id=i.factura_id WHERE f.id IS NULL', t.schema_name, t.schema_name) INTO n;
        IF n > 0 THEN RAISE EXCEPTION 'Tenant % has % purchase items without a local invoice', t.id, n; END IF;

        EXECUTE format($sql$
            INSERT INTO public.shared_inventory_purchase_invoices
              (tenant_id,id,company_id,supplier_id,invoice_number,invoice_date,period,status,subtotal,vat_percentage,vat_amount,total,notes,confirmed_at,created_at,updated_at,control_number,dollar_rate,rate_decimals,discount_type,discount_value,discount_amount,surcharge_type,surcharge_value,surcharge_amount,tax_type,tax_value,tax_amount,tax_concept,manual_period,vat_retention_percentage,vat_retention_amount,vat_retention_receipt_number,income_tax_concept,income_tax_percentage,income_tax_base,income_tax_subtrahend,income_tax_amount,tax_unit_value,income_tax_receipt_number,financial_tax_applies,financial_tax_percentage,financial_tax_currency_base,financial_tax_bs_base,financial_tax_amount,taxes)
            SELECT %L::uuid,f.id,f.empresa_id,f.proveedor_id,f.numero_factura,f.fecha,f.periodo,f.estado,f.subtotal,f.iva_porcentaje,f.iva_monto,f.total,f.notas,f.confirmada_at,f.created_at,f.updated_at,f.numero_control,f.tasa_dolar,f.tasa_decimales,f.descuento_tipo,f.descuento_valor,f.descuento_monto,f.recargo_tipo,f.recargo_valor,f.recargo_monto,f.impuesto_tipo,f.impuesto_valor,f.impuesto_monto,f.impuesto_concepto,f.periodo_manual,f.retencion_iva_pct,f.retencion_iva_monto,f.comprobante_retencion_iva_numero,f.islr_concepto,f.islr_porcentaje,f.islr_base_retencion,f.islr_sustraendo,f.islr_monto,f.islr_unidad_tributaria,f.comprobante_islr_numero,f.igtf_aplica,f.igtf_porcentaje,f.igtf_base_divisa,f.igtf_base_bs,f.igtf_monto,f.impuestos
            FROM %I.inventario_facturas_compra f
            ON CONFLICT (tenant_id,id) DO NOTHING
        $sql$,t.id,t.schema_name);

        EXECUTE format($sql$
            INSERT INTO public.shared_inventory_purchase_invoice_items
              (tenant_id,id,invoice_id,product_id,quantity,unit_cost,total_cost,created_at,vat_rate,currency,currency_cost,dollar_rate,discount_type,discount_value,discount_amount,surcharge_type,surcharge_value,surcharge_amount,tax_type,tax_value,tax_amount,tax_concept,vat_base,vat_included)
            SELECT %L::uuid,i.id,i.factura_id,i.producto_id,i.cantidad,i.costo_unitario,i.costo_total,i.created_at,i.iva_alicuota,i.moneda,i.costo_moneda,i.tasa_dolar,i.descuento_tipo,i.descuento_valor,i.descuento_monto,i.recargo_tipo,i.recargo_valor,i.recargo_monto,i.impuesto_tipo,i.impuesto_valor,i.impuesto_monto,i.impuesto_concepto,i.base_iva,i.iva_incluido
            FROM %I.inventario_facturas_compra_items i
            ON CONFLICT (tenant_id,id) DO NOTHING
        $sql$,t.id,t.schema_name);
    END LOOP;
END $$;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.shared_inventory_purchase_invoices TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.shared_inventory_purchase_invoice_items TO authenticated;
