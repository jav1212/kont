-- P3: account-owned analytical dimensions. Tables remain inaccessible to
-- client roles; all writes pass through the accounting command boundary.
insert into public.access_control_permissions(code,resource,action,description) values
 ('accounting.masters.manage','accounting.masters','manage','Gestionar maestros contables')
on conflict(code) do update set resource=excluded.resource,action=excluded.action,description=excluded.description;
insert into public.organization_role_permissions(role_id,permission_code)
select r.id,'accounting.masters.manage' from public.organization_roles r
where r.code in('owner','admin') and r.status='active' on conflict do nothing;

create table if not exists public.shared_accounting_cost_centers(
 tenant_id uuid not null references public.tenants(id), company_id text not null, id text not null,
 code text not null, name text not null, parent_id text, is_active boolean not null default true,
 version integer not null default 1 check(version>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(tenant_id,id), unique(tenant_id,company_id,code),
 foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete cascade,
 foreign key(tenant_id,parent_id) references public.shared_accounting_cost_centers(tenant_id,id) on delete restrict
);
create index if not exists shared_accounting_cost_centers_parent_idx on public.shared_accounting_cost_centers(tenant_id,company_id,parent_id);

create table if not exists public.shared_accounting_expense_classes(
 tenant_id uuid not null references public.tenants(id), company_id text not null, id text not null,
 code text not null, name text not null, account_id text not null, is_active boolean not null default true,
 version integer not null default 1 check(version>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(tenant_id,id), unique(tenant_id,company_id,code),
 foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete cascade,
 foreign key(tenant_id,account_id) references public.shared_accounting_accounts(tenant_id,id) on delete restrict
);
create index if not exists shared_accounting_expense_classes_account_idx on public.shared_accounting_expense_classes(tenant_id,account_id);

create table if not exists public.shared_accounting_attributes(
 tenant_id uuid not null references public.tenants(id), company_id text not null, id text not null,
 code text not null, name text not null, data_type text not null check(data_type in('text','number','date','boolean','option')),
 is_active boolean not null default true, version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(tenant_id,id), unique(tenant_id,company_id,code),
 foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete cascade
);
create table if not exists public.shared_accounting_attribute_values(
 tenant_id uuid not null references public.tenants(id), company_id text not null, id text not null,
 attribute_id text not null, code text not null, label text not null, sort_order integer not null default 0,
 is_active boolean not null default true, version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(tenant_id,id), unique(tenant_id,attribute_id,code),
 foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete cascade,
 foreign key(tenant_id,attribute_id) references public.shared_accounting_attributes(tenant_id,id) on delete restrict
);
create index if not exists shared_accounting_attribute_values_attribute_idx on public.shared_accounting_attribute_values(tenant_id,attribute_id,sort_order);

create table if not exists public.shared_accounting_account_dimensions(
 tenant_id uuid not null references public.tenants(id), company_id text not null, account_id text not null,
 cost_center_policy text not null default 'none' check(cost_center_policy in('none','optional','required')),
 allowed_cost_center_ids text[] not null default '{}', auxiliary_type text not null default 'none'
  check(auxiliary_type in('none','customer','supplier','employee','beneficiary','other')),
 auxiliary_required boolean not null default false, version integer not null default 1 check(version>0), updated_at timestamptz not null default now(),
 primary key(tenant_id,account_id),
 foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete cascade,
 foreign key(tenant_id,account_id) references public.shared_accounting_accounts(tenant_id,id) on delete cascade,
 check(auxiliary_type<>'none' or not auxiliary_required)
);
create table if not exists public.shared_accounting_account_attributes(
 tenant_id uuid not null references public.tenants(id), company_id text not null, account_id text not null,
 attribute_id text not null, is_required boolean not null default false,
 primary key(tenant_id,account_id,attribute_id),
 foreign key(tenant_id,account_id) references public.shared_accounting_accounts(tenant_id,id) on delete cascade,
 foreign key(tenant_id,attribute_id) references public.shared_accounting_attributes(tenant_id,id) on delete restrict
);
create index if not exists shared_accounting_account_attributes_attribute_idx on public.shared_accounting_account_attributes(tenant_id,attribute_id);

alter table public.shared_accounting_cost_centers enable row level security;
alter table public.shared_accounting_expense_classes enable row level security;
alter table public.shared_accounting_attributes enable row level security;
alter table public.shared_accounting_attribute_values enable row level security;
alter table public.shared_accounting_account_dimensions enable row level security;
alter table public.shared_accounting_account_attributes enable row level security;
revoke all on public.shared_accounting_cost_centers,public.shared_accounting_expense_classes,public.shared_accounting_attributes,public.shared_accounting_attribute_values,public.shared_accounting_account_dimensions,public.shared_accounting_account_attributes from public,anon,authenticated;
grant all on public.shared_accounting_cost_centers,public.shared_accounting_expense_classes,public.shared_accounting_attributes,public.shared_accounting_attribute_values,public.shared_accounting_account_dimensions,public.shared_accounting_account_attributes to service_role;

create or replace function public.accounting_execute_dimension_command(p_scope jsonb,p_command jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_kind text:=p_command->>'kind'; v_id text; v_hash text; v_receipt public.shared_accounting_command_receipts%rowtype; v_result jsonb; v_row record; v_account public.shared_accounting_accounts%rowtype; v_center text; v_attr jsonb;
begin
 v_tenant:=public.accounting_require_scope(p_scope,'accounting.masters.manage');
 if p_command is null or jsonb_typeof(p_command)<>'object' or nullif(btrim(p_command->>'idempotencyKey'),'') is null or nullif(btrim(p_command->>'correlationId'),'') is null then raise exception 'ACCOUNTING_INVALID'; end if;
 v_hash:=md5(jsonb_strip_nulls(p_command)::text); perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||(p_scope->>'companyId')||':'||(p_command->>'idempotencyKey'),0));
 select * into v_receipt from public.shared_accounting_command_receipts where tenant_id=v_tenant and company_id=p_scope->>'companyId' and idempotency_key=p_command->>'idempotencyKey' for update;
 if found then if v_receipt.intent_hash<>v_hash then raise exception 'ACCOUNTING_IDEMPOTENCY_CONFLICT'; end if; return v_receipt.response||jsonb_build_object('replayed',true); end if;
 perform public.set_operational_audit_context((p_scope->>'actorId')::uuid,(p_scope->>'organizationId')::uuid,p_scope->>'companyId',null,null);
 if v_kind='create_cost_center' then
  v_id:=p_command->>'costCenterId'; if nullif(btrim(p_command->>'code'),'') is null or nullif(btrim(p_command->>'name'),'') is null then raise exception 'ACCOUNTING_INVALID'; end if;
  if p_command->>'parentId' is not null and not exists(select 1 from public.shared_accounting_cost_centers where tenant_id=v_tenant and company_id=p_scope->>'companyId' and id=p_command->>'parentId' and is_active) then raise exception 'ACCOUNTING_PARENT_INVALID'; end if;
  insert into public.shared_accounting_cost_centers(tenant_id,company_id,id,code,name,parent_id) values(v_tenant,p_scope->>'companyId',v_id,upper(btrim(p_command->>'code')),btrim(p_command->>'name'),nullif(p_command->>'parentId',''));
 elsif v_kind='set_cost_center_active' then
  update public.shared_accounting_cost_centers set is_active=(p_command->>'isActive')::boolean,version=version+1,updated_at=now() where tenant_id=v_tenant and company_id=p_scope->>'companyId' and id=p_command->>'costCenterId' and version=(p_command->>'expectedVersion')::integer;
  if not found then raise exception 'ACCOUNTING_VERSION_CONFLICT'; end if;
  if not (p_command->>'isActive')::boolean and exists(select 1 from public.shared_accounting_cost_centers where tenant_id=v_tenant and parent_id=p_command->>'costCenterId' and is_active) then raise exception 'ACCOUNTING_HAS_CHILDREN'; end if;
 elsif v_kind='upsert_expense_class' then
  v_id:=p_command->>'expenseClassId'; select * into v_account from public.shared_accounting_accounts where tenant_id=v_tenant and company_id=p_scope->>'companyId' and id=p_command->>'accountId' for share;
  if not found or not v_account.is_active or v_account.account_kind<>'detail' or v_account.type<>'expense' then raise exception 'ACCOUNTING_INVALID'; end if;
  insert into public.shared_accounting_expense_classes(tenant_id,company_id,id,code,name,account_id) values(v_tenant,p_scope->>'companyId',v_id,upper(btrim(p_command->>'code')),btrim(p_command->>'name'),p_command->>'accountId') on conflict(tenant_id,id) do update set code=excluded.code,name=excluded.name,account_id=excluded.account_id,version=shared_accounting_expense_classes.version+1,updated_at=now() where shared_accounting_expense_classes.tenant_id=v_tenant and shared_accounting_expense_classes.company_id=p_scope->>'companyId';
 elsif v_kind='upsert_accounting_attribute' then
  v_id:=p_command->>'attributeId'; insert into public.shared_accounting_attributes(tenant_id,company_id,id,code,name,data_type) values(v_tenant,p_scope->>'companyId',v_id,upper(btrim(p_command->>'code')),btrim(p_command->>'name'),p_command->>'dataType') on conflict(tenant_id,id) do update set code=excluded.code,name=excluded.name,data_type=excluded.data_type,version=shared_accounting_attributes.version+1,updated_at=now() where shared_accounting_attributes.tenant_id=v_tenant and shared_accounting_attributes.company_id=p_scope->>'companyId';
 elsif v_kind='upsert_attribute_value' then
  v_id:=p_command->>'valueId'; if not exists(select 1 from public.shared_accounting_attributes where tenant_id=v_tenant and company_id=p_scope->>'companyId' and id=p_command->>'attributeId' and data_type='option' and is_active) then raise exception 'ACCOUNTING_INVALID'; end if;
  insert into public.shared_accounting_attribute_values(tenant_id,company_id,id,attribute_id,code,label,sort_order) values(v_tenant,p_scope->>'companyId',v_id,p_command->>'attributeId',upper(btrim(p_command->>'code')),btrim(p_command->>'label'),coalesce((p_command->>'sortOrder')::integer,0)) on conflict(tenant_id,id) do update set code=excluded.code,label=excluded.label,sort_order=excluded.sort_order,version=shared_accounting_attribute_values.version+1,updated_at=now() where shared_accounting_attribute_values.tenant_id=v_tenant and shared_accounting_attribute_values.company_id=p_scope->>'companyId';
 elsif v_kind='set_account_dimensions' then
  v_id:=p_command->>'accountId'; select * into v_account from public.shared_accounting_accounts where tenant_id=v_tenant and company_id=p_scope->>'companyId' and id=v_id and account_kind='detail' for update; if not found then raise exception 'ACCOUNTING_NOT_FOUND'; end if;
  for v_center in select jsonb_array_elements_text(coalesce(p_command->'allowedCostCenterIds','[]'::jsonb)) loop if not exists(select 1 from public.shared_accounting_cost_centers where tenant_id=v_tenant and company_id=p_scope->>'companyId' and id=v_center and is_active) then raise exception 'ACCOUNTING_INVALID'; end if; end loop;
  insert into public.shared_accounting_account_dimensions(tenant_id,company_id,account_id,cost_center_policy,allowed_cost_center_ids,auxiliary_type,auxiliary_required,version) values(v_tenant,p_scope->>'companyId',v_id,coalesce(p_command->>'costCenterPolicy','none'),array(select jsonb_array_elements_text(coalesce(p_command->'allowedCostCenterIds','[]'::jsonb))),coalesce(p_command->>'auxiliaryType','none'),coalesce((p_command->>'auxiliaryRequired')::boolean,false),1) on conflict(tenant_id,account_id) do update set cost_center_policy=excluded.cost_center_policy,allowed_cost_center_ids=excluded.allowed_cost_center_ids,auxiliary_type=excluded.auxiliary_type,auxiliary_required=excluded.auxiliary_required,version=shared_accounting_account_dimensions.version+1,updated_at=now();
  delete from public.shared_accounting_account_attributes where tenant_id=v_tenant and account_id=v_id;
  for v_attr in select value from jsonb_array_elements(coalesce(p_command->'attributes','[]'::jsonb)) loop if not exists(select 1 from public.shared_accounting_attributes where tenant_id=v_tenant and company_id=p_scope->>'companyId' and id=v_attr->>'attributeId' and is_active) then raise exception 'ACCOUNTING_INVALID'; end if; insert into public.shared_accounting_account_attributes(tenant_id,company_id,account_id,attribute_id,is_required) values(v_tenant,p_scope->>'companyId',v_id,v_attr->>'attributeId',coalesce((v_attr->>'required')::boolean,false)); end loop;
 else raise exception 'ACCOUNTING_INVALID'; end if;
 v_result:=jsonb_build_object('commandId',v_id,'replayed',false,'affectedIds',jsonb_build_array(v_id),'versions','{}'::jsonb);
 insert into public.shared_accounting_command_receipts(tenant_id,company_id,idempotency_key,intent_hash,response,correlation_id) values(v_tenant,p_scope->>'companyId',p_command->>'idempotencyKey',v_hash,v_result,p_command->>'correlationId');
 insert into public.shared_accounting_command_audit(tenant_id,id,organization_id,company_id,actor_id,kind,correlation_id,command) values(v_tenant,md5(v_tenant::text||':'||(p_scope->>'companyId')||':'||(p_command->>'idempotencyKey')),(p_scope->>'organizationId')::uuid,p_scope->>'companyId',(p_scope->>'actorId')::uuid,v_kind,p_command->>'correlationId',p_command);
 return v_result;
end; $$;

create or replace function public.accounting_query_dimensions(p_scope jsonb,p_query jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_tenant uuid; v_kind text:=p_query->>'kind';
begin
 v_tenant:=public.accounting_require_scope(p_scope,'accounting.read');
 if v_kind='list_cost_centers' then return coalesce((select jsonb_agg(to_jsonb(x) order by code) from public.shared_accounting_cost_centers x where tenant_id=v_tenant and company_id=p_scope->>'companyId' and (coalesce((p_query->>'includeInactive')::boolean,false) or is_active)),'[]');
 elsif v_kind='list_expense_classes' then return coalesce((select jsonb_agg(to_jsonb(x) order by code) from public.shared_accounting_expense_classes x where tenant_id=v_tenant and company_id=p_scope->>'companyId' and (coalesce((p_query->>'includeInactive')::boolean,false) or is_active)),'[]');
 elsif v_kind='list_accounting_attributes' then return coalesce((select jsonb_agg(to_jsonb(x) order by code) from public.shared_accounting_attributes x where tenant_id=v_tenant and company_id=p_scope->>'companyId' and (coalesce((p_query->>'includeInactive')::boolean,false) or is_active)),'[]');
 elsif v_kind='list_attribute_values' then return coalesce((select jsonb_agg(to_jsonb(x) order by sort_order,code) from public.shared_accounting_attribute_values x where tenant_id=v_tenant and company_id=p_scope->>'companyId' and attribute_id=p_query->>'attributeId' and (coalesce((p_query->>'includeInactive')::boolean,false) or is_active)),'[]');
 elsif v_kind='get_account_dimensions' then return jsonb_build_object('dimensions',(select to_jsonb(d) from public.shared_accounting_account_dimensions d where tenant_id=v_tenant and company_id=p_scope->>'companyId' and account_id=p_query->>'accountId'),'attributes',coalesce((select jsonb_agg(jsonb_build_object('attributeId',attribute_id,'required',is_required)) from public.shared_accounting_account_attributes where tenant_id=v_tenant and company_id=p_scope->>'companyId' and account_id=p_query->>'accountId'),'[]'));
 else raise exception 'ACCOUNTING_INVALID'; end if;
end; $$;

alter function public.shared_accounting_execute_command(jsonb,jsonb) rename to shared_accounting_execute_chart_command_v1;
alter function public.shared_accounting_query(jsonb,jsonb) rename to shared_accounting_query_chart_v1;
create or replace function public.shared_accounting_execute_command(p_scope jsonb,p_command jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if p_command->>'kind' in('create_cost_center','set_cost_center_active','upsert_expense_class','upsert_accounting_attribute','upsert_attribute_value','set_account_dimensions') then return public.accounting_execute_dimension_command(p_scope,p_command); end if;
 return public.shared_accounting_execute_chart_command_v1(p_scope,p_command);
end; $$;
create or replace function public.shared_accounting_query(p_scope jsonb,p_query jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if p_query->>'kind' in('list_cost_centers','list_expense_classes','list_accounting_attributes','list_attribute_values','get_account_dimensions') then return public.accounting_query_dimensions(p_scope,p_query); end if;
 return public.shared_accounting_query_chart_v1(p_scope,p_query);
end; $$;
revoke all on function public.accounting_execute_dimension_command(jsonb,jsonb),public.accounting_query_dimensions(jsonb,jsonb),public.shared_accounting_execute_command(jsonb,jsonb),public.shared_accounting_query(jsonb,jsonb),public.shared_accounting_execute_chart_command_v1(jsonb,jsonb),public.shared_accounting_query_chart_v1(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_accounting_execute_command(jsonb,jsonb),public.shared_accounting_query(jsonb,jsonb) to service_role;
grant execute on function public.shared_accounting_execute_chart_command_v1(jsonb,jsonb),public.shared_accounting_query_chart_v1(jsonb,jsonb) to service_role;
