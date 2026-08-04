-- 127_shared_inventory_movement_save.sql
-- Atomic movement write: tenant scope, product lock, stock and weighted cost update.

CREATE OR REPLACE FUNCTION public.shared_inventory_movement_save(
    p_tenant_id uuid,
    p_row jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id text := COALESCE(NULLIF(p_row->>'id',''), gen_random_uuid()::text);
    v_company_id text := p_row->>'empresa_id';
    v_product_id text := p_row->>'producto_id';
    v_type text := p_row->>'tipo';
    v_date date := COALESCE(NULLIF(p_row->>'fecha',''), CURRENT_DATE::text)::date;
    v_quantity numeric(14,4) := COALESCE(NULLIF(p_row->>'cantidad',''), '0')::numeric;
    v_input_unit_cost numeric(14,4) := COALESCE(NULLIF(p_row->>'costo_unitario',''), '0')::numeric;
    v_previous_quantity numeric(14,4);
    v_previous_average numeric(14,4);
    v_unit_cost numeric(14,4);
    v_total_cost numeric(14,2);
    v_balance_quantity numeric(14,4);
    v_new_average numeric(14,4);
    v_result jsonb;
    v_outbound boolean := v_type IN ('salida','autoconsumo','ajuste_negativo','devolucion_entrada');
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.shared_companies WHERE tenant_id=p_tenant_id AND id=v_company_id) THEN
        RAISE EXCEPTION 'Company does not belong to tenant';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.shared_inventory_products WHERE tenant_id=p_tenant_id AND id=v_product_id AND company_id=v_company_id) THEN
        RAISE EXCEPTION 'Product does not belong to tenant company';
    END IF;
    IF v_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;

    SELECT current_stock, average_cost INTO v_previous_quantity, v_previous_average
    FROM public.shared_inventory_products
    WHERE tenant_id=p_tenant_id AND id=v_product_id
    FOR UPDATE;

    v_previous_quantity := COALESCE(v_previous_quantity,0);
    v_previous_average := COALESCE(v_previous_average,0);
    IF v_outbound THEN
        v_unit_cost := v_previous_average;
        v_total_cost := ROUND(v_quantity * v_unit_cost, 2);
        v_balance_quantity := GREATEST(0, v_previous_quantity - v_quantity);
        v_new_average := v_previous_average;
    ELSE
        v_unit_cost := v_input_unit_cost;
        v_total_cost := ROUND(v_quantity * v_unit_cost, 2);
        v_balance_quantity := v_previous_quantity + v_quantity;
        v_new_average := CASE WHEN v_balance_quantity > 0
            THEN ROUND((v_previous_quantity*v_previous_average + v_quantity*v_unit_cost)/v_balance_quantity,4)
            ELSE v_unit_cost END;
    END IF;

    INSERT INTO public.shared_inventory_movements
        (tenant_id,id,company_id,product_id,type,date,period,quantity,unit_cost,total_cost,balance_quantity,
         currency,currency_cost,dollar_rate,reference,notes,discount_type,discount_value,discount_amount,
         surcharge_type,surcharge_value,surcharge_amount,vat_base,sale_price_unit)
    VALUES
        (p_tenant_id,v_id,v_company_id,v_product_id,v_type,v_date,to_char(v_date,'YYYY-MM'),v_quantity,v_unit_cost,v_total_cost,v_balance_quantity,
         COALESCE(NULLIF(p_row->>'moneda',''),'B'),NULLIF(p_row->>'costo_moneda','')::numeric,NULLIF(p_row->>'tasa_dolar','')::numeric,
         COALESCE(p_row->>'referencia',''),COALESCE(p_row->>'notas',''),NULLIF(p_row->>'descuento_tipo',''),COALESCE(NULLIF(p_row->>'descuento_valor','')::numeric,0),COALESCE(NULLIF(p_row->>'descuento_monto','')::numeric,0),
         NULLIF(p_row->>'recargo_tipo',''),COALESCE(NULLIF(p_row->>'recargo_valor','')::numeric,0),COALESCE(NULLIF(p_row->>'recargo_monto','')::numeric,0),
         COALESCE(NULLIF(p_row->>'base_iva','')::numeric,v_total_cost),NULLIF(p_row->>'precio_venta_unitario','')::numeric)
    RETURNING row_to_json(shared_inventory_movements)::jsonb INTO v_result;

    UPDATE public.shared_inventory_products
    SET current_stock=v_balance_quantity, average_cost=v_new_average, updated_at=now()
    WHERE tenant_id=p_tenant_id AND id=v_product_id;

    RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.shared_inventory_movement_save(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_inventory_movement_save(uuid,jsonb) TO service_role;
