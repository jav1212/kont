-- Keep invoice references in the movement insert and avoid redundant updates
-- during purchase/sales invoice confirmation.

create or replace function public.shared_inventory_movement_save(
    p_tenant_id uuid,
    p_row jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id text := coalesce(nullif(p_row->>'id',''), gen_random_uuid()::text);
    v_company_id text := p_row->>'empresa_id';
    v_product_id text := p_row->>'producto_id';
    v_type text := p_row->>'tipo';
    v_date date := coalesce(nullif(p_row->>'fecha',''), current_date::text)::date;
    v_quantity numeric(14,4) := coalesce(nullif(p_row->>'cantidad',''), '0')::numeric;
    v_input_unit_cost numeric(14,4) := coalesce(nullif(p_row->>'costo_unitario',''), '0')::numeric;
    v_previous_quantity numeric(14,4);
    v_previous_average numeric(14,4);
    v_unit_cost numeric(14,4);
    v_total_cost numeric(14,2);
    v_balance_quantity numeric(14,4);
    v_new_average numeric(14,4);
    v_result jsonb;
    v_outbound boolean := v_type in ('salida','autoconsumo','ajuste_negativo','devolucion_entrada');
begin
    if not exists (select 1 from public.shared_companies where tenant_id=p_tenant_id and id=v_company_id) then
        raise exception 'Company does not belong to tenant';
    end if;
    if not exists (select 1 from public.shared_inventory_products where tenant_id=p_tenant_id and id=v_product_id and company_id=v_company_id) then
        raise exception 'Product does not belong to tenant company';
    end if;
    if v_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;

    select current_stock, average_cost into v_previous_quantity, v_previous_average
    from public.shared_inventory_products
    where tenant_id=p_tenant_id and id=v_product_id
    for update;

    v_previous_quantity := coalesce(v_previous_quantity,0);
    v_previous_average := coalesce(v_previous_average,0);
    if v_outbound then
        v_unit_cost := v_previous_average;
        v_total_cost := round(v_quantity * v_unit_cost, 2);
        v_balance_quantity := greatest(0, v_previous_quantity - v_quantity);
        v_new_average := v_previous_average;
    else
        v_unit_cost := v_input_unit_cost;
        v_total_cost := round(v_quantity * v_unit_cost, 2);
        v_balance_quantity := v_previous_quantity + v_quantity;
        v_new_average := case when v_balance_quantity > 0
            then round((v_previous_quantity*v_previous_average + v_quantity*v_unit_cost)/v_balance_quantity,4)
            else v_unit_cost end;
    end if;

    insert into public.shared_inventory_movements
        (tenant_id,id,company_id,product_id,type,date,period,quantity,unit_cost,total_cost,balance_quantity,
         currency,currency_cost,dollar_rate,reference,notes,discount_type,discount_value,discount_amount,
         surcharge_type,surcharge_value,surcharge_amount,vat_base,sale_price_unit,purchase_invoice_id,sales_invoice_id)
    values
        (p_tenant_id,v_id,v_company_id,v_product_id,v_type,v_date,to_char(v_date,'YYYY-MM'),v_quantity,v_unit_cost,v_total_cost,v_balance_quantity,
         coalesce(nullif(p_row->>'moneda',''),'B'),nullif(p_row->>'costo_moneda','')::numeric,nullif(p_row->>'tasa_dolar','')::numeric,
         coalesce(p_row->>'referencia',''),coalesce(p_row->>'notas',''),nullif(p_row->>'descuento_tipo',''),coalesce(nullif(p_row->>'descuento_valor','')::numeric,0),coalesce(nullif(p_row->>'descuento_monto','')::numeric,0),
         nullif(p_row->>'recargo_tipo',''),coalesce(nullif(p_row->>'recargo_valor','')::numeric,0),coalesce(nullif(p_row->>'recargo_monto','')::numeric,0),
         coalesce(nullif(p_row->>'base_iva','')::numeric,v_total_cost),nullif(p_row->>'precio_venta_unitario','')::numeric,
         nullif(p_row->>'factura_compra_id',''),nullif(p_row->>'factura_venta_id',''))
    returning row_to_json(shared_inventory_movements)::jsonb into v_result;

    update public.shared_inventory_products
    set current_stock=v_balance_quantity, average_cost=v_new_average, updated_at=now()
    where tenant_id=p_tenant_id and id=v_product_id;

    return v_result;
end;
$$;

create or replace function public.shared_inventory_purchase_invoice_confirm(
    p_tenant_id uuid,
    p_invoice_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_invoice record;
    v_item record;
    v_movement jsonb;
    v_net numeric(14,2);
    v_unit numeric(14,4);
    v_ratio numeric;
begin
    select * into v_invoice
    from public.shared_inventory_purchase_invoices
    where tenant_id = p_tenant_id and id = p_invoice_id
    for update;

    if v_invoice is null then raise exception 'Purchase invoice not found'; end if;
    if v_invoice.status = 'confirmada' then raise exception 'Purchase invoice is already confirmed'; end if;

    for v_item in
        select * from public.shared_inventory_purchase_invoice_items
        where tenant_id = p_tenant_id and invoice_id = p_invoice_id
        order by id
    loop
        v_net := coalesce(nullif(v_item.vat_base, 0), v_item.total_cost);
        if v_item.quantity <= 0 then raise exception 'Purchase item quantity must be positive'; end if;
        v_unit := v_net / v_item.quantity;
        v_ratio := case when v_item.total_cost <> 0 then v_net / v_item.total_cost else 1 end;

        v_movement := public.shared_inventory_movement_save(
            p_tenant_id,
            jsonb_build_object(
                'id', gen_random_uuid()::text,
                'empresa_id', v_invoice.company_id,
                'producto_id', v_item.product_id,
                'tipo', 'entrada',
                'fecha', v_invoice.invoice_date::text,
                'cantidad', v_item.quantity,
                'costo_unitario', v_unit,
                'moneda', v_item.currency,
                'costo_moneda', case when v_item.currency_cost is null then null else v_item.currency_cost * v_ratio end,
                'tasa_dolar', v_item.dollar_rate,
                'referencia', v_invoice.invoice_number,
                'base_iva', v_net,
                'factura_compra_id', p_invoice_id
            )
        );
    end loop;

    update public.shared_inventory_purchase_invoices
    set status = 'confirmada', confirmed_at = now(), updated_at = now()
    where tenant_id = p_tenant_id and id = p_invoice_id;

    return (
        select row_to_json(i)::jsonb
        from public.shared_inventory_purchase_invoices i
        where i.tenant_id = p_tenant_id and i.id = p_invoice_id
    );
end;
$$;

create or replace function public.shared_inventory_sales_invoice_confirm(
    p_tenant_id uuid,
    p_invoice_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_invoice record;
    v_item record;
    v_product record;
    v_movement jsonb;
begin
    select * into v_invoice from public.shared_inventory_sales_invoices where tenant_id=p_tenant_id and id=p_invoice_id for update;
    if v_invoice is null then raise exception 'Sales invoice not found'; end if;
    if v_invoice.status <> 'borrador' then raise exception 'Sales invoice is not a draft'; end if;

    for v_item in select * from public.shared_inventory_sales_invoice_items where tenant_id=p_tenant_id and invoice_id=p_invoice_id order by id loop
        if v_item.product_id is not null then
            select * into v_product from public.shared_inventory_products where tenant_id=p_tenant_id and id=v_item.product_id for update;
            if v_product is null or v_product.company_id <> v_invoice.company_id then raise exception 'Product does not belong to invoice company'; end if;
            if v_product.current_stock < v_item.quantity then raise exception 'Insufficient stock for product %', v_item.product_id; end if;
            v_movement := public.shared_inventory_movement_save(p_tenant_id,jsonb_build_object(
                'id',gen_random_uuid()::text,'empresa_id',v_invoice.company_id,'producto_id',v_item.product_id,'tipo','salida',
                'fecha',v_invoice.invoice_date::text,'cantidad',v_item.quantity,'costo_unitario',v_item.unit_price,
                'moneda',v_item.currency,'costo_moneda',v_item.currency_price,'tasa_dolar',v_item.dollar_rate,
                'referencia',v_invoice.invoice_number,'base_iva',v_item.vat_base,'factura_venta_id',p_invoice_id));
        end if;
    end loop;

    update public.shared_inventory_sales_invoices set status='confirmada',confirmed_at=now(),updated_at=now()
    where tenant_id=p_tenant_id and id=p_invoice_id;
    return (select row_to_json(i)::jsonb from public.shared_inventory_sales_invoices i where i.tenant_id=p_tenant_id and i.id=p_invoice_id);
end;
$$;
