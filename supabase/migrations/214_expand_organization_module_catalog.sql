-- Align the portable module catalog with the top-level destinations already
-- exposed by the production Web application. This is additive: existing
-- module identifiers and installations remain unchanged.
alter table public.module_catalog
  drop constraint if exists module_catalog_code_check;

alter table public.module_catalog
  add constraint module_catalog_code_check
  check (code in (
    'payroll', 'inventory', 'accounting',
    'purchases', 'sales', 'tools', 'companies', 'documents'
  ));

insert into public.module_catalog(code, name, status, supported_platforms) values
  ('purchases', 'Compras', 'active', array['web', 'desktop']),
  ('sales', 'Ventas', 'active', array['web', 'desktop']),
  ('tools', 'Herramientas', 'active', array['web', 'desktop', 'mobile']),
  ('companies', 'Empresas', 'active', array['web', 'desktop', 'mobile']),
  ('documents', 'Documentos', 'active', array['web', 'desktop', 'mobile'])
on conflict(code) do update set
  name = excluded.name,
  status = excluded.status,
  supported_platforms = excluded.supported_platforms;

-- Base destinations are included for every organization and therefore need
-- no commercial entitlement. Their installations make availability explicit.
insert into public.organization_module_installations(
  organization_id, module_id, status, installed_at, activated_at
)
select organization.id, module.id, 'active', now(), now()
from public.organizations organization
cross join public.module_catalog module
where module.code in ('tools', 'companies', 'documents')
on conflict(organization_id, module_id) do update set
  status = 'active',
  activated_at = coalesce(public.organization_module_installations.activated_at, excluded.activated_at),
  suspended_at = null,
  updated_at = now();

create or replace function public.install_base_organization_modules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_module_installations(
    organization_id, module_id, status, installed_at, activated_at
  )
  select new.id, module.id, 'active', now(), now()
  from public.module_catalog module
  where module.code in ('tools', 'companies', 'documents')
  on conflict(organization_id, module_id) do nothing;
  return new;
end;
$$;

drop trigger if exists organizations_install_base_modules on public.organizations;
create trigger organizations_install_base_modules
after insert on public.organizations
for each row execute function public.install_base_organization_modules();

-- Commercial destinations follow the same subscription-driven entitlement
-- policy used by payroll, inventory, and accounting.
with aliases(product_slug, module_code) as (values
  ('purchases', 'purchases'), ('compras', 'purchases'),
  ('sales', 'sales'), ('ventas', 'sales')
)
insert into public.organization_module_entitlements(
  organization_id, module_id, module_code, source_type, source_id,
  status, valid_from, valid_until
)
select subscription.organization_id, module.id, module.code,
  'organization_subscription', subscription.id::text,
  case when subscription.status in ('trial', 'active') then 'active' else 'suspended' end,
  coalesce(subscription.current_period_start, subscription.created_at),
  subscription.current_period_end
from public.organization_subscriptions subscription
join public.products product on product.id = subscription.product_id
join aliases alias on alias.product_slug = lower(product.slug)
join public.module_catalog module on module.code = alias.module_code
on conflict do nothing;

insert into public.organization_module_installations(
  organization_id, module_id, status, installed_at, activated_at
)
select entitlement.organization_id, entitlement.module_id, 'active', entitlement.valid_from, entitlement.valid_from
from public.organization_module_entitlements entitlement
join public.module_catalog module on module.id = entitlement.module_id
where entitlement.status = 'active' and module.code in ('purchases', 'sales')
on conflict(organization_id, module_id) do update set
  status = 'active',
  activated_at = coalesce(public.organization_module_installations.activated_at, excluded.activated_at),
  suspended_at = null,
  updated_at = now();
