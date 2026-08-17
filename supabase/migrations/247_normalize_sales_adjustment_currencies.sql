-- Sales forms may still send the legacy B/D adjustment currency codes used by
-- purchases. Normalize them before the base save function inserts rows, so the
-- ISO currency constraints are never evaluated against legacy values.

create or replace function public.shared_inventory_sales_invoice_save(
    p_tenant_id uuid,
    p_invoice jsonb,
    p_items jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_result jsonb;
begin
    p_invoice := jsonb_set(
        jsonb_set(
            p_invoice,
            '{descuento_moneda}',
            to_jsonb(case upper(btrim(coalesce(p_invoice->>'descuento_moneda','')))
                when '' then 'VES' when 'B' then 'VES' when 'D' then 'USD'
                else upper(btrim(p_invoice->>'descuento_moneda')) end)
        ),
        '{recargo_moneda}',
        to_jsonb(case upper(btrim(coalesce(p_invoice->>'recargo_moneda','')))
            when '' then 'VES' when 'B' then 'VES' when 'D' then 'USD'
            else upper(btrim(p_invoice->>'recargo_moneda')) end)
    );

    select coalesce(jsonb_agg(
        jsonb_set(
            jsonb_set(
                item.value,
                '{descuento_moneda}',
                to_jsonb(case upper(btrim(coalesce(item.value->>'descuento_moneda','')))
                    when '' then 'VES' when 'B' then 'VES' when 'D' then 'USD'
                    else upper(btrim(item.value->>'descuento_moneda')) end)
            ),
            '{recargo_moneda}',
            to_jsonb(case upper(btrim(coalesce(item.value->>'recargo_moneda','')))
                when '' then 'VES' when 'B' then 'VES' when 'D' then 'USD'
                else upper(btrim(item.value->>'recargo_moneda')) end)
        ) order by item.ordinality
    ), '[]'::jsonb)
    into p_items
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) with ordinality as item(value, ordinality);

    v_result := public.shared_inventory_sales_invoice_save_adjustments_base(p_tenant_id,p_invoice,p_items);

    update public.shared_inventory_sales_invoices
    set currency_code = coalesce(nullif(p_invoice->>'currency_code',''),'VES'),
        exchange_rates = coalesce(p_invoice->'exchange_rates','[]'::jsonb),
        taxes = coalesce(p_invoice->'taxes','[]'::jsonb),
        discount_currency = p_invoice->>'descuento_moneda',
        surcharge_currency = p_invoice->>'recargo_moneda'
    where tenant_id=p_tenant_id and id=v_result->>'id';

    with incoming as (
        select value, ordinality as rn
        from jsonb_array_elements(p_items) with ordinality
    ), saved as (
        select id, row_number() over (order by id) as rn
        from public.shared_inventory_sales_invoice_items
        where tenant_id=p_tenant_id and invoice_id=v_result->>'id'
    )
    update public.shared_inventory_sales_invoice_items i
    set discount_currency = incoming.value->>'descuento_moneda',
        surcharge_currency = incoming.value->>'recargo_moneda'
    from incoming join saved on saved.rn=incoming.rn
    where i.id=saved.id;

    return (select row_to_json(i)::jsonb from public.shared_inventory_sales_invoices i
            where i.tenant_id=p_tenant_id and i.id=v_result->>'id');
end;
$$;

revoke execute on function public.shared_inventory_sales_invoice_save(uuid,jsonb,jsonb)
    from public,anon,authenticated;
grant execute on function public.shared_inventory_sales_invoice_save(uuid,jsonb,jsonb)
    to service_role;
