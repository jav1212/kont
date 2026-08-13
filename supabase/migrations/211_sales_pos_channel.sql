-- POS sales share the legal sales invoice workflow, but may intentionally sell
-- through zero stock. Administrative invoices keep the stricter stock guard.

alter table public.shared_inventory_sales_invoices
    add column if not exists sales_channel text not null default 'administrative'
    check (sales_channel in ('administrative', 'pos'));

create index if not exists shared_sales_invoices_channel_idx
    on public.shared_inventory_sales_invoices(tenant_id, company_id, sales_channel, invoice_date);

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

    v_negative_allowed := p_allow_negative_stock and v_invoice.sales_channel = 'pos';

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

create or replace function public.shared_inventory_sales_invoice_unconfirm(
    p_tenant_id uuid, p_invoice_id text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_invoice record;
    v_product record;
    v_move record;
    v_stock numeric(14,4);
    v_average numeric(14,4);
    v_next_stock numeric(14,4);
    v_next_average numeric(14,4);
begin
    select * into v_invoice from public.shared_inventory_sales_invoices
    where tenant_id=p_tenant_id and id=p_invoice_id for update;
    if v_invoice is null then raise exception 'Sales invoice not found'; end if;
    if v_invoice.status <> 'confirmada' then raise exception 'Sales invoice is not confirmed'; end if;

    create temp table if not exists _shared_sales_rebuild_products(product_id text primary key) on commit drop;
    truncate _shared_sales_rebuild_products;
    insert into _shared_sales_rebuild_products
        select distinct product_id from public.shared_inventory_movements
        where tenant_id=p_tenant_id and sales_invoice_id=p_invoice_id
        on conflict do nothing;
    delete from public.shared_inventory_movements
        where tenant_id=p_tenant_id and sales_invoice_id=p_invoice_id;

    for v_product in
        select p.* from public.shared_inventory_products p
        join _shared_sales_rebuild_products r on r.product_id=p.id
        where p.tenant_id=p_tenant_id for update
    loop
        v_stock:=0; v_average:=0;
        for v_move in
            select * from public.shared_inventory_movements
            where tenant_id=p_tenant_id and product_id=v_product.id
            order by date,created_at,id
        loop
            if v_move.type in ('entrada','ajuste_positivo','devolucion_salida') then
                v_next_stock:=v_stock+v_move.quantity;
                v_next_average:=case when v_next_stock>0
                    then ((v_stock*v_average)+v_move.total_cost)/v_next_stock else v_move.unit_cost end;
            else
                v_next_stock:=v_stock-v_move.quantity;
                v_next_average:=v_average;
            end if;
            update public.shared_inventory_movements set balance_quantity=v_next_stock
                where tenant_id=p_tenant_id and id=v_move.id;
            v_stock:=v_next_stock; v_average:=v_next_average;
        end loop;
        update public.shared_inventory_products
        set current_stock=v_stock,average_cost=v_average,updated_at=now()
        where tenant_id=p_tenant_id and id=v_product.id;
    end loop;

    update public.shared_inventory_sales_invoices
    set status='borrador',confirmed_at=null,updated_at=now()
    where tenant_id=p_tenant_id and id=p_invoice_id;
    return (select row_to_json(i)::jsonb from public.shared_inventory_sales_invoices i
        where i.tenant_id=p_tenant_id and i.id=p_invoice_id);
end;
$$;

revoke execute on function public.shared_inventory_sales_invoice_confirm(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.shared_inventory_sales_invoice_confirm(uuid,text,boolean) to service_role;
