-- Organization module management foundation. Additive only: existing module gates remain unchanged.
insert into public.access_control_permissions(code,resource,action,description) values
 ('modules.read','modules','read','Ver módulos de la organización'),
 ('modules.manage','modules','manage','Administrar módulos de la organización') on conflict do nothing;
insert into public.organization_role_permissions(role_id,permission_code)
select r.id,p.code from public.organization_roles r join public.access_control_permissions p on
 (r.code in('owner','admin') and p.resource='modules') or (r.code='accountant' and p.code='modules.read') on conflict do nothing;

create table public.module_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(code in('payroll','inventory','accounting')),
  name text not null,
  status text not null check(status in('active','deprecated','retired')),
  supported_platforms text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.module_capabilities (
  module_id uuid not null references public.module_catalog(id) on delete cascade,
  capability_code text not null,
  primary key(module_id,capability_code)
);
create table public.module_dependencies (
  module_id uuid not null references public.module_catalog(id) on delete cascade,
  required_module_id uuid not null references public.module_catalog(id) on delete restrict,
  primary key(module_id,required_module_id),check(module_id<>required_module_id)
);
create table public.organization_module_entitlements (
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
  module_id uuid not null references public.module_catalog(id) on delete restrict,module_code text not null,
  source_type text not null,source_id text not null,status text not null check(status in('active','suspended')),
  valid_from timestamptz not null default now(),valid_until timestamptz,created_at timestamptz not null default now(),
  unique(organization_id,module_id,source_type,source_id)
);
create index organization_module_entitlements_lookup_idx on public.organization_module_entitlements(organization_id,module_code,status);
create table public.organization_module_installations (
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
  module_id uuid not null references public.module_catalog(id) on delete restrict,status text not null check(status in('pending','active','suspended','uninstalled')),
  configuration_version integer not null default 1 check(configuration_version>0),installed_at timestamptz not null,
  activated_at timestamptz,suspended_at timestamptz,updated_at timestamptz not null default now(),unique(organization_id,module_id)
);
create index organization_module_installations_status_idx on public.organization_module_installations(organization_id,status);

insert into public.module_catalog(code,name,status,supported_platforms) values
 ('payroll','Nómina','active',array['web','desktop','mobile']),
 ('inventory','Inventario','active',array['web','desktop','mobile']),
 ('accounting','Contabilidad','active',array['web','desktop']) on conflict(code) do nothing;
insert into public.module_capabilities(module_id,capability_code)
select m.id,c.capability from public.module_catalog m join (values
 ('payroll','payroll.runs'),('payroll','payroll.employees'),('inventory','inventory.products'),
 ('inventory','inventory.movements'),('accounting','accounting.entries'),('accounting','accounting.periods')
)c(module_code,capability) on c.module_code=m.code on conflict do nothing;

with aliases(product_slug,module_code) as (values
 ('payroll','payroll'),('nomina','payroll'),('inventory','inventory'),('inventario','inventory'),('accounting','accounting'),('contabilidad','accounting'))
insert into public.organization_module_entitlements(organization_id,module_id,module_code,source_type,source_id,status,valid_from,valid_until)
select s.organization_id,m.id,m.code,'organization_subscription',s.id::text,
 case when s.status in('trial','active') then 'active' else 'suspended' end,coalesce(s.current_period_start,s.created_at),s.current_period_end
from public.organization_subscriptions s join public.products p on p.id=s.product_id join aliases a on a.product_slug=lower(p.slug)
join public.module_catalog m on m.code=a.module_code on conflict do nothing;
insert into public.organization_module_installations(organization_id,module_id,status,installed_at,activated_at)
select distinct e.organization_id,e.module_id,'active',e.valid_from,e.valid_from from public.organization_module_entitlements e
where e.status='active' on conflict do nothing;

create or replace function public.list_module_catalog() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'code',m.code,'name',m.name,'status',m.status,
  'supported_platforms',m.supported_platforms,'capabilities',coalesce((select jsonb_agg(c.capability_code order by c.capability_code) from public.module_capabilities c where c.module_id=m.id),'[]'::jsonb),
  'dependencies',coalesce((select jsonb_agg(required.code order by required.code) from public.module_dependencies d join public.module_catalog required on required.id=d.required_module_id where d.module_id=m.id),'[]'::jsonb)) order by m.code),'[]'::jsonb) from public.module_catalog m $$;

