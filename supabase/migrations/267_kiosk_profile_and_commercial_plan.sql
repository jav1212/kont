-- Kiosco is a per-company presentation profile over the existing Inventory
-- commercial product. Inventory already activates the Purchases and Sales bundle.

alter table public.shared_companies
  add column if not exists operating_profile text not null default 'standard'
  check (operating_profile in ('standard', 'kiosk'));

alter table public.plans
  add column if not exists included_modules jsonb not null default '[]'::jsonb
  check (jsonb_typeof(included_modules) = 'array');

alter table public.plans
  add column if not exists commercial_code text unique;

-- Existing Inventory plans use the same shared commercial definition.
update public.plans
set included_modules = '["inventory","purchases","sales"]'::jsonb
where product_id = (select id from public.products where slug = 'inventory')
  and included_modules = '[]'::jsonb;

-- Preserve the modules advertised by pre-existing unified offers. These are
-- presentation metadata only; subscription enforcement stays product-scoped.
update public.plans
set included_modules = case
  when name = 'Gratuito' then '["documents"]'::jsonb
  else '["payroll","inventory","purchases","sales","accounting","tools","companies","documents"]'::jsonb
end
where product_id is null and included_modules = '[]'::jsonb;

-- The offer is intentionally unpublished until an administrator configures its
-- commercial price. Re-running the migration never overwrites configured prices.
insert into public.plans (
  name, commercial_code, product_id, max_companies, max_employees_per_company,
  price_monthly_usd, price_quarterly_usd, price_annual_usd,
  is_active, is_contact_only, included_modules
)
select 'Kiosco', 'kiosk', product.id, null, null, 0, 0, 0, false, false,
  '["inventory","purchases","sales"]'::jsonb
from public.products product
where product.slug = 'inventory'
on conflict (name) do update set
  product_id = excluded.product_id,
  commercial_code = excluded.commercial_code,
  included_modules = excluded.included_modules;

create or replace function public.kiosk_plan_requires_positive_prices()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.is_active and new.commercial_code = 'kiosk'
    and new.price_monthly_usd <= 0 then
    raise exception 'KIOSK_PLAN_PRICE_REQUIRED';
  end if;
  return new;
end $$;

drop trigger if exists plans_kiosk_price_guard on public.plans;
create trigger plans_kiosk_price_guard
before insert or update of is_active, price_monthly_usd, price_quarterly_usd, price_annual_usd
on public.plans for each row execute function public.kiosk_plan_requires_positive_prices();

-- Keep the legacy tenant bridge and product subscriptions aligned for a
-- product-scoped plan. A Kiosco approval creates only the Inventory product
-- subscription; migration 235 derives Purchases and Sales from Inventory.
create or replace function public.sync_tenant_plan_product_subscription()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_product_id uuid;
begin
  select product_id into v_product_id from public.plans where id = new.plan_id;
  if v_product_id is null then return new; end if;
  insert into public.tenant_subscriptions(
    tenant_id, product_id, plan_id, status, billing_cycle,
    current_period_start, current_period_end, last_payment_at
  ) values (
    new.id, v_product_id, new.plan_id, new.status, new.billing_cycle,
    new.current_period_start, new.current_period_end, new.last_payment_at
  ) on conflict (tenant_id, product_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    billing_cycle = excluded.billing_cycle,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    last_payment_at = excluded.last_payment_at;
  return new;
end $$;

drop trigger if exists tenants_sync_product_plan_subscription on public.tenants;
create trigger tenants_sync_product_plan_subscription
after update of plan_id, status, billing_cycle, current_period_start, current_period_end, last_payment_at
on public.tenants for each row execute function public.sync_tenant_plan_product_subscription();

-- Reject a disabled cycle at the persistence boundary for the native and
-- legacy payment paths alike. This also prevents zero-value payment requests.
create or replace function public.kiosk_payment_price_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_price numeric; v_active boolean;
begin
  select case new.billing_cycle when 'monthly' then price_monthly_usd when 'quarterly' then price_quarterly_usd else price_annual_usd end
  , is_active into v_price, v_active
  from public.plans
  where id = new.plan_id and commercial_code = 'kiosk';
  if found and (
    not v_active
    or v_price <= 0
    or abs((new.amount_usd + coalesce(new.discount_usd, 0)) - v_price) > 0.005
  ) then raise exception 'BILLING_PLAN_PRICE_REQUIRED'; end if;
  return new;
end $$;

drop trigger if exists payment_requests_kiosk_price_guard on public.payment_requests;
create trigger payment_requests_kiosk_price_guard
before insert or update of plan_id, billing_cycle on public.payment_requests
for each row execute function public.kiosk_payment_price_guard();
