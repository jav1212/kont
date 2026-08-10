-- Restore the fiscal truncation rules changed accidentally by migration 193.
-- Keep three-letter currency compatibility only while old confirmations still exist.

create or replace function public.shared_inventory_purchase_invoice_recalculate_totals(
    p_tenant_id uuid,
    p_invoice_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_sign numeric;
    v_currency text;
    v_rate numeric;
    v_subtotal_source numeric;
    v_vat_source numeric;
    v_subtotal_raw numeric;
    v_vat_raw numeric;
    v_subtotal_fiscal numeric;
    v_vat_fiscal numeric;
    v_extra_taxes numeric;
begin
    select
        case when coalesce(f.document_type, 'factura') = 'nota_credito' then -1 else 1 end,
        case
            when count(i.id) > 0 and bool_and(upper(coalesce(i.currency, 'VES')) in ('USD', 'D')) then 'D'
            else 'B'
        end,
        coalesce(nullif(f.dollar_rate, 0), max(nullif(i.dollar_rate, 0)), 0)
    into v_sign, v_currency, v_rate
    from public.shared_inventory_purchase_invoices f
    left join public.shared_inventory_purchase_invoice_items i
      on i.tenant_id = f.tenant_id and i.invoice_id = f.id
    where f.tenant_id = p_tenant_id and f.id = p_invoice_id
    group by f.document_type, f.dollar_rate;

    if v_currency = 'D' and v_rate <= 0 then
        raise exception 'USD purchase invoice requires a positive dollar rate';
    end if;

    with raw_lines as (
        select
            i.id,
            i.vat_rate,
            case
                when v_currency = 'D'
                  and upper(coalesce(i.currency, 'VES')) in ('USD', 'D')
                  and i.currency_cost is not null
                    then i.quantity * i.currency_cost
                when v_currency = 'D'
                  and upper(coalesce(i.currency, 'VES')) in ('USD', 'D')
                  and i.vat_base is not null
                    then i.vat_base / v_rate
                else i.quantity * i.unit_cost
            end as raw_base,
            i.discount_type,
            i.discount_value,
            case when v_currency = 'D' then coalesce(i.discount_amount, 0) / v_rate
                 else coalesce(i.discount_amount, 0) end as discount_amount,
            i.surcharge_type,
            i.surcharge_value,
            case when v_currency = 'D' then coalesce(i.surcharge_amount, 0) / v_rate
                 else coalesce(i.surcharge_amount, 0) end as surcharge_amount
        from public.shared_inventory_purchase_invoice_items i
        where i.tenant_id = p_tenant_id and i.invoice_id = p_invoice_id
    ),
    line_net as (
        select *,
            raw_base
            - case when discount_type = 'porcentaje' then raw_base * coalesce(discount_value, 0) / 100
                   else discount_amount end
            + case when surcharge_type = 'porcentaje' then raw_base * coalesce(surcharge_value, 0) / 100
                   else surcharge_amount end as net_base
        from raw_lines
    ),
    line_sum as (
        select coalesce(sum(net_base), 0) as net_total from line_net
    ),
    header_values as (
        select
            ls.net_total,
            case
                when f.discount_type = 'porcentaje' then ls.net_total * coalesce(f.discount_value, 0) / 100
                when v_currency = 'D' then coalesce(f.discount_amount, 0) / v_rate
                else coalesce(f.discount_amount, 0)
            end as header_discount,
            case
                when f.surcharge_type = 'porcentaje' then ls.net_total * coalesce(f.surcharge_value, 0) / 100
                when v_currency = 'D' then coalesce(f.surcharge_amount, 0) / v_rate
                else coalesce(f.surcharge_amount, 0)
            end as header_surcharge
        from line_sum ls
        join public.shared_inventory_purchase_invoices f
          on f.tenant_id = p_tenant_id and f.id = p_invoice_id
    ),
    final_lines as (
        select
            ln.vat_rate,
            ln.net_base
              + case when hv.net_total <> 0
                     then (hv.header_surcharge - hv.header_discount) * ln.net_base / hv.net_total
                     else 0 end as final_base
        from line_net ln
        cross join header_values hv
    )
    select
        coalesce(sum(final_base), 0),
        coalesce(sum(final_base * case vat_rate
            when 'reducida_8' then 8
            when 'general_16' then 16
            else 0
        end / 100), 0)
    into v_subtotal_source, v_vat_source
    from final_lines;

    if v_currency = 'D' then
        v_subtotal_raw := v_subtotal_source * v_rate;
        v_vat_raw := v_vat_source * v_rate;
    else
        v_subtotal_raw := v_subtotal_source;
        v_vat_raw := v_vat_source;
    end if;

    v_subtotal_fiscal := round(v_subtotal_raw, 2);
    v_vat_fiscal := trunc(v_vat_raw, 2);

    select coalesce(sum(coalesce(nullif(t->>'monto', '')::numeric, 0)), 0)
    into v_extra_taxes
    from public.shared_inventory_purchase_invoices f
    cross join lateral jsonb_array_elements(coalesce(f.taxes, '[]'::jsonb)) t
    where f.tenant_id = p_tenant_id and f.id = p_invoice_id;

    update public.shared_inventory_purchase_invoices
    set subtotal = v_sign * v_subtotal_fiscal,
        vat_amount = v_sign * v_vat_fiscal,
        total = v_sign * trunc(v_subtotal_fiscal + v_vat_fiscal + v_extra_taxes, 2),
        updated_at = now()
    where tenant_id = p_tenant_id and id = p_invoice_id;
end;
$$;
