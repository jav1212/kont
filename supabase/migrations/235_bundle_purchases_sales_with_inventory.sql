-- Purchasing and Sales are separate operational modules, but they are part of
-- the Inventory commercial product until dedicated products/plans exist.
-- Desktop only exposes active organization module installations, so keep the
-- bundled modules aligned with the Inventory installation lifecycle.

create or replace function public.sync_inventory_bundled_modules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inventory_code text;
  bundled_status text;
begin
  select module.code
  into inventory_code
  from public.module_catalog module
  where module.id = new.module_id;

  if inventory_code <> 'inventory' then
    return new;
  end if;

  bundled_status := case when new.status = 'active' then 'active' else 'suspended' end;

  insert into public.organization_module_entitlements(
    organization_id,
    module_id,
    module_code,
    source_type,
    source_id,
    status,
    valid_from,
    valid_until
  )
  select
    new.organization_id,
    module.id,
    module.code,
    'inventory_bundle',
    new.id::text,
    bundled_status,
    coalesce(new.activated_at, new.installed_at),
    null
  from public.module_catalog module
  where module.code in ('purchases', 'sales')
  on conflict (organization_id, module_id, source_type, source_id)
  do update set
    status = excluded.status,
    valid_until = null;

  insert into public.organization_module_installations(
    organization_id,
    module_id,
    status,
    installed_at,
    activated_at,
    suspended_at
  )
  select
    new.organization_id,
    module.id,
    bundled_status,
    coalesce(new.installed_at, now()),
    case when bundled_status = 'active' then coalesce(new.activated_at, now()) else null end,
    case when bundled_status = 'suspended' then coalesce(new.suspended_at, now()) else null end
  from public.module_catalog module
  where module.code in ('purchases', 'sales')
  on conflict (organization_id, module_id)
  do update set
    status = excluded.status,
    activated_at = case
      when excluded.status = 'active'
        then coalesce(public.organization_module_installations.activated_at, excluded.activated_at)
      else public.organization_module_installations.activated_at
    end,
    suspended_at = excluded.suspended_at,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.sync_inventory_bundled_modules()
  from public, anon, authenticated;

drop trigger if exists organization_inventory_sync_bundled_modules
  on public.organization_module_installations;

create trigger organization_inventory_sync_bundled_modules
after insert or update of status
on public.organization_module_installations
for each row execute function public.sync_inventory_bundled_modules();

-- Backfill organizations that already had Inventory when the portable module
-- catalog was introduced. Reusing the trigger keeps this path identical to
-- future Inventory activations.
update public.organization_module_installations installation
set status = installation.status,
    updated_at = now()
from public.module_catalog module
where module.id = installation.module_id
  and module.code = 'inventory';