create or replace function public.install_organization_module(p_organization_id uuid,p_module_code text,p_occurred_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$ declare module_record public.module_catalog%rowtype;installation public.organization_module_installations%rowtype;begin
 select * into module_record from public.module_catalog where code=p_module_code and status='active';if not found then raise exception 'module_not_found';end if;
 if not exists(select 1 from public.organization_module_entitlements where organization_id=p_organization_id and module_id=module_record.id and status='active' and(valid_until is null or valid_until>=p_occurred_at))then raise exception 'module_not_entitled';end if;
 if exists(select 1 from public.organization_module_installations where organization_id=p_organization_id and module_id=module_record.id)then raise exception 'module_already_installed';end if;
 if exists(select 1 from public.module_dependencies d where d.module_id=module_record.id and not exists(select 1 from public.organization_module_installations i where i.organization_id=p_organization_id and i.module_id=d.required_module_id and i.status='active'))then raise exception 'module_dependency_missing';end if;
 insert into public.organization_module_installations(organization_id,module_id,status,installed_at,activated_at)values(p_organization_id,module_record.id,'active',p_occurred_at,p_occurred_at)returning * into installation;
 return to_jsonb(installation)||jsonb_build_object('module_code',module_record.code);end $$;
create or replace function public.change_organization_module_status(p_organization_id uuid,p_module_code text,p_status text,p_occurred_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$ declare module_record public.module_catalog%rowtype;installation public.organization_module_installations%rowtype;begin
 if p_status not in('active','suspended')then raise exception 'module_status_invalid';end if;select * into module_record from public.module_catalog where code=p_module_code;if not found then raise exception 'module_not_found';end if;
 if p_status='active' and not exists(select 1 from public.organization_module_entitlements where organization_id=p_organization_id and module_id=module_record.id and status='active' and(valid_until is null or valid_until>=p_occurred_at))then raise exception 'module_not_entitled';end if;
 if p_status='active' and exists(select 1 from public.module_dependencies d where d.module_id=module_record.id and not exists(select 1 from public.organization_module_installations i where i.organization_id=p_organization_id and i.module_id=d.required_module_id and i.status='active'))then raise exception 'module_dependency_missing';end if;
 if p_status='suspended' and exists(select 1 from public.module_dependencies d join public.organization_module_installations i on i.module_id=d.module_id where d.required_module_id=module_record.id and i.organization_id=p_organization_id and i.status='active')then raise exception 'module_dependent_active';end if;
 update public.organization_module_installations set status=p_status,activated_at=case when p_status='active' then p_occurred_at else activated_at end,suspended_at=case when p_status='suspended' then p_occurred_at else null end,updated_at=now() where organization_id=p_organization_id and module_id=module_record.id returning * into installation;
 if not found then raise exception 'module_not_installed';end if;return to_jsonb(installation)||jsonb_build_object('module_code',module_record.code);end $$;
revoke all on function public.list_module_catalog() from public,anon,authenticated;revoke all on function public.install_organization_module(uuid,text,timestamptz) from public,anon,authenticated;revoke all on function public.change_organization_module_status(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.list_module_catalog() to service_role;grant execute on function public.install_organization_module(uuid,text,timestamptz) to service_role;grant execute on function public.change_organization_module_status(uuid,text,text,timestamptz) to service_role;

alter table public.module_catalog enable row level security;alter table public.module_capabilities enable row level security;alter table public.module_dependencies enable row level security;alter table public.organization_module_entitlements enable row level security;alter table public.organization_module_installations enable row level security;
create policy module_catalog_no_direct_access on public.module_catalog for select to authenticated using(false);
create policy module_capabilities_no_direct_access on public.module_capabilities for select to authenticated using(false);
create policy module_dependencies_no_direct_access on public.module_dependencies for select to authenticated using(false);
create policy module_entitlements_no_direct_access on public.organization_module_entitlements for select to authenticated using(false);
create policy module_installations_no_direct_access on public.organization_module_installations for select to authenticated using(false);
