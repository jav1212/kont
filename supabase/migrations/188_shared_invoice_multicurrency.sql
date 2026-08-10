-- Generic BCV currencies for shared-schema purchases, sales and catalog pricing.
-- VES remains the canonical accounting currency. Legacy B/D values are backfilled.

alter table public.shared_inventory_purchase_invoice_items
  drop constraint if exists shared_inventory_purchase_invoice_items_currency_check;
alter table public.shared_inventory_purchase_invoice_items
  alter column currency type varchar(3) using case currency when 'B' then 'VES' when 'D' then 'USD' else upper(currency::text) end;
alter table public.shared_inventory_purchase_invoice_items
  add constraint shared_purchase_item_currency_code_check check (currency ~ '^[A-Z]{3}$');

alter table public.shared_inventory_sales_invoice_items
  drop constraint if exists shared_inventory_sales_invoice_items_currency_check;
alter table public.shared_inventory_sales_invoice_items
  alter column currency type varchar(3) using case currency when 'B' then 'VES' when 'D' then 'USD' else upper(currency::text) end;
alter table public.shared_inventory_sales_invoice_items
  add constraint shared_sales_item_currency_code_check check (currency ~ '^[A-Z]{3}$');

alter table public.shared_inventory_purchase_invoices
  add column if not exists currency_code varchar(3) not null default 'VES',
  add column if not exists exchange_rates jsonb not null default '[]'::jsonb,
  add column if not exists source_subtotal numeric(18,4),
  add column if not exists source_vat_amount numeric(18,4),
  add column if not exists source_total numeric(18,4),
  add column if not exists financial_tax_currency_code varchar(3),
  add column if not exists financial_tax_exchange_rate numeric(18,10);

alter table public.shared_inventory_sales_invoices
  add column if not exists currency_code varchar(3) not null default 'VES',
  add column if not exists exchange_rates jsonb not null default '[]'::jsonb,
  add column if not exists source_subtotal numeric(18,4),
  add column if not exists source_vat_amount numeric(18,4),
  add column if not exists source_total numeric(18,4),
  add column if not exists financial_tax_currency_code varchar(3),
  add column if not exists financial_tax_exchange_rate numeric(18,10);

alter table public.shared_inventory_purchase_invoices
  add constraint shared_purchase_invoice_currency_code_check check (currency_code ~ '^[A-Z]{3}$'),
  add constraint shared_purchase_igtf_currency_code_check check (financial_tax_currency_code is null or financial_tax_currency_code ~ '^[A-Z]{3}$');
alter table public.shared_inventory_sales_invoices
  add constraint shared_sales_invoice_currency_code_check check (currency_code ~ '^[A-Z]{3}$'),
  add constraint shared_sales_igtf_currency_code_check check (financial_tax_currency_code is null or financial_tax_currency_code ~ '^[A-Z]{3}$');

alter table public.shared_inventory_movements
  drop constraint if exists shared_inventory_movements_currency_check;
alter table public.shared_inventory_movements
  alter column currency type varchar(3) using case currency when 'B' then 'VES' when 'D' then 'USD' else upper(currency::text) end;
alter table public.shared_inventory_movements
  add constraint shared_movement_currency_code_check check (currency ~ '^[A-Z]{3}$');

alter table public.shared_inventory_products
  add column if not exists sale_price_currency_code varchar(3);
update public.shared_inventory_products
set sale_price_currency_code = case sale_price_currency when 'B' then 'VES' when 'D' then 'USD' else upper(sale_price_currency::text) end
where sale_price_currency is not null and sale_price_currency_code is null;
alter table public.shared_inventory_products
  drop constraint if exists shared_inventory_products_sale_pricing_check;
alter table public.shared_inventory_products
  add constraint shared_inventory_products_sale_pricing_check check (
    (sale_price_mode is null and sale_price_value is null and sale_price_currency_code is null)
    or (sale_price_mode = 'fixed' and sale_price_value > 0 and sale_price_currency_code ~ '^[A-Z]{3}$')
    or (sale_price_mode = 'markup' and sale_price_value >= 0 and sale_price_currency_code ~ '^[A-Z]{3}$')
  );
alter table public.shared_inventory_products
  add constraint shared_product_sale_currency_code_check
  check (sale_price_currency_code is null or sale_price_currency_code ~ '^[A-Z]{3}$');

-- Preserve the historical header currency/rate of existing invoices.
update public.shared_inventory_purchase_invoices f
set currency_code = coalesce((
      select case when count(*) > 0 and count(distinct i.currency) = 1 then min(i.currency) else 'VES' end
      from public.shared_inventory_purchase_invoice_items i
      where i.tenant_id = f.tenant_id and i.invoice_id = f.id
    ), 'VES'),
    exchange_rates = case when f.dollar_rate is not null and f.dollar_rate > 0
      then jsonb_build_array(jsonb_build_object(
        'currencyCode','USD','vesPerUnit',f.dollar_rate,'decimals',coalesce(f.rate_decimals,4),
        'effectiveDate',f.invoice_date::text,'source','legacy','bcvRate',f.dollar_rate))
      else '[]'::jsonb end;

update public.shared_inventory_sales_invoices f
set currency_code = coalesce((
      select case when count(*) > 0 and count(distinct i.currency) = 1 then min(i.currency) else 'VES' end
      from public.shared_inventory_sales_invoice_items i
      where i.tenant_id = f.tenant_id and i.invoice_id = f.id
    ), 'VES'),
    exchange_rates = case when f.dollar_rate is not null and f.dollar_rate > 0
      then jsonb_build_array(jsonb_build_object(
        'currencyCode','USD','vesPerUnit',f.dollar_rate,'decimals',coalesce(f.rate_decimals,4),
        'effectiveDate',f.invoice_date::text,'source','legacy','bcvRate',f.dollar_rate))
      else '[]'::jsonb end;

comment on column public.shared_inventory_purchase_invoice_items.dollar_rate is
  'Legacy name; generic VES-per-unit rate for the currency column.';
comment on column public.shared_inventory_sales_invoice_items.dollar_rate is
  'Legacy name; generic VES-per-unit rate for the currency column.';

-- Header-only quick purchases already contain their authoritative VES totals;
-- do not erase them by running the item-derived recalculation with zero items.
create or replace function public.shared_inventory_purchase_invoice_confirm(
    p_tenant_id uuid, p_invoice_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_invoice record; v_item record; v_movement jsonb;
    v_net numeric(14,2); v_unit numeric(14,4); v_ratio numeric; v_movement_type text;
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

    if exists (select 1 from public.shared_inventory_purchase_invoice_items
        where tenant_id = p_tenant_id and invoice_id = p_invoice_id) then
        perform public.shared_inventory_purchase_invoice_recalculate_totals(p_tenant_id, p_invoice_id);
    end if;
    update public.shared_inventory_purchase_invoices
    set status = 'confirmada', confirmed_at = now(), updated_at = now()
    where tenant_id = p_tenant_id and id = p_invoice_id;
    return (select row_to_json(i) from public.shared_inventory_purchase_invoices i
        where i.tenant_id = p_tenant_id and i.id = p_invoice_id);
end;
$$;
