-- P5: immutable accounting configuration revisions and document types.
create table if not exists public.shared_accounting_document_types(
 tenant_id uuid not null references public.tenants(id), company_id text not null, id text not null,
 code text not null, name text not null, prefix text not null default '', next_number bigint not null default 1 check(next_number>0),
 is_system boolean not null default false, is_active boolean not null default true, version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(tenant_id,id), unique(tenant_id,company_id,code), foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete cascade
);
create table if not exists public.shared_accounting_special_accounts(
 tenant_id uuid not null references public.tenants(id), company_id text not null,
 role text not null check(role in('net_income','retained_earnings','income_closing','expense_closing','fiscal_inflation','financial_rei','exchange_difference')),
 account_id text not null, version integer not null default 1 check(version>0), updated_at timestamptz not null default now(),
 primary key(tenant_id,company_id,role), foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete cascade,
 foreign key(tenant_id,account_id) references public.shared_accounting_accounts(tenant_id,id) on delete restrict
);
create index if not exists shared_accounting_special_accounts_account_idx on public.shared_accounting_special_accounts(tenant_id,account_id);
create table if not exists public.shared_accounting_settings_revisions(
 tenant_id uuid not null references public.tenants(id), company_id text not null, version integer not null check(version>0),
 functional_currency text not null default 'VES' check(functional_currency='VES'), reporting_currencies text[] not null default '{}',
 profile jsonb not null default '{}'::jsonb, special_accounts jsonb not null default '{}'::jsonb,
 actor_id uuid not null, created_at timestamptz not null default now(), primary key(tenant_id,company_id,version),
 foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete cascade
);
alter table public.shared_accounting_document_types enable row level security;
alter table public.shared_accounting_special_accounts enable row level security;
alter table public.shared_accounting_settings_revisions enable row level security;
revoke all on public.shared_accounting_document_types,public.shared_accounting_special_accounts,public.shared_accounting_settings_revisions from public,anon,authenticated;
grant all on public.shared_accounting_document_types,public.shared_accounting_special_accounts,public.shared_accounting_settings_revisions to service_role;
create or replace function public.accounting_protect_special_account() returns trigger language plpgsql as $$
begin
 if old.is_active and not new.is_active and exists(select 1 from public.shared_accounting_special_accounts where tenant_id=old.tenant_id and account_id=old.id) then raise exception 'ACCOUNTING_IN_USE'; end if;
 return new;
end; $$;
drop trigger if exists shared_accounting_accounts_protect_special_role on public.shared_accounting_accounts;
create trigger shared_accounting_accounts_protect_special_role before update of is_active on public.shared_accounting_accounts for each row execute function public.accounting_protect_special_account();

