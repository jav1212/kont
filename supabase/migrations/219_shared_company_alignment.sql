-- Company-level module state remains attached to shared_companies, the single
-- company source used by every client.
create table if not exists public.shared_company_module_activations(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,company_id text not null,module_id uuid not null references public.module_catalog(id) on delete restrict,
 status text not null default 'active' check(status in('active','suspended')),configuration_version integer not null default 1 check(configuration_version>0),
 activated_at timestamptz not null default now(),suspended_at timestamptz,updated_at timestamptz not null default now(),
 foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete cascade,unique(tenant_id,company_id,module_id)
);
create index if not exists shared_company_module_activations_lookup_idx on public.shared_company_module_activations(company_id,status);
insert into public.shared_company_module_activations(id,tenant_id,company_id,module_id,status,configuration_version,activated_at,suspended_at,updated_at)
select activation.id,shared.tenant_id,shared.id,activation.module_id,activation.status,activation.configuration_version,activation.activated_at,activation.suspended_at,activation.updated_at
from public.company_module_activations activation join public.companies company on company.id=activation.company_id
join public.shared_companies shared on shared.organization_id=company.organization_id and shared.id=company.legacy_company_id
on conflict(tenant_id,company_id,module_id)do update set status=excluded.status,configuration_version=excluded.configuration_version,activated_at=excluded.activated_at,suspended_at=excluded.suspended_at,updated_at=excluded.updated_at;
alter table public.shared_company_module_activations enable row level security;
revoke all on public.shared_company_module_activations from anon,authenticated;

create or replace function public.activate_shared_company_module(p_company_id text,p_module_code text,p_occurred_at timestamptz)returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company public.shared_companies%rowtype;v_module public.module_catalog%rowtype;v_activation public.shared_company_module_activations%rowtype;
begin select * into v_company from public.shared_companies where id=p_company_id;if not found then raise exception 'company_not_operational';end if;
select * into v_module from public.module_catalog where code=p_module_code and status='active';if not found then raise exception 'module_not_found';end if;
if not exists(select 1 from public.organization_module_installations where organization_id=v_company.organization_id and module_id=v_module.id and status='active')then raise exception 'module_not_active';end if;
insert into public.shared_company_module_activations(tenant_id,company_id,module_id,status,activated_at,suspended_at,updated_at)values(v_company.tenant_id,p_company_id,v_module.id,'active',p_occurred_at,null,p_occurred_at)
on conflict(tenant_id,company_id,module_id)do update set status='active',activated_at=excluded.activated_at,suspended_at=null,updated_at=excluded.updated_at returning * into v_activation;
return to_jsonb(v_activation)||jsonb_build_object('module_code',v_module.code);end $$;
create or replace function public.suspend_shared_company_module(p_company_id text,p_module_code text,p_occurred_at timestamptz)returns jsonb language plpgsql security definer set search_path=public as $$
declare v_module public.module_catalog%rowtype;v_activation public.shared_company_module_activations%rowtype;
begin select * into v_module from public.module_catalog where code=p_module_code;if not found then raise exception 'module_not_found';end if;
update public.shared_company_module_activations set status='suspended',suspended_at=p_occurred_at,updated_at=p_occurred_at where company_id=p_company_id and module_id=v_module.id returning * into v_activation;
if not found then raise exception 'company_module_not_active';end if;return to_jsonb(v_activation)||jsonb_build_object('module_code',v_module.code);end $$;
revoke all on function public.activate_shared_company_module(text,text,timestamptz),public.suspend_shared_company_module(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.activate_shared_company_module(text,text,timestamptz),public.suspend_shared_company_module(text,text,timestamptz) to service_role;
