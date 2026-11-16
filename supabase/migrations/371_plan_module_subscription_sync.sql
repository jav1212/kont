-- =============================================================================
-- 371_plan_module_subscription_sync.sql
--
-- PROBLEMA
-- --------
-- Asignar un plan clásico (Empresarial, Emprendedor, Contable...) a un tenant
-- solo actualizaba tenants.plan_id. Ninguna ruta (PATCH admin, bulk-plan,
-- aprobación de pago) creaba las filas de tenant_subscriptions, y la cadena
-- organization_subscriptions -> organization_module_entitlements ->
-- organization_module_installations solo se había poblado con backfills
-- puntuales (205/214). Resultado: el tenant figuraba con el plan pero sin
-- módulos (caso Empresarial sin nómina/inventario/contabilidad).
--
-- SOLUCIÓN
-- --------
-- 1. Al cambiar plan, estado o período de un tenant, se crean/actualizan las
--    tenant_subscriptions de cada producto incluido en plans.included_modules.
--    Los planes ligados a un único producto (plans.product_id) conservan el
--    comportamiento previo. No se cancela ningún producto fuera del plan: un
--    downgrade sigue siendo una decisión comercial explícita del admin.
--    No corre en INSERT para no alterar el alta de nuevos tenants.
-- 2. Cada organization_subscription mantiene sus entitlements
--    (source_type = 'organization_subscription') y, cuando concede acceso,
--    instala el módulo si falta. La instalación de inventario dispara el
--    bundle existente de compras/ventas (235).
-- 3. Backfill idempotente para tenants activos sin suscripciones de su plan y
--    para suscripciones de organización sin entitlements.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Plan -> tenant_subscriptions
-- -----------------------------------------------------------------------------
create or replace function public.provision_tenant_plan_subscriptions(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant public.tenants%rowtype;
  v_plan public.plans%rowtype;
begin
  select * into v_tenant from public.tenants where id = p_tenant_id;
  if not found then return; end if;
  select * into v_plan from public.plans where id = v_tenant.plan_id;
  if not found then return; end if;

  insert into public.tenant_subscriptions(
    tenant_id, product_id, plan_id, status, billing_cycle,
    current_period_start, current_period_end, last_payment_at
  )
  select v_tenant.id, product.id, v_plan.id, v_tenant.status, v_tenant.billing_cycle,
    v_tenant.current_period_start, v_tenant.current_period_end, v_tenant.last_payment_at
  from public.products product
  where (v_plan.product_id is not null and product.id = v_plan.product_id)
     or (v_plan.product_id is null and coalesce(v_plan.included_modules, '[]'::jsonb) ? product.slug)
  on conflict (tenant_id, product_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    billing_cycle = excluded.billing_cycle,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    last_payment_at = excluded.last_payment_at;
end;
$$;

revoke all on function public.provision_tenant_plan_subscriptions(uuid) from public, anon, authenticated;

create or replace function public.sync_tenant_plan_product_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.provision_tenant_plan_subscriptions(new.id);
  return new;
end;
$$;

drop trigger if exists tenants_sync_product_plan_subscription on public.tenants;
create trigger tenants_sync_product_plan_subscription
after update on public.tenants
for each row
when (
  old.plan_id is distinct from new.plan_id
  or old.status is distinct from new.status
  or old.billing_cycle is distinct from new.billing_cycle
  or old.current_period_start is distinct from new.current_period_start
  or old.current_period_end is distinct from new.current_period_end
  or old.last_payment_at is distinct from new.last_payment_at
)
execute function public.sync_tenant_plan_product_subscription();

-- -----------------------------------------------------------------------------
-- 2. organization_subscriptions -> entitlements + installations
-- -----------------------------------------------------------------------------
create or replace function public.sync_organization_subscription_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := case when new.status in ('trial', 'active') then 'active' else 'suspended' end;
begin
  with aliases(product_slug, module_code) as (values
    ('payroll', 'payroll'), ('nomina', 'payroll'),
    ('inventory', 'inventory'), ('inventario', 'inventory'),
    ('accounting', 'accounting'), ('contabilidad', 'accounting'),
    ('purchases', 'purchases'), ('compras', 'purchases'),
    ('sales', 'sales'), ('ventas', 'sales'),
    ('treasury', 'treasury'), ('tesoreria', 'treasury')
  )
  insert into public.organization_module_entitlements(
    organization_id, module_id, module_code, source_type, source_id,
    status, valid_from, valid_until
  )
  select new.organization_id, module.id, module.code, 'organization_subscription', new.id::text,
    v_status, coalesce(new.current_period_start, new.created_at), new.current_period_end
  from public.products product
  join aliases alias on alias.product_slug = lower(product.slug)
  join public.module_catalog module on module.code = alias.module_code
  where product.id = new.product_id
  on conflict (organization_id, module_id, source_type, source_id) do update set
    status = excluded.status,
    valid_from = excluded.valid_from,
    valid_until = excluded.valid_until;

  -- Only grant missing installations; suspensions chosen by the organization
  -- are respected, and the subscription lock already hides unpaid modules.
  if v_status = 'active' then
    insert into public.organization_module_installations(
      organization_id, module_id, status, installed_at, activated_at
    )
    select entitlement.organization_id, entitlement.module_id, 'active', now(), now()
    from public.organization_module_entitlements entitlement
    where entitlement.organization_id = new.organization_id
      and entitlement.source_type = 'organization_subscription'
      and entitlement.source_id = new.id::text
    on conflict (organization_id, module_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists organization_subscriptions_sync_entitlements on public.organization_subscriptions;
create trigger organization_subscriptions_sync_entitlements
after insert or update on public.organization_subscriptions
for each row execute function public.sync_organization_subscription_entitlements();

-- -----------------------------------------------------------------------------
-- 3. Backfill
-- -----------------------------------------------------------------------------
-- Active tenants whose plan grants products they have no subscription for.
-- Trial tenants are excluded to keep the current sign-up policy unchanged.
do $$
declare
  v_tenant_id uuid;
begin
  for v_tenant_id in
    select tenant.id
    from public.tenants tenant
    join public.plans plan on plan.id = tenant.plan_id
    where tenant.status = 'active'
      and exists (
        select 1 from public.products product
        where ((plan.product_id is not null and product.id = plan.product_id)
            or (plan.product_id is null and coalesce(plan.included_modules, '[]'::jsonb) ? product.slug))
          and not exists (
            select 1 from public.tenant_subscriptions subscription
            where subscription.tenant_id = tenant.id and subscription.product_id = product.id
          )
      )
  loop
    perform public.provision_tenant_plan_subscriptions(v_tenant_id);
  end loop;
end;
$$;

-- Organization subscriptions created after the 205/214 backfills.
update public.organization_subscriptions subscription
set updated_at = subscription.updated_at
where not exists (
  select 1 from public.organization_module_entitlements entitlement
  where entitlement.source_type = 'organization_subscription'
    and entitlement.source_id = subscription.id::text
);
