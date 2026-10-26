-- P4: references to business-owned third parties stay projections; only "other"
-- auxiliaries are owned by accounting.
create table if not exists public.shared_accounting_auxiliary_sources(
 tenant_id uuid not null references public.tenants(id), company_id text not null,
 auxiliary_type text not null check(auxiliary_type in('customer','supplier','employee','beneficiary')),
 is_enabled boolean not null default false, version integer not null default 1 check(version>0), updated_at timestamptz not null default now(),
 primary key(tenant_id,company_id,auxiliary_type), foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete cascade
);
create table if not exists public.shared_accounting_other_auxiliaries(
 tenant_id uuid not null references public.tenants(id), company_id text not null, id text not null,
 code text not null, name text not null, is_active boolean not null default true, version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(tenant_id,id), unique(tenant_id,company_id,code), foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete cascade
);
create index if not exists shared_accounting_auxiliary_sources_company_idx on public.shared_accounting_auxiliary_sources(tenant_id,company_id);
alter table public.shared_accounting_auxiliary_sources enable row level security;
alter table public.shared_accounting_other_auxiliaries enable row level security;
revoke all on public.shared_accounting_auxiliary_sources,public.shared_accounting_other_auxiliaries from public,anon,authenticated;
grant all on public.shared_accounting_auxiliary_sources,public.shared_accounting_other_auxiliaries to service_role;

create or replace function public.accounting_execute_auxiliary_command(p_scope jsonb,p_command jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_id text; v_hash text; v_receipt public.shared_accounting_command_receipts%rowtype; v_result jsonb; v_kind text:=p_command->>'kind'; v_type text:=p_command->>'auxiliaryType';
begin
 v_tenant:=public.accounting_require_scope(p_scope,'accounting.masters.manage');
 if nullif(btrim(p_command->>'idempotencyKey'),'') is null or nullif(btrim(p_command->>'correlationId'),'') is null then raise exception 'ACCOUNTING_INVALID'; end if;
 v_hash:=md5(jsonb_strip_nulls(p_command)::text); perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||(p_scope->>'companyId')||':'||(p_command->>'idempotencyKey'),0));
 select * into v_receipt from public.shared_accounting_command_receipts where tenant_id=v_tenant and company_id=p_scope->>'companyId' and idempotency_key=p_command->>'idempotencyKey' for update;
 if found then if v_receipt.intent_hash<>v_hash then raise exception 'ACCOUNTING_IDEMPOTENCY_CONFLICT'; end if; return v_receipt.response||jsonb_build_object('replayed',true); end if;
 perform public.set_operational_audit_context((p_scope->>'actorId')::uuid,(p_scope->>'organizationId')::uuid,p_scope->>'companyId',null,null);
 if v_kind='set_auxiliary_source_enabled' then
  if v_type not in('customer','supplier','employee','beneficiary') then raise exception 'ACCOUNTING_INVALID'; end if;
  insert into public.shared_accounting_auxiliary_sources(tenant_id,company_id,auxiliary_type,is_enabled) values(v_tenant,p_scope->>'companyId',v_type,(p_command->>'isEnabled')::boolean) on conflict(tenant_id,company_id,auxiliary_type) do update set is_enabled=excluded.is_enabled,version=shared_accounting_auxiliary_sources.version+1,updated_at=now(); v_id:=v_type;
 elsif v_kind='upsert_other_auxiliary' then
  v_id:=p_command->>'auxiliaryId'; if nullif(btrim(p_command->>'code'),'') is null or nullif(btrim(p_command->>'name'),'') is null then raise exception 'ACCOUNTING_INVALID'; end if;
  insert into public.shared_accounting_other_auxiliaries(tenant_id,company_id,id,code,name) values(v_tenant,p_scope->>'companyId',v_id,upper(btrim(p_command->>'code')),btrim(p_command->>'name')) on conflict(tenant_id,id) do update set code=excluded.code,name=excluded.name,version=shared_accounting_other_auxiliaries.version+1,updated_at=now() where shared_accounting_other_auxiliaries.tenant_id=v_tenant and shared_accounting_other_auxiliaries.company_id=p_scope->>'companyId';
 elsif v_kind='set_other_auxiliary_active' then
  v_id:=p_command->>'auxiliaryId'; update public.shared_accounting_other_auxiliaries set is_active=(p_command->>'isActive')::boolean,version=version+1,updated_at=now() where tenant_id=v_tenant and company_id=p_scope->>'companyId' and id=v_id and version=(p_command->>'expectedVersion')::integer; if not found then raise exception 'ACCOUNTING_VERSION_CONFLICT'; end if;
 else raise exception 'ACCOUNTING_INVALID'; end if;
 v_result:=jsonb_build_object('commandId',v_id,'replayed',false,'affectedIds',jsonb_build_array(v_id),'versions','{}'::jsonb);
 insert into public.shared_accounting_command_receipts(tenant_id,company_id,idempotency_key,intent_hash,response,correlation_id) values(v_tenant,p_scope->>'companyId',p_command->>'idempotencyKey',v_hash,v_result,p_command->>'correlationId');
 insert into public.shared_accounting_command_audit(tenant_id,id,organization_id,company_id,actor_id,kind,correlation_id,command) values(v_tenant,md5(v_tenant::text||':'||(p_scope->>'companyId')||':'||(p_command->>'idempotencyKey')),(p_scope->>'organizationId')::uuid,p_scope->>'companyId',(p_scope->>'actorId')::uuid,v_kind,p_command->>'correlationId',p_command);
 return v_result;
