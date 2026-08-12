-- Company is the legal and operational owner of module data.
-- Additive compatibility: shared_companies and current Web routes remain unchanged.

create table if not exists public.companies (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    legacy_company_id text,
    legal_name text not null check (length(trim(legal_name)) between 1 and 200),
    trade_name text,
    tax_id text,
    country_code char(2) not null default 'VE' check (country_code in ('VE')),
    status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, legacy_company_id),
    unique (organization_id, country_code, tax_id)
);
create index if not exists companies_organization_status_idx on public.companies(organization_id, status, legal_name);

insert into public.companies(organization_id, legacy_company_id, legal_name, trade_name, tax_id, country_code, status, created_at, updated_at)
select c.organization_id, c.id, c.name, null, nullif(trim(coalesce(c.rif, c.id)), ''), 'VE', 'active', c.created_at, c.updated_at
from public.shared_companies c
where c.organization_id is not null
on conflict (organization_id, legacy_company_id) do update set
  legal_name = excluded.legal_name,
  tax_id = excluded.tax_id,
  updated_at = excluded.updated_at;

create table if not exists public.company_module_activations (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    module_id uuid not null references public.module_catalog(id) on delete restrict,
    status text not null default 'active' check (status in ('active', 'suspended')),
    configuration_version integer not null default 1 check (configuration_version > 0),
    activated_at timestamptz not null default now(),
    suspended_at timestamptz,
    updated_at timestamptz not null default now(),
    unique (company_id, module_id)
);
create index if not exists company_module_activations_module_idx on public.company_module_activations(module_id, status);

insert into public.company_module_activations(company_id, module_id, status, activated_at)
select c.id, installation.module_id, 'active', coalesce(installation.activated_at, installation.installed_at)
from public.companies c
join public.organization_module_installations installation on installation.organization_id = c.organization_id
where installation.status = 'active'
on conflict (company_id, module_id) do nothing;

alter table public.companies enable row level security;
alter table public.company_module_activations enable row level security;
revoke all on public.companies from anon, authenticated;
revoke all on public.company_module_activations from anon, authenticated;

create or replace function public.activate_company_module(p_company_id uuid, p_module_code text, p_occurred_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_company public.companies%rowtype; v_module public.module_catalog%rowtype; v_activation public.company_module_activations%rowtype;
begin
  select * into v_company from public.companies where id = p_company_id and status = 'active';
  if not found then raise exception 'company_not_operational'; end if;
  select * into v_module from public.module_catalog where code = p_module_code and status = 'active';
  if not found then raise exception 'module_not_found'; end if;
  if not exists(select 1 from public.organization_module_installations where organization_id = v_company.organization_id and module_id = v_module.id and status = 'active') then raise exception 'module_not_active'; end if;
  insert into public.company_module_activations(company_id,module_id,status,activated_at,suspended_at,updated_at)
  values(p_company_id,v_module.id,'active',p_occurred_at,null,p_occurred_at)
  on conflict(company_id,module_id) do update set status='active',activated_at=excluded.activated_at,suspended_at=null,updated_at=excluded.updated_at
  returning * into v_activation;
  return to_jsonb(v_activation) || jsonb_build_object('module_code', v_module.code);
end;
$$;

create or replace function public.suspend_company_module(p_company_id uuid, p_module_code text, p_occurred_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_module public.module_catalog%rowtype; v_activation public.company_module_activations%rowtype;
begin
  select * into v_module from public.module_catalog where code = p_module_code;
  if not found then raise exception 'module_not_found'; end if;
  update public.company_module_activations set status='suspended',suspended_at=p_occurred_at,updated_at=p_occurred_at
  where company_id=p_company_id and module_id=v_module.id returning * into v_activation;
  if not found then raise exception 'company_module_not_active'; end if;
  return to_jsonb(v_activation) || jsonb_build_object('module_code', v_module.code);
end;
$$;

revoke all on function public.activate_company_module(uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.suspend_company_module(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.activate_company_module(uuid,text,timestamptz) to service_role;
grant execute on function public.suspend_company_module(uuid,text,timestamptz) to service_role;
