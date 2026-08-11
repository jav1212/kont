-- Normalize the legacy B/D movement contract at the database boundary.
-- Shared movement rows store ISO currency codes after migration 188, while
-- older callers can still send B/D until their UI contracts are migrated.

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
    v_currency text := case upper(btrim(coalesce(p_row->>'moneda','')))
        when '' then 'VES'
        when 'B' then 'VES'
        when 'D' then 'USD'
        else upper(btrim(p_row->>'moneda'))
    end;
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
         v_currency,nullif(p_row->>'costo_moneda','')::numeric,nullif(p_row->>'tasa_dolar','')::numeric,
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

revoke execute on function public.shared_inventory_movement_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.shared_inventory_movement_save(uuid,jsonb) to service_role;
