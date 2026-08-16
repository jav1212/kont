-- Company identifiers are only unique inside their organization/tenant.
create or replace function public.list_shared_company_module_activations(p_organization_id uuid,p_company_id text)
returns setof jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(activation)||jsonb_build_object('module_code',module.code)
 from public.shared_company_module_activations activation
 join public.shared_companies company on company.tenant_id=activation.tenant_id and company.id=activation.company_id
 join public.module_catalog module on module.id=activation.module_id
 where company.organization_id=p_organization_id and activation.company_id=p_company_id
$$;
create or replace function public.activate_shared_company_module(p_organization_id uuid,p_company_id text,p_module_code text,p_occurred_at timestamptz)returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company public.shared_companies%rowtype;v_module public.module_catalog%rowtype;v_activation public.shared_company_module_activations%rowtype;
begin select * into v_company from public.shared_companies where organization_id=p_organization_id and id=p_company_id;if not found then raise exception 'company_not_operational';end if;
select * into v_module from public.module_catalog where code=p_module_code and status='active';if not found then raise exception 'module_not_found';end if;
if not exists(select 1 from public.organization_module_installations where organization_id=p_organization_id and module_id=v_module.id and status='active')then raise exception 'module_not_active';end if;
insert into public.shared_company_module_activations(tenant_id,company_id,module_id,status,activated_at,suspended_at,updated_at)values(v_company.tenant_id,p_company_id,v_module.id,'active',p_occurred_at,null,p_occurred_at)
on conflict(tenant_id,company_id,module_id)do update set status='active',activated_at=excluded.activated_at,suspended_at=null,updated_at=excluded.updated_at returning * into v_activation;
return to_jsonb(v_activation)||jsonb_build_object('module_code',v_module.code);end $$;
create or replace function public.suspend_shared_company_module(p_organization_id uuid,p_company_id text,p_module_code text,p_occurred_at timestamptz)returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company public.shared_companies%rowtype;v_module public.module_catalog%rowtype;v_activation public.shared_company_module_activations%rowtype;
begin select * into v_company from public.shared_companies where organization_id=p_organization_id and id=p_company_id;if not found then raise exception 'company_not_operational';end if;
select * into v_module from public.module_catalog where code=p_module_code;if not found then raise exception 'module_not_found';end if;
update public.shared_company_module_activations set status='suspended',suspended_at=p_occurred_at,updated_at=p_occurred_at where tenant_id=v_company.tenant_id and company_id=p_company_id and module_id=v_module.id returning * into v_activation;
if not found then raise exception 'company_module_not_active';end if;return to_jsonb(v_activation)||jsonb_build_object('module_code',v_module.code);end $$;
revoke all on function public.list_shared_company_module_activations(uuid,text),public.activate_shared_company_module(uuid,text,text,timestamptz),public.suspend_shared_company_module(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.list_shared_company_module_activations(uuid,text),public.activate_shared_company_module(uuid,text,text,timestamptz),public.suspend_shared_company_module(uuid,text,text,timestamptz) to service_role;
drop function if exists public.activate_shared_company_module(text,text,timestamptz);
drop function if exists public.suspend_shared_company_module(text,text,timestamptz);
