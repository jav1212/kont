-- Full BCV currency support for global sales adjustments and additional taxes.

alter table public.shared_inventory_sales_invoices
  add column if not exists taxes jsonb not null default '[]'::jsonb,
  add column if not exists discount_currency varchar(3) not null default 'VES',
  add column if not exists surcharge_currency varchar(3) not null default 'VES';

alter table public.shared_inventory_sales_invoice_items
  add column if not exists discount_currency varchar(3) not null default 'VES',
  add column if not exists surcharge_currency varchar(3) not null default 'VES';

alter table public.shared_inventory_sales_invoices
  drop constraint if exists shared_sales_invoice_adjustment_currency_check;
alter table public.shared_inventory_sales_invoices
  add constraint shared_sales_invoice_adjustment_currency_check
  check (discount_currency ~ '^[A-Z]{3}$' and surcharge_currency ~ '^[A-Z]{3}$');

alter table public.shared_inventory_sales_invoice_items
  drop constraint if exists shared_sales_item_adjustment_currency_check;
alter table public.shared_inventory_sales_invoice_items
  add constraint shared_sales_item_adjustment_currency_check
  check (discount_currency ~ '^[A-Z]{3}$' and surcharge_currency ~ '^[A-Z]{3}$');

alter function public.shared_inventory_sales_invoice_save(uuid,jsonb,jsonb)
  rename to shared_inventory_sales_invoice_save_adjustments_base;

create function public.shared_inventory_sales_invoice_save(
    p_tenant_id uuid, p_invoice jsonb, p_items jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
    v_result jsonb;
begin
    v_result := public.shared_inventory_sales_invoice_save_adjustments_base(p_tenant_id,p_invoice,p_items);

    update public.shared_inventory_sales_invoices
    set currency_code = coalesce(nullif(p_invoice->>'currency_code',''),'VES'),
        exchange_rates = coalesce(p_invoice->'exchange_rates','[]'::jsonb),
        taxes = coalesce(p_invoice->'taxes','[]'::jsonb),
        discount_currency = coalesce(nullif(p_invoice->>'descuento_moneda',''),'VES'),
        surcharge_currency = coalesce(nullif(p_invoice->>'recargo_moneda',''),'VES')
    where tenant_id=p_tenant_id and id=v_result->>'id';

    with incoming as (
        select value, ordinality as rn
        from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) with ordinality
    ), saved as (
        select id, row_number() over (order by id) as rn
        from public.shared_inventory_sales_invoice_items
        where tenant_id=p_tenant_id and invoice_id=v_result->>'id'
    )
    update public.shared_inventory_sales_invoice_items i
    set discount_currency = coalesce(nullif(incoming.value->>'descuento_moneda',''),'VES'),
        surcharge_currency = coalesce(nullif(incoming.value->>'recargo_moneda',''),'VES')
    from incoming join saved on saved.rn=incoming.rn
    where i.id=saved.id;

    return (select row_to_json(i)::jsonb from public.shared_inventory_sales_invoices i
            where i.tenant_id=p_tenant_id and i.id=v_result->>'id');
end;
$$;

revoke execute on function public.shared_inventory_sales_invoice_save(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_inventory_sales_invoice_save(uuid,jsonb,jsonb) to service_role;
