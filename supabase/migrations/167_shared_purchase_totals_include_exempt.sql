-- Recalculate shared purchase invoice totals from their item lines.
-- Exempt lines participate in subtotal and total, but never in VAT.

create or replace function public.shared_inventory_purchase_invoice_recalculate_totals(
    p_tenant_id uuid,
    p_invoice_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_subtotal numeric(14,2);
    v_vat_amount numeric(14,2);
    v_total numeric(14,2);
    v_extra_taxes numeric(14,2);
begin
    select
        coalesce(sum(coalesce(i.vat_base, i.total_cost)), 0),
        coalesce(sum(
            coalesce(i.vat_base, i.total_cost) * case i.vat_rate
                when 'reducida_8' then 8
                when 'general_16' then 16
                else 0
            end / 100
        ), 0)
    into v_subtotal, v_vat_amount
    from public.shared_inventory_purchase_invoice_items i
    where i.tenant_id = p_tenant_id
      and i.invoice_id = p_invoice_id;

    -- Keep additional invoice-level taxes in the persisted total when they
    -- are present. Retentions are post-IVA and therefore do not reduce the
    -- fiscal invoice total.
    select coalesce(sum(coalesce(nullif(t->>'monto', '')::numeric, 0)), 0)
    into v_extra_taxes
    from public.shared_inventory_purchase_invoices f
    cross join lateral jsonb_array_elements(coalesce(f.taxes, '[]'::jsonb)) t
    where f.tenant_id = p_tenant_id
      and f.id = p_invoice_id;

    v_total := v_subtotal + v_vat_amount + v_extra_taxes;

    update public.shared_inventory_purchase_invoices
    set subtotal = round(v_subtotal, 2),
        vat_amount = round(v_vat_amount, 2),
        total = round(v_total, 2),
        updated_at = now()
    where tenant_id = p_tenant_id
      and id = p_invoice_id;
end;
$$;

create or replace function public.shared_inventory_purchase_invoice_impute_items(
    p_tenant_id uuid,
    p_invoice_id text,
    p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_invoice record;
    v_item jsonb;
    v_item_id text;
    v_net numeric(14,2);
    v_unit numeric(14,4);
    v_ratio numeric;
    v_movement jsonb;
begin
    select * into v_invoice
    from public.shared_inventory_purchase_invoices
    where tenant_id = p_tenant_id and id = p_invoice_id
    for update;

    if v_invoice is null then raise exception 'Purchase invoice not found'; end if;
    if v_invoice.status <> 'confirmada' then raise exception 'Only confirmed invoices can receive items'; end if;
    if exists (
        select 1 from public.shared_inventory_purchase_invoice_items
        where tenant_id = p_tenant_id and invoice_id = p_invoice_id
    ) then
        raise exception 'Purchase invoice already has items';
    end if;
    if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
        raise exception 'At least one purchase item is required';
    end if;

    for v_item in select value from jsonb_array_elements(p_items) loop
        if not exists (
            select 1 from public.shared_inventory_products
            where tenant_id = p_tenant_id and id = v_item->>'producto_id' and company_id = v_invoice.company_id
        ) then
            raise exception 'Product does not belong to invoice company';
        end if;
        if coalesce(nullif(v_item->>'cantidad', '')::numeric, 0) <= 0 then
            raise exception 'Purchase item quantity must be positive';
        end if;

        v_item_id := coalesce(nullif(v_item->>'id', ''), gen_random_uuid()::text);
        insert into public.shared_inventory_purchase_invoice_items (
            tenant_id, id, invoice_id, product_id, quantity, unit_cost, total_cost,
            vat_rate, currency, currency_cost, dollar_rate, discount_type, discount_value,
            discount_amount, surcharge_type, surcharge_value, surcharge_amount, vat_base,
            vat_included, tax_type, tax_value, tax_amount, tax_concept
        ) values (
            p_tenant_id, v_item_id, p_invoice_id, v_item->>'producto_id',
            (v_item->>'cantidad')::numeric, coalesce(nullif(v_item->>'costo_unitario', '')::numeric, 0),
            coalesce(nullif(v_item->>'costo_total', '')::numeric, 0),
            coalesce(nullif(v_item->>'iva_alicuota', ''), 'general_16'),
            coalesce(nullif(v_item->>'moneda', ''), 'B'),
            nullif(v_item->>'costo_moneda', '')::numeric, nullif(v_item->>'tasa_dolar', '')::numeric,
            nullif(v_item->>'descuento_tipo', ''), nullif(v_item->>'descuento_valor', '')::numeric,
            nullif(v_item->>'descuento_monto', '')::numeric,
            nullif(v_item->>'recargo_tipo', ''), nullif(v_item->>'recargo_valor', '')::numeric,
            nullif(v_item->>'recargo_monto', '')::numeric,
            nullif(v_item->>'base_iva', '')::numeric,
            coalesce(nullif(v_item->>'iva_incluido', '')::boolean, false),
            nullif(v_item->>'impuesto_tipo', ''), nullif(v_item->>'impuesto_valor', '')::numeric,
            nullif(v_item->>'impuesto_monto', '')::numeric, nullif(v_item->>'impuesto_concepto', '')
        );

        v_net := coalesce(nullif(v_item->>'base_iva', '')::numeric, nullif(v_item->>'costo_total', '')::numeric, 0);
        v_unit := v_net / (v_item->>'cantidad')::numeric;
        v_ratio := case when nullif(v_item->>'costo_total', '')::numeric <> 0
            then v_net / (v_item->>'costo_total')::numeric else 1 end;
        v_movement := public.shared_inventory_movement_save(
            p_tenant_id,
            jsonb_build_object(
                'id', gen_random_uuid()::text,
                'empresa_id', v_invoice.company_id,
                'producto_id', v_item->>'producto_id',
                'tipo', 'entrada',
                'fecha', v_invoice.invoice_date::text,
                'cantidad', v_item->>'cantidad',
                'costo_unitario', v_unit,
                'moneda', coalesce(nullif(v_item->>'moneda', ''), 'B'),
                'costo_moneda', case when v_item->>'costo_moneda' is null then null else (v_item->>'costo_moneda')::numeric * v_ratio end,
                'tasa_dolar', nullif(v_item->>'tasa_dolar', '')::numeric,
                'referencia', v_invoice.invoice_number,
                'base_iva', v_net,
                'factura_compra_id', p_invoice_id
            )
        );
        update public.shared_inventory_movements
        set purchase_invoice_id = p_invoice_id
        where tenant_id = p_tenant_id and id = v_movement->>'id';
    end loop;

    perform public.shared_inventory_purchase_invoice_recalculate_totals(p_tenant_id, p_invoice_id);

    return (
        select row_to_json(i)::jsonb
        from public.shared_inventory_purchase_invoices i
        where i.tenant_id = p_tenant_id and i.id = p_invoice_id
    );
end;
$$;

revoke all on function public.shared_inventory_purchase_invoice_recalculate_totals(uuid, text) from public, anon, authenticated;
grant execute on function public.shared_inventory_purchase_invoice_recalculate_totals(uuid, text) to service_role;