end; $$;

create or replace function public.accounting_query_auxiliaries(p_scope jsonb,p_query jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_tenant uuid; v_type text:=p_query->>'auxiliaryType';
begin
 v_tenant:=public.accounting_require_scope(p_scope,'accounting.read');
 if p_query->>'kind'='list_auxiliaries' then
  if v_type='customer' then return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'code',c.rif,'name',c.name,'type','customer','sourceId',c.id,'isActive',c.active) order by c.name) from public.shared_inventory_customers c where c.tenant_id=v_tenant and c.company_id=p_scope->>'companyId' and exists(select 1 from public.shared_accounting_auxiliary_sources s where s.tenant_id=v_tenant and s.company_id=p_scope->>'companyId' and s.auxiliary_type='customer' and s.is_enabled)),'[]');
  elsif v_type='supplier' then return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.rif,'name',s.name,'type','supplier','sourceId',s.id,'isActive',s.active) order by s.name) from public.shared_inventory_suppliers s where s.tenant_id=v_tenant and s.company_id=p_scope->>'companyId' and exists(select 1 from public.shared_accounting_auxiliary_sources x where x.tenant_id=v_tenant and x.company_id=p_scope->>'companyId' and x.auxiliary_type='supplier' and x.is_enabled)),'[]');
  elsif v_type='employee' then return coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'code',e.cedula,'name',e.nombre,'type','employee','sourceId',e.id,'isActive',e.estado='activo') order by e.nombre) from public.shared_employees e where e.tenant_id=v_tenant and e.company_id=p_scope->>'companyId' and exists(select 1 from public.shared_accounting_auxiliary_sources x where x.tenant_id=v_tenant and x.company_id=p_scope->>'companyId' and x.auxiliary_type='employee' and x.is_enabled)),'[]');
  elsif v_type='beneficiary' then return coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'code',b.tax_identifier,'name',b.legal_name,'type','beneficiary','sourceId',b.id,'isActive',b.status='active') order by b.legal_name) from public.shared_treasury_beneficiaries b where b.tenant_id=v_tenant and b.company_id=p_scope->>'companyId' and exists(select 1 from public.shared_accounting_auxiliary_sources x where x.tenant_id=v_tenant and x.company_id=p_scope->>'companyId' and x.auxiliary_type='beneficiary' and x.is_enabled)),'[]');
  elsif v_type='other' then return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'code',o.code,'name',o.name,'type','other','sourceId',o.id,'isActive',o.is_active) order by o.code) from public.shared_accounting_other_auxiliaries o where o.tenant_id=v_tenant and o.company_id=p_scope->>'companyId' and (coalesce((p_query->>'includeInactive')::boolean,false) or o.is_active)),'[]');
  else raise exception 'ACCOUNTING_INVALID'; end if;
 elsif p_query->>'kind'='list_auxiliary_sources' then return coalesce((select jsonb_agg(jsonb_build_object('auxiliaryType',auxiliary_type,'isEnabled',is_enabled,'version',version) order by auxiliary_type) from public.shared_accounting_auxiliary_sources where tenant_id=v_tenant and company_id=p_scope->>'companyId'),'[]');
 else raise exception 'ACCOUNTING_INVALID'; end if;
end; $$;

alter function public.shared_accounting_execute_command(jsonb,jsonb) rename to shared_accounting_execute_dimensions_command_v1;
alter function public.shared_accounting_query(jsonb,jsonb) rename to shared_accounting_query_dimensions_v1;
create or replace function public.shared_accounting_execute_command(p_scope jsonb,p_command jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if p_command->>'kind' in('set_auxiliary_source_enabled','upsert_other_auxiliary','set_other_auxiliary_active') then return public.accounting_execute_auxiliary_command(p_scope,p_command); end if;
 return public.shared_accounting_execute_dimensions_command_v1(p_scope,p_command);
end; $$;
create or replace function public.shared_accounting_query(p_scope jsonb,p_query jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if p_query->>'kind' in('list_auxiliaries','list_auxiliary_sources') then return public.accounting_query_auxiliaries(p_scope,p_query); end if;
 return public.shared_accounting_query_dimensions_v1(p_scope,p_query);
end; $$;
revoke all on function public.accounting_execute_auxiliary_command(jsonb,jsonb),public.accounting_query_auxiliaries(jsonb,jsonb),public.shared_accounting_execute_command(jsonb,jsonb),public.shared_accounting_query(jsonb,jsonb),public.shared_accounting_execute_dimensions_command_v1(jsonb,jsonb),public.shared_accounting_query_dimensions_v1(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_accounting_execute_command(jsonb,jsonb),public.shared_accounting_query(jsonb,jsonb) to service_role;
grant execute on function public.shared_accounting_execute_dimensions_command_v1(jsonb,jsonb),public.shared_accounting_query_dimensions_v1(jsonb,jsonb) to service_role;