create or replace function public.accounting_execute_settings_command(p_scope jsonb,p_command jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_kind text:=p_command->>'kind'; v_hash text; v_receipt public.shared_accounting_command_receipts%rowtype; v_result jsonb; v_id text; v_expected integer; v_next integer; v_currency text; v_currencies text[]; v_profile jsonb; v_roles jsonb; v_role text; v_account_id text; v_account public.shared_accounting_accounts%rowtype; v_required text;
begin
 v_tenant:=public.accounting_require_scope(p_scope,'accounting.configure');
 if nullif(btrim(p_command->>'idempotencyKey'),'') is null or nullif(btrim(p_command->>'correlationId'),'') is null then raise exception 'ACCOUNTING_INVALID'; end if;
 v_hash:=md5(jsonb_strip_nulls(p_command)::text); perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||(p_scope->>'companyId')||':'||(p_command->>'idempotencyKey'),0));
 select * into v_receipt from public.shared_accounting_command_receipts where tenant_id=v_tenant and company_id=p_scope->>'companyId' and idempotency_key=p_command->>'idempotencyKey' for update;
 if found then if v_receipt.intent_hash<>v_hash then raise exception 'ACCOUNTING_IDEMPOTENCY_CONFLICT'; end if; return v_receipt.response||jsonb_build_object('replayed',true); end if;
 perform public.set_operational_audit_context((p_scope->>'actorId')::uuid,(p_scope->>'organizationId')::uuid,p_scope->>'companyId',null,null);
 if v_kind='upsert_document_type' then
  v_id:=p_command->>'documentTypeId'; insert into public.shared_accounting_document_types(tenant_id,company_id,id,code,name,prefix,next_number) values(v_tenant,p_scope->>'companyId',v_id,upper(btrim(p_command->>'code')),btrim(p_command->>'name'),coalesce(p_command->>'prefix',''),coalesce((p_command->>'nextNumber')::bigint,1)) on conflict(tenant_id,id) do update set code=excluded.code,name=excluded.name,prefix=excluded.prefix,version=shared_accounting_document_types.version+1,updated_at=now() where shared_accounting_document_types.tenant_id=v_tenant and shared_accounting_document_types.company_id=p_scope->>'companyId' and not shared_accounting_document_types.is_system;
 elsif v_kind='set_special_account' then
  v_role:=p_command->>'role'; v_account_id:=p_command->>'accountId'; select * into v_account from public.shared_accounting_accounts where tenant_id=v_tenant and company_id=p_scope->>'companyId' and id=v_account_id and is_active and account_kind='detail' for share;
  if not found then raise exception 'ACCOUNTING_INVALID'; end if;
  v_required:=case v_role when 'net_income' then 'equity' when 'retained_earnings' then 'equity' when 'income_closing' then 'revenue' when 'expense_closing' then 'expense' when 'fiscal_inflation' then 'expense' when 'financial_rei' then 'expense' else null end;
  if v_role='exchange_difference' then if v_account.type not in('revenue','expense') then raise exception 'ACCOUNTING_INVALID'; end if; elsif v_required is null or v_account.type<>v_required then raise exception 'ACCOUNTING_INVALID'; end if;
  insert into public.shared_accounting_special_accounts(tenant_id,company_id,role,account_id) values(v_tenant,p_scope->>'companyId',v_role,v_account_id) on conflict(tenant_id,company_id,role) do update set account_id=excluded.account_id,version=shared_accounting_special_accounts.version+1,updated_at=now(); v_id:=v_role;
 elsif v_kind='save_accounting_settings' then
  select coalesce(max(version),0) into v_expected from public.shared_accounting_settings_revisions where tenant_id=v_tenant and company_id=p_scope->>'companyId';
  if v_expected<>(p_command->>'expectedVersion')::integer then raise exception 'ACCOUNTING_VERSION_CONFLICT'; end if;
  v_currency:=coalesce(p_command->>'functionalCurrency','VES'); if v_currency<>'VES' then raise exception 'ACCOUNTING_INVALID'; end if;
  select coalesce(array_agg(distinct upper(currency)), '{}') into v_currencies from jsonb_array_elements_text(coalesce(p_command->'reportingCurrencies','[]'::jsonb)) as vals(currency);
  if exists(select 1 from unnest(v_currencies) as vals(currency) where currency !~ '^[A-Z]{3}$') then raise exception 'ACCOUNTING_INVALID'; end if;
  v_profile:=coalesce(p_command->'profile','{}'::jsonb); v_roles:=coalesce(p_command->'specialAccounts','{}'::jsonb);
  for v_role,v_account_id in select key,value from jsonb_each_text(v_roles) loop
   select * into v_account from public.shared_accounting_accounts where tenant_id=v_tenant and company_id=p_scope->>'companyId' and id=v_account_id and is_active and account_kind='detail'; if not found then raise exception 'ACCOUNTING_INVALID'; end if;
   v_required:=case v_role when 'net_income' then 'equity' when 'retained_earnings' then 'equity' when 'income_closing' then 'revenue' when 'expense_closing' then 'expense' when 'fiscal_inflation' then 'expense' when 'financial_rei' then 'expense' else null end;
   if (v_role='exchange_difference' and v_account.type not in('revenue','expense')) or (v_role<>'exchange_difference' and (v_required is null or v_account.type<>v_required)) then raise exception 'ACCOUNTING_INVALID'; end if;
  end loop;
  v_next:=v_expected+1; insert into public.shared_accounting_settings_revisions(tenant_id,company_id,version,functional_currency,reporting_currencies,profile,special_accounts,actor_id) values(v_tenant,p_scope->>'companyId',v_next,'VES',v_currencies,v_profile,v_roles,(p_scope->>'actorId')::uuid); v_id:=p_scope->>'companyId';
  delete from public.shared_accounting_special_accounts where tenant_id=v_tenant and company_id=p_scope->>'companyId';
  for v_role,v_account_id in select key,value from jsonb_each_text(v_roles) loop insert into public.shared_accounting_special_accounts(tenant_id,company_id,role,account_id) values(v_tenant,p_scope->>'companyId',v_role,v_account_id); end loop;
 else raise exception 'ACCOUNTING_INVALID'; end if;
 v_result:=jsonb_build_object('commandId',v_id,'replayed',false,'affectedIds',jsonb_build_array(v_id),'versions','{}'::jsonb);
 insert into public.shared_accounting_command_receipts(tenant_id,company_id,idempotency_key,intent_hash,response,correlation_id) values(v_tenant,p_scope->>'companyId',p_command->>'idempotencyKey',v_hash,v_result,p_command->>'correlationId');
 insert into public.shared_accounting_command_audit(tenant_id,id,organization_id,company_id,actor_id,kind,correlation_id,command) values(v_tenant,md5(v_tenant::text||':'||(p_scope->>'companyId')||':'||(p_command->>'idempotencyKey')),(p_scope->>'organizationId')::uuid,p_scope->>'companyId',(p_scope->>'actorId')::uuid,v_kind,p_command->>'correlationId',p_command);
 return v_result;
