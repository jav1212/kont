-- Keep intermediate purchase calculations at full precision and truncate
-- fiscal outputs to two decimals, matching the purchase book.

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
    v_subtotal_raw numeric;
    v_vat_raw numeric;
    v_subtotal numeric(14,2);
    v_vat_amount numeric(14,2);
    v_total numeric(14,2);
    v_extra_taxes numeric;
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
    into v_subtotal_raw, v_vat_raw
    from public.shared_inventory_purchase_invoice_items i
    where i.tenant_id = p_tenant_id
      and i.invoice_id = p_invoice_id;

    select coalesce(sum(coalesce(nullif(t->>'monto', '')::numeric, 0)), 0)
    into v_extra_taxes
    from public.shared_inventory_purchase_invoices f
    cross join lateral jsonb_array_elements(coalesce(f.taxes, '[]'::jsonb)) t
    where f.tenant_id = p_tenant_id
      and f.id = p_invoice_id;

    v_subtotal := trunc(v_subtotal_raw, 2);
    v_vat_amount := trunc(v_vat_raw, 2);
    v_total := trunc(v_subtotal_raw + v_vat_raw + v_extra_taxes, 2);

    update public.shared_inventory_purchase_invoices
    set subtotal = v_subtotal,
        vat_amount = v_vat_amount,
        total = v_total,
        updated_at = now()
    where tenant_id = p_tenant_id
      and id = p_invoice_id;
end;
$$;
