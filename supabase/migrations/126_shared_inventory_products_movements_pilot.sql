-- 126_shared_inventory_products_movements_pilot.sql

CREATE TABLE IF NOT EXISTS public.shared_inventory_products (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    company_id text NOT NULL,
    code text NOT NULL DEFAULT '',
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    type text NOT NULL DEFAULT 'mercancia',
    measure_unit text NOT NULL DEFAULT 'unidad',
    valuation_method text NOT NULL DEFAULT 'promedio_ponderado',
    current_stock numeric(14,4) NOT NULL DEFAULT 0,
    average_cost numeric(14,4) NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    department_id text,
    vat_type text NOT NULL DEFAULT 'general',
    default_currency char(1) NOT NULL DEFAULT 'B',
    custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, department_id) REFERENCES public.shared_inventory_departments(tenant_id,id) ON DELETE SET NULL,
    CHECK (type = 'mercancia'),
    CHECK (valuation_method IN ('promedio_ponderado','peps')),
    CHECK (vat_type IN ('exento','general')),
    CHECK (default_currency IN ('B','D'))
);

CREATE TABLE IF NOT EXISTS public.shared_inventory_movements (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    company_id text NOT NULL,
    product_id text NOT NULL,
    type text NOT NULL,
    date date NOT NULL DEFAULT CURRENT_DATE,
    period text NOT NULL,
    quantity numeric(14,4) NOT NULL,
    unit_cost numeric(14,4) NOT NULL DEFAULT 0,
    total_cost numeric(14,4) NOT NULL DEFAULT 0,
    balance_quantity numeric(14,4) NOT NULL DEFAULT 0,
    reference text NOT NULL DEFAULT '',
    notes text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    balance_value numeric(14,2) NOT NULL DEFAULT 0,
    currency char(1) NOT NULL DEFAULT 'B',
    currency_cost numeric(12,4),
    dollar_rate numeric(12,4),
    purchase_invoice_id text,
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
    sale_price_unit numeric(14,4),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, product_id) REFERENCES public.shared_inventory_products(tenant_id,id) ON DELETE CASCADE,
    CHECK (quantity > 0),
    CHECK (currency IN ('B','D')),
    CHECK (type IN ('entrada','salida','ajuste_positivo','ajuste_negativo','devolucion_entrada','devolucion_salida','autoconsumo'))
);

CREATE INDEX IF NOT EXISTS shared_inventory_products_company_idx ON public.shared_inventory_products(tenant_id,company_id,active);
CREATE INDEX IF NOT EXISTS shared_inventory_products_code_idx ON public.shared_inventory_products(tenant_id,company_id,code);
CREATE INDEX IF NOT EXISTS shared_inventory_movements_company_period_idx ON public.shared_inventory_movements(tenant_id,company_id,period,date DESC);
CREATE INDEX IF NOT EXISTS shared_inventory_movements_product_idx ON public.shared_inventory_movements(tenant_id,product_id,date DESC);

ALTER TABLE public.shared_inventory_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shared_inventory_products_member_access ON public.shared_inventory_products;
CREATE POLICY shared_inventory_products_member_access ON public.shared_inventory_products FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_products.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL))
WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_products.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL));

DROP POLICY IF EXISTS shared_inventory_movements_member_access ON public.shared_inventory_movements;
CREATE POLICY shared_inventory_movements_member_access ON public.shared_inventory_movements FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_movements.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL))
WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_movements.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL));

DO $$
DECLARE t record;
BEGIN
    FOR t IN SELECT id,schema_name FROM public.tenants LOOP
        EXECUTE format($sql$
            INSERT INTO public.shared_inventory_products
              (tenant_id,id,company_id,code,name,description,type,measure_unit,valuation_method,current_stock,average_cost,active,created_at,updated_at,department_id,vat_type,default_currency,custom_fields)
            SELECT %L::uuid,p.id,p.empresa_id,p.codigo,p.nombre,p.descripcion,p.tipo,p.unidad_medida,p.metodo_valuacion,p.existencia_actual,p.costo_promedio,p.activo,p.created_at,p.updated_at,p.departamento_id,p.iva_tipo,p.moneda_defecto,p.custom_fields
            FROM %I.inventario_productos p
            JOIN public.shared_companies c ON c.tenant_id=%L::uuid AND c.id=p.empresa_id
            ON CONFLICT (tenant_id,id) DO NOTHING
        $sql$,t.id,t.schema_name,t.id);
        EXECUTE format($sql$
            INSERT INTO public.shared_inventory_movements
              (tenant_id,id,company_id,product_id,type,date,period,quantity,unit_cost,total_cost,balance_quantity,reference,notes,created_at,balance_value,currency,currency_cost,dollar_rate,purchase_invoice_id,discount_type,discount_value,discount_amount,surcharge_type,surcharge_value,surcharge_amount,tax_type,tax_value,tax_amount,tax_concept,vat_base,sale_price_unit)
            SELECT %L::uuid,m.id,m.empresa_id,m.producto_id,m.tipo,m.fecha,m.periodo,m.cantidad,m.costo_unitario,m.costo_total,m.saldo_cantidad,m.referencia,m.notas,m.created_at,m.saldo_valor,m.moneda,m.costo_moneda,m.tasa_dolar,m.factura_compra_id,m.descuento_tipo,m.descuento_valor,m.descuento_monto,m.recargo_tipo,m.recargo_valor,m.recargo_monto,m.impuesto_tipo,m.impuesto_valor,m.impuesto_monto,m.impuesto_concepto,m.base_iva,m.precio_venta_unitario
            FROM %I.inventario_movimientos m
            JOIN public.shared_inventory_products p ON p.tenant_id=%L::uuid AND p.id=m.producto_id
            ON CONFLICT (tenant_id,id) DO NOTHING
        $sql$,t.id,t.schema_name,t.id);
    END LOOP;
END $$;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.shared_inventory_products TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.shared_inventory_movements TO authenticated;
