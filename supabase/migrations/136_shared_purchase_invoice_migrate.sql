-- 136_shared_purchase_invoice_migrate.sql
-- Same-tenant purchase invoice migration with shared-schema safeguards.

CREATE OR REPLACE FUNCTION public.shared_inventory_purchase_invoice_migrate(
    p_tenant_id uuid,
    p_invoice_ids text[],
    p_target_company_id text,
    p_target_period text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice_id text;
    v_invoice record;
    v_source_company_id text;
    v_was_confirmed boolean;
    v_target_period text;
    v_target_supplier_id text;
    v_target_product_id text;
    v_supplier record;
    v_product record;
    v_item record;
    v_closed boolean;
    v_supplier_map jsonb := '{}'::jsonb;
    v_product_map jsonb := '{}'::jsonb;
    v_migrated jsonb := '[]'::jsonb;
    v_skipped jsonb := '[]'::jsonb;
    v_created_suppliers jsonb := '[]'::jsonb;
    v_created_products jsonb := '[]'::jsonb;
BEGIN
    IF p_invoice_ids IS NULL OR array_length(p_invoice_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'No purchase invoices were provided';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.shared_companies
        WHERE tenant_id = p_tenant_id AND id = p_target_company_id
    ) THEN
        RAISE EXCEPTION 'Target company does not belong to tenant';
    END IF;
    IF p_target_period IS NOT NULL AND p_target_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
        RAISE EXCEPTION 'Target period must use YYYY-MM format';
    END IF;

    FOREACH v_invoice_id IN ARRAY p_invoice_ids LOOP
        SELECT * INTO v_invoice
        FROM public.shared_inventory_purchase_invoices
        WHERE tenant_id = p_tenant_id AND id = v_invoice_id
        FOR UPDATE;

        IF v_invoice IS NULL THEN RAISE EXCEPTION 'Purchase invoice % not found', v_invoice_id; END IF;
        IF v_invoice.company_id = p_target_company_id THEN
            v_skipped := v_skipped || jsonb_build_object('id', v_invoice_id, 'reason', 'already-in-target');
            CONTINUE;
        END IF;

        v_source_company_id := v_invoice.company_id;
        v_target_period := COALESCE(NULLIF(p_target_period, ''), v_invoice.period);

        SELECT EXISTS (
            SELECT 1 FROM public.shared_inventory_closures
            WHERE tenant_id = p_tenant_id AND company_id IN (v_source_company_id, p_target_company_id)
              AND period = v_target_period
        ) INTO v_closed;
        IF v_closed THEN RAISE EXCEPTION 'Period % is closed for purchase invoice %', v_target_period, v_invoice_id; END IF;

        v_was_confirmed := v_invoice.status = 'confirmada';
        IF v_was_confirmed THEN
            PERFORM public.shared_inventory_purchase_invoice_unconfirm(p_tenant_id, v_invoice_id);
        END IF;

        IF v_supplier_map ? v_invoice.supplier_id THEN
            v_target_supplier_id := v_supplier_map->>v_invoice.supplier_id;
        ELSE
            SELECT * INTO v_supplier
            FROM public.shared_inventory_suppliers
            WHERE tenant_id = p_tenant_id AND id = v_invoice.supplier_id AND company_id = v_source_company_id;
            IF v_supplier IS NULL THEN RAISE EXCEPTION 'Supplier % not found', v_invoice.supplier_id; END IF;

            SELECT id INTO v_target_supplier_id
            FROM public.shared_inventory_suppliers
            WHERE tenant_id = p_tenant_id AND company_id = p_target_company_id
              AND ((NULLIF(trim(v_supplier.rif), '') IS NOT NULL AND lower(trim(rif)) = lower(trim(v_supplier.rif)))
                OR (NULLIF(trim(v_supplier.rif), '') IS NULL AND lower(trim(name)) = lower(trim(v_supplier.name))))
            LIMIT 1;

            IF v_target_supplier_id IS NULL THEN
                v_target_supplier_id := gen_random_uuid()::text;
                INSERT INTO public.shared_inventory_suppliers
                    (tenant_id,id,company_id,rif,name,contact,phone,email,address,notes,active)
                VALUES
                    (p_tenant_id,v_target_supplier_id,p_target_company_id,v_supplier.rif,v_supplier.name,
                     v_supplier.contact,v_supplier.phone,v_supplier.email,v_supplier.address,v_supplier.notes,true);
                v_created_suppliers := v_created_suppliers || jsonb_build_object(
                    'id', v_target_supplier_id, 'rif', v_supplier.rif, 'nombre', v_supplier.name);
            END IF;
            v_supplier_map := v_supplier_map || jsonb_build_object(v_invoice.supplier_id, v_target_supplier_id);
        END IF;

        FOR v_item IN
            SELECT i.* FROM public.shared_inventory_purchase_invoice_items i
            WHERE i.tenant_id = p_tenant_id AND i.invoice_id = v_invoice_id
        LOOP
            IF v_product_map ? v_item.product_id THEN
                v_target_product_id := v_product_map->>v_item.product_id;
            ELSE
                SELECT * INTO v_product
                FROM public.shared_inventory_products
                WHERE tenant_id = p_tenant_id AND id = v_item.product_id AND company_id = v_source_company_id;
                IF v_product IS NULL THEN RAISE EXCEPTION 'Product % not found', v_item.product_id; END IF;

                SELECT id INTO v_target_product_id
                FROM public.shared_inventory_products
                WHERE tenant_id = p_tenant_id AND company_id = p_target_company_id
                  AND ((NULLIF(trim(v_product.code), '') IS NOT NULL AND lower(trim(code)) = lower(trim(v_product.code)))
                    OR (NULLIF(trim(v_product.code), '') IS NULL AND lower(trim(name)) = lower(trim(v_product.name))))
                LIMIT 1;

                IF v_target_product_id IS NULL THEN
                    v_target_product_id := gen_random_uuid()::text;
                    INSERT INTO public.shared_inventory_products
                        (tenant_id,id,company_id,code,name,description,type,measure_unit,valuation_method,
                         current_stock,average_cost,active,department_id,vat_type,default_currency,custom_fields)
                    VALUES
                        (p_tenant_id,v_target_product_id,p_target_company_id,v_product.code,v_product.name,
                         v_product.description,v_product.type,v_product.measure_unit,v_product.valuation_method,
                         0,0,true,NULL,v_product.vat_type,v_product.default_currency,v_product.custom_fields);
                    v_created_products := v_created_products || jsonb_build_object(
                        'id', v_target_product_id, 'codigo', v_product.code, 'nombre', v_product.name);
                END IF;
                v_product_map := v_product_map || jsonb_build_object(v_item.product_id, v_target_product_id);
            END IF;

            UPDATE public.shared_inventory_purchase_invoice_items
            SET product_id = v_target_product_id
            WHERE tenant_id = p_tenant_id AND id = v_item.id;
        END LOOP;

        UPDATE public.shared_inventory_purchase_invoices
        SET company_id = p_target_company_id,
            supplier_id = v_target_supplier_id,
            period = v_target_period,
            manual_period = p_target_period IS NOT NULL,
            updated_at = now()
        WHERE tenant_id = p_tenant_id AND id = v_invoice_id;

        IF v_was_confirmed THEN
            PERFORM public.shared_inventory_purchase_invoice_confirm(p_tenant_id, v_invoice_id);
        END IF;

        v_migrated := v_migrated || jsonb_build_object(
            'id', v_invoice_id,
            'source_empresa_id', v_source_company_id,
            'target_empresa_id', p_target_company_id,
            'was_confirmed', v_was_confirmed,
            'fecha', v_invoice.invoice_date,
            'periodo', v_target_period,
            'subtotal', v_invoice.subtotal,
            'iva_monto', v_invoice.vat_amount,
            'total', v_invoice.total
        );
    END LOOP;

    RETURN jsonb_build_object(
        'migrated', v_migrated,
        'skipped', v_skipped,
        'created_suppliers', v_created_suppliers,
        'created_products', v_created_products
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.shared_inventory_purchase_invoice_migrate(uuid,text[],text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_inventory_purchase_invoice_migrate(uuid,text[],text,text) TO service_role;