end; $$;

create or replace function public.accounting_query_settings(p_scope jsonb,p_query jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_tenant uuid; v_version integer;
begin
 v_tenant:=public.accounting_require_scope(p_scope,'accounting.read');
 if p_query->>'kind'='list_document_types' then return coalesce((select jsonb_agg(to_jsonb(d) order by d.code) from public.shared_accounting_document_types d where d.tenant_id=v_tenant and d.company_id=p_scope->>'companyId' and (coalesce((p_query->>'includeInactive')::boolean,false) or d.is_active)),'[]');
 elsif p_query->>'kind'='get_accounting_settings' then select max(version) into v_version from public.shared_accounting_settings_revisions where tenant_id=v_tenant and company_id=p_scope->>'companyId'; if v_version is null then return jsonb_build_object('version',0,'functionalCurrency','VES','reportingCurrencies','[]'::jsonb,'profile','{}'::jsonb,'specialAccounts','{}'::jsonb); end if; return (select jsonb_build_object('version',version,'functionalCurrency',functional_currency,'reportingCurrencies',to_jsonb(reporting_currencies),'profile',profile,'specialAccounts',special_accounts) from public.shared_accounting_settings_revisions where tenant_id=v_tenant and company_id=p_scope->>'companyId' and version=v_version);
 else raise exception 'ACCOUNTING_INVALID'; end if;
end; $$;

alter function public.shared_accounting_execute_command(jsonb,jsonb) rename to shared_accounting_execute_auxiliary_command_v1;
alter function public.shared_accounting_query(jsonb,jsonb) rename to shared_accounting_query_auxiliary_v1;
create or replace function public.shared_accounting_execute_command(p_scope jsonb,p_command jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if p_command->>'kind' in('upsert_document_type','set_special_account','save_accounting_settings') then return public.accounting_execute_settings_command(p_scope,p_command); end if;
 return public.shared_accounting_execute_auxiliary_command_v1(p_scope,p_command);
end; $$;
create or replace function public.shared_accounting_query(p_scope jsonb,p_query jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if p_query->>'kind' in('list_document_types','get_accounting_settings') then return public.accounting_query_settings(p_scope,p_query); end if;
 return public.shared_accounting_query_auxiliary_v1(p_scope,p_query);
end; $$;
revoke all on function public.accounting_execute_settings_command(jsonb,jsonb),public.accounting_query_settings(jsonb,jsonb),public.shared_accounting_execute_command(jsonb,jsonb),public.shared_accounting_query(jsonb,jsonb),public.shared_accounting_execute_auxiliary_command_v1(jsonb,jsonb),public.shared_accounting_query_auxiliary_v1(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_accounting_execute_command(jsonb,jsonb),public.shared_accounting_query(jsonb,jsonb) to service_role;
grant execute on function public.shared_accounting_execute_auxiliary_command_v1(jsonb,jsonb),public.shared_accounting_query_auxiliary_v1(jsonb,jsonb) to service_role;
