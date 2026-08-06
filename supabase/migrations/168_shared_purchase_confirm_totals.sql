-- Enforce the same item-derived totals when a purchase is confirmed.
-- 167 also covers post-confirmation item imputation.

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
    v_movement_type text;
begin
    select * into v_invoice from public.shared_inventory_purchase_invoices
    where tenant_id = p_tenant_id and id = p_invoice_id for update;
    if v_invoice is null then raise exception 'Purchase invoice not found'; end if;
    if v_invoice.status = 'confirmada' then raise exception 'Purchase invoice is already confirmed'; end if;

    v_movement_type := case when coalesce(v_invoice.document_type, 'factura') = 'nota_credito'
        and v_invoice.inventory_effect = 'return_to_supplier' then 'devolucion_entrada' else 'entrada' end;

    if coalesce(v_invoice.inventory_effect, 'additional_purchase') <> 'none' then
      for v_item in select * from public.shared_inventory_purchase_invoice_items
        where tenant_id = p_tenant_id and invoice_id = p_invoice_id order by id loop
        v_net := coalesce(nullif(v_item.vat_base, 0), v_item.total_cost);
        if v_item.quantity <= 0 then raise exception 'Purchase item quantity must be positive'; end if;
        v_unit := v_net / v_item.quantity;
        v_ratio := case when v_item.total_cost <> 0 then v_net / v_item.total_cost else 1 end;
        v_movement := public.shared_inventory_movement_save(p_tenant_id, jsonb_build_object(
            'id', gen_random_uuid()::text, 'empresa_id', v_invoice.company_id,
            'producto_id', v_item.product_id, 'tipo', v_movement_type,
            'fecha', v_invoice.invoice_date::text, 'cantidad', v_item.quantity,
            'costo_unitario', v_unit, 'moneda', v_item.currency,
            'costo_moneda', case when v_item.currency_cost is null then null else v_item.currency_cost * v_ratio end,
            'tasa_dolar', v_item.dollar_rate, 'referencia', v_invoice.invoice_number,
            'base_iva', v_net, 'factura_compra_id', p_invoice_id));
      end loop;
    end if;

    perform public.shared_inventory_purchase_invoice_recalculate_totals(p_tenant_id, p_invoice_id);
    update public.shared_inventory_purchase_invoices
    set status = 'confirmada', confirmed_at = now(), updated_at = now()
    where tenant_id = p_tenant_id and id = p_invoice_id;

    return (select row_to_json(i) from public.shared_inventory_purchase_invoices i
        where i.tenant_id = p_tenant_id and i.id = p_invoice_id);
end;
$$;
