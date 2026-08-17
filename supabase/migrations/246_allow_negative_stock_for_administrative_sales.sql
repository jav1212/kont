-- Administrative sales, like POS sales, may be confirmed before the physical
-- inventory balance is reconciled. The caller must still opt in explicitly;
-- other outbound inventory operations retain their existing stock guards.

create or replace function public.shared_inventory_sales_invoice_confirm(
    p_tenant_id uuid,
    p_invoice_id text,
    p_allow_negative_stock boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_invoice record;
    v_item record;
    v_product record;
    v_move jsonb;
    v_negative_allowed boolean;
begin
    select * into v_invoice
    from public.shared_inventory_sales_invoices
    where tenant_id=p_tenant_id and id=p_invoice_id
    for update;

    if v_invoice is null then raise exception 'Sales invoice not found'; end if;
    if v_invoice.status <> 'borrador' then raise exception 'Sales invoice is not a draft'; end if;

    v_negative_allowed := p_allow_negative_stock;

    for v_item in
        select * from public.shared_inventory_sales_invoice_items
        where tenant_id=p_tenant_id and invoice_id=p_invoice_id
        order by id
    loop
        if v_item.product_id is not null then
            select * into v_product
            from public.shared_inventory_products
            where tenant_id=p_tenant_id and id=v_item.product_id
            for update;

            if v_product is null or v_product.company_id <> v_invoice.company_id then
                raise exception 'Product does not belong to invoice company';
            end if;
            if not v_negative_allowed and v_product.current_stock < v_item.quantity then
                raise exception 'Insufficient stock for product %', v_item.product_id;
            end if;

            v_move := public.shared_inventory_movement_save(p_tenant_id,jsonb_build_object(
                'id',gen_random_uuid()::text,
                'empresa_id',v_invoice.company_id,
                'producto_id',v_item.product_id,
                'tipo','salida',
                'fecha',v_invoice.invoice_date::text,
                'cantidad',v_item.quantity,
                'costo_unitario',v_item.unit_price,
                'moneda',v_item.currency,
                'costo_moneda',v_item.currency_price,
                'tasa_dolar',v_item.dollar_rate,
                'referencia',v_invoice.invoice_number,
                'base_iva',v_item.vat_base,
                'precio_venta_unitario',v_item.unit_price,
                'factura_venta_id',p_invoice_id
            ));
        end if;
    end loop;

    update public.shared_inventory_sales_invoices
    set status='confirmada',confirmed_at=now(),updated_at=now()
    where tenant_id=p_tenant_id and id=p_invoice_id;

    return (select row_to_json(i)::jsonb from public.shared_inventory_sales_invoices i
        where i.tenant_id=p_tenant_id and i.id=p_invoice_id);
end;
$$;

revoke execute on function public.shared_inventory_sales_invoice_confirm(uuid,text,boolean)
    from public,anon,authenticated;
grant execute on function public.shared_inventory_sales_invoice_confirm(uuid,text,boolean)
    to service_role;
