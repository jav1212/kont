-- Accounts Payable is a platform module available to every organization, like
-- Documents. Visibility stays governed by payables.* permissions; this only
-- grants the entitlement and installation that Desktop/Mobile require.

insert into public.organization_module_entitlements(organization_id,module_id,module_code,source_type,source_id,status,valid_from)
select o.id,m.id,m.code,'platform_default','payables','active',now()
from public.organizations o cross join public.module_catalog m
where m.code='payables'
on conflict (organization_id,module_id,source_type,source_id) do update set status='active',valid_until=null;

insert into public.organization_module_installations(organization_id,module_id,status,installed_at,activated_at)
select o.id,m.id,'active',now(),now()
from public.organizations o cross join public.module_catalog m
where m.code='payables'
on conflict (organization_id,module_id) do nothing;

-- New organizations receive the same platform modules at creation time.
create or replace function public.install_base_organization_modules()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.organization_module_entitlements(
    organization_id, module_id, module_code, source_type, source_id, status, valid_from
  )
  select new.id, module.id, module.code, 'platform_default', module.code, 'active', now()
  from public.module_catalog module
  where module.code = 'payables'
  on conflict (organization_id, module_id, source_type, source_id) do nothing;

  insert into public.organization_module_installations(
    organization_id, module_id, status, installed_at, activated_at
  )
  select new.id, module.id, 'active', now(), now()
  from public.module_catalog module
  where module.code in ('tools', 'companies', 'documents', 'payables')
  on conflict(organization_id, module_id) do nothing;
  return new;
end;
$$;
