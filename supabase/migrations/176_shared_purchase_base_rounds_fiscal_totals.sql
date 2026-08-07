-- Round the taxable base to two decimals; keep VAT and total truncated.
-- This matches the purchase book's fiscal presentation while preserving
-- full precision for the intermediate calculations.

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
    v_extra_taxes numeric;
    v_sign numeric := 1;
begin
    select case when coalesce(document_type, 'factura') = 'nota_credito' then -1 else 1 end
    into v_sign
    from public.shared_inventory_purchase_invoices
    where tenant_id = p_tenant_id and id = p_invoice_id;

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

    update public.shared_inventory_purchase_invoices
    set subtotal = v_sign * round(v_subtotal_raw, 2),
        vat_amount = v_sign * trunc(v_vat_raw, 2),
        total = v_sign * trunc(v_subtotal_raw + v_vat_raw + v_extra_taxes, 2),
        updated_at = now()
    where tenant_id = p_tenant_id
      and id = p_invoice_id;
end;
$$;

do $$
declare
    v_invoice record;
begin
    for v_invoice in
        select distinct f.tenant_id, f.id
        from public.shared_inventory_purchase_invoices f
        join public.shared_inventory_purchase_invoice_items i
          on i.tenant_id = f.tenant_id
         and i.invoice_id = f.id
    loop
        perform public.shared_inventory_purchase_invoice_recalculate_totals(
            v_invoice.tenant_id,
            v_invoice.id
        );
    end loop;
end;
$$;
