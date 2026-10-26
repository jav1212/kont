-- ACC-001..017. Additive persistence for the portable accounting chart package.
-- Existing chart/account APIs remain available during the Web cutover.
insert into public.access_control_permissions(code,resource,action,description) values
 ('accounting.chart.manage','accounting.chart','manage','Gestionar plan y cuentas contables'),
 ('accounting.masters.manage','accounting.masters','manage','Gestionar maestros contables'),
 ('accounting.configure','accounting','configure','Configurar contabilidad')
on conflict(code) do update set resource=excluded.resource,action=excluded.action,description=excluded.description;
insert into public.organization_role_permissions(role_id,permission_code)
select r.id,p.code from public.organization_roles r cross join (values ('accounting.chart.manage'),('accounting.masters.manage'),('accounting.configure')) p(code)
where r.code in ('owner','admin') and r.status='active' on conflict do nothing;

alter table public.shared_accounting_charts add column if not exists status text not null default 'draft' check(status in('draft','active','archived'));
alter table public.shared_accounting_charts add column if not exists code_structure jsonb;
alter table public.shared_accounting_charts add column if not exists structure_version integer not null default 1 check(structure_version>0);
alter table public.shared_accounting_charts add column if not exists version integer not null default 1 check(version>0);
alter table public.shared_accounting_accounts add column if not exists account_kind text;
alter table public.shared_accounting_accounts add column if not exists is_memorandum boolean not null default false;
alter table public.shared_accounting_accounts add column if not exists normal_balance text;
alter table public.shared_accounting_accounts add column if not exists normal_balance_override_reason text;
alter table public.shared_accounting_accounts add column if not exists memorandum_counterpart_id text;
alter table public.shared_accounting_accounts add column if not exists monetary_class text;
alter table public.shared_accounting_accounts add column if not exists version integer not null default 1 check(version>0);
alter table public.shared_accounting_accounts add column if not exists classification_reason text;
update public.shared_accounting_charts set code_structure=jsonb_build_object('segments',jsonb_build_array(jsonb_build_object('length',1,'separator',null),jsonb_build_object('length',1,'separator','.'),jsonb_build_object('length',2,'separator','.'),jsonb_build_object('length',2,'separator','.'),jsonb_build_object('length',3,'separator','.'))) where code_structure is null;
update public.shared_accounting_accounts set account_kind=case when is_group then 'summary' else 'detail' end where account_kind is null;
update public.shared_accounting_accounts set normal_balance=case when type in('asset','expense') then 'debit' else 'credit' end where normal_balance is null;
alter table public.shared_accounting_accounts alter column account_kind set not null;
alter table public.shared_accounting_accounts alter column normal_balance set not null;
alter table public.shared_accounting_accounts drop constraint if exists shared_accounting_accounts_account_kind_check;
alter table public.shared_accounting_accounts add constraint shared_accounting_accounts_account_kind_check check(account_kind in('detail','summary'));
alter table public.shared_accounting_accounts drop constraint if exists shared_accounting_accounts_normal_balance_check;
alter table public.shared_accounting_accounts add constraint shared_accounting_accounts_normal_balance_check check(normal_balance in('debit','credit'));
alter table public.shared_accounting_accounts drop constraint if exists shared_accounting_accounts_monetary_class_check;
alter table public.shared_accounting_accounts add constraint shared_accounting_accounts_monetary_class_check check(monetary_class is null or monetary_class in('monetary','non_monetary'));
alter table public.shared_accounting_accounts drop constraint if exists shared_accounting_accounts_memorandum_counterpart_fkey;
alter table public.shared_accounting_accounts add constraint shared_accounting_accounts_memorandum_counterpart_fkey foreign key(tenant_id,memorandum_counterpart_id) references public.shared_accounting_accounts(tenant_id,id) on delete restrict;
alter table public.shared_accounting_accounts drop constraint if exists shared_accounting_accounts_tenant_id_company_id_code_key;
create unique index if not exists shared_accounting_account_chart_code_unique on public.shared_accounting_accounts(tenant_id,company_id,chart_id,code) where chart_id is not null;
create unique index if not exists shared_accounting_loose_account_code_unique on public.shared_accounting_accounts(tenant_id,company_id,code) where chart_id is null;
create unique index if not exists shared_accounting_one_active_chart_per_company on public.shared_accounting_charts(tenant_id,company_id) where status='active';
create index if not exists shared_accounting_accounts_chart_code_idx on public.shared_accounting_accounts(tenant_id,chart_id,code);

create table if not exists public.shared_accounting_command_receipts(
 tenant_id uuid not null references public.tenants(id), company_id text not null, idempotency_key text not null,
 intent_hash text not null, response jsonb not null, correlation_id text not null, created_at timestamptz not null default now(),
 primary key(tenant_id,company_id,idempotency_key), foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id));
create table if not exists public.shared_accounting_account_code_history(
 tenant_id uuid not null references public.tenants(id), id text not null, company_id text not null, account_id text not null,
 previous_code text not null, next_code text not null, correlation_id text not null, actor_id uuid not null, created_at timestamptz not null default now(),
 primary key(tenant_id,id), foreign key(tenant_id,account_id) references public.shared_accounting_accounts(tenant_id,id));
create index if not exists shared_accounting_code_history_account_idx on public.shared_accounting_account_code_history(tenant_id,account_id,created_at desc);
create table if not exists public.shared_accounting_command_audit(
 tenant_id uuid not null references public.tenants(id), id text not null, organization_id uuid not null, company_id text not null, actor_id uuid not null,
 kind text not null, correlation_id text not null, command jsonb not null, created_at timestamptz not null default now(), primary key(tenant_id,id));

create or replace function public.accounting_sync_legacy_kind() returns trigger language plpgsql as $$
begin
 -- Legacy RPCs write is_group; package commands write account_kind. Prefer the
 -- column explicitly changed by the caller, and derive the other representation.
 if tg_op='INSERT' then
  if new.account_kind is null then new.account_kind:=case when new.is_group then 'summary' else 'detail' end;
  else new.is_group:=(new.account_kind='summary'); end if;
 else
  if new.is_group is distinct from old.is_group and new.account_kind is not distinct from old.account_kind then
   new.account_kind:=case when new.is_group then 'summary' else 'detail' end;
  elsif new.account_kind is distinct from old.account_kind then
   new.is_group:=(new.account_kind='summary');
  end if;
 end if;
 -- Preserve a deliberate balance override; otherwise keep legacy type edits in sync.
 if new.normal_balance is null or (tg_op='UPDATE' and new.type is distinct from old.type and new.normal_balance is not distinct from old.normal_balance) then
  new.normal_balance:=case when new.type in('asset','expense') then 'debit' else 'credit' end;
 end if;
 -- Old RPCs do not manage optimistic versions. New commands already increment
 -- explicitly, so only supply the increment when a writer left it untouched.
 if tg_op='UPDATE' and new.version is not distinct from old.version then new.version:=old.version+1; end if;
 return new;
end; $$;
drop trigger if exists shared_accounting_accounts_sync_legacy_kind on public.shared_accounting_accounts;
create trigger shared_accounting_accounts_sync_legacy_kind before insert or update on public.shared_accounting_accounts for each row execute function public.accounting_sync_legacy_kind();
create or replace function public.accounting_lock_posting_account() returns trigger language plpgsql security definer set search_path=public as $$
declare v_account public.shared_accounting_accounts%rowtype; v_source text;
begin
 select * into v_account from public.shared_accounting_accounts where tenant_id=new.tenant_id and id=new.account_id for share;
 if not found then raise exception 'ACCOUNTING_POSTING_ACCOUNT_INVALID'; end if;
 select source into v_source from public.shared_accounting_entries where tenant_id=new.tenant_id and id=new.entry_id;
 if not found or v_account.account_kind<>'detail' or (not v_account.is_active and coalesce(v_source='manual',true)) then raise exception 'ACCOUNTING_POSTING_ACCOUNT_INVALID'; end if;
 return new;
end; $$;
drop trigger if exists shared_accounting_entry_lines_lock_account on public.shared_accounting_entry_lines;
create trigger shared_accounting_entry_lines_lock_account before insert or update of account_id on public.shared_accounting_entry_lines for each row execute function public.accounting_lock_posting_account();

create or replace function public.accounting_code_position(p_structure jsonb,p_code text) returns jsonb language plpgsql immutable as $$
declare v_segments jsonb:=p_structure->'segments'; v_segment jsonb; v_i integer; v_offset integer:=0; v_length integer; v_separator text; v_part text; v_parent text;
begin
 if jsonb_typeof(v_segments)<>'array' or jsonb_array_length(v_segments) not between 1 and 9 or p_code !~ '^[A-Z0-9./-]{1,30}$' then raise exception 'ACCOUNTING_CODE_OUT_OF_STRUCTURE'; end if;
 for v_i in 0..jsonb_array_length(v_segments)-1 loop v_segment:=v_segments->v_i; v_length:=(v_segment->>'length')::integer; v_separator:=v_segment->>'separator'; if v_i>0 then if v_separator is null or substr(p_code,v_offset+1,length(v_separator))<>v_separator then raise exception 'ACCOUNTING_CODE_OUT_OF_STRUCTURE'; end if; v_offset:=v_offset+length(v_separator); end if; v_parent:=case when v_i=0 then null else substr(p_code,1,v_offset-length(coalesce(v_separator,''))) end; v_part:=substr(p_code,v_offset+1,v_length); if v_part !~ ('^[A-Z0-9]{'||v_length||'}$') then raise exception 'ACCOUNTING_CODE_OUT_OF_STRUCTURE'; end if; v_offset:=v_offset+v_length; if v_offset=length(p_code) then return jsonb_build_object('level',v_i+1,'parentCode',v_parent); end if; end loop; raise exception 'ACCOUNTING_CODE_OUT_OF_STRUCTURE';
end; $$;

create or replace function public.accounting_require_scope(p_scope jsonb,p_permission text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_tenant uuid;
begin
 if p_scope is null or jsonb_typeof(p_scope)<>'object' or p_scope->>'tenantId' is null or p_scope->>'organizationId' is null or p_scope->>'companyId' is null or p_scope->>'actorId' is null then raise exception 'ACCOUNTING_INVALID'; end if;
 v_tenant:=public.assert_user_security_access((p_scope->>'actorId')::uuid,(p_scope->>'organizationId')::uuid,p_scope->>'companyId',p_permission);
 if v_tenant::text is distinct from p_scope->>'tenantId' then raise exception 'ACCOUNTING_FORBIDDEN'; end if;
 return v_tenant;
end; $$;

create or replace function public.shared_accounting_execute_command(p_scope jsonb,p_command jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_kind text; v_permission text; v_idem text; v_hash text; v_receipt public.shared_accounting_command_receipts%rowtype; v_response jsonb; v_chart public.shared_accounting_charts%rowtype; v_old_active public.shared_accounting_charts%rowtype; v_account public.shared_accounting_accounts%rowtype; v_parent public.shared_accounting_accounts%rowtype; v_other public.shared_accounting_accounts%rowtype; v_pos jsonb; v_code text; v_id text; v_count integer; v_ids jsonb:='[]'; v_versions jsonb:='{}'; v_initial jsonb; v_child record;
begin
 if p_command is null or jsonb_typeof(p_command)<>'object' then raise exception 'ACCOUNTING_INVALID'; end if;
 v_kind:=p_command->>'kind'; v_permission:=case when v_kind in('create_chart','change_chart_structure','activate_chart','archive_chart','create_account','update_account','recode_account','set_account_active','delete_account','convert_account_kind','set_account_classification','pair_memorandum_accounts','unpair_memorandum_accounts') then 'accounting.chart.manage' else null end;
 if v_permission is null then raise exception 'ACCOUNTING_INVALID'; end if;
 v_tenant:=public.accounting_require_scope(p_scope,v_permission); v_idem:=nullif(btrim(p_command->>'idempotencyKey'),''); if v_idem is null or length(v_idem)>128 or nullif(btrim(p_command->>'correlationId'),'') is null then raise exception 'ACCOUNTING_INVALID'; end if;
 v_hash:=md5(jsonb_strip_nulls(p_command)::text); perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||(p_scope->>'companyId')||':'||v_idem,0));
 select * into v_receipt from public.shared_accounting_command_receipts where tenant_id=v_tenant and company_id=p_scope->>'companyId' and idempotency_key=v_idem for update;
 if found then if v_receipt.intent_hash<>v_hash then raise exception 'ACCOUNTING_IDEMPOTENCY_CONFLICT'; end if; return v_receipt.response||jsonb_build_object('replayed',true); end if;
 perform public.set_operational_audit_context((p_scope->>'actorId')::uuid,(p_scope->>'organizationId')::uuid,p_scope->>'companyId',null,null);
 case v_kind
 when 'create_chart' then
  v_id:=p_command->>'chartId'; if v_id is null or nullif(btrim(p_command->>'name'),'') is null or jsonb_typeof(p_command->'structure'->'segments')<>'array' then raise exception 'ACCOUNTING_INVALID'; end if;
  perform public.accounting_code_position(p_command->'structure','A'); -- validates first segment shape
  insert into public.shared_accounting_charts(tenant_id,id,company_id,name,status,code_structure,version) values(v_tenant,v_id,p_scope->>'companyId',btrim(p_command->>'name'),'draft',p_command->'structure',1);
  if p_command->'source'->>'kind'='template' then raise exception 'ACCOUNTING_INVALID'; end if;
  if p_command->'source'->>'kind'='copy' then
   for v_initial in select jsonb_build_object('id',p_command->'source'->'accountIds'->>a.id,'code',a.code,'name',a.name,'accountKind',a.account_kind,'accountType',a.type,'isMemorandum',a.is_memorandum,'normalBalance',a.normal_balance,'normalBalanceOverrideReason',a.normal_balance_override_reason,'monetaryClass',a.monetary_class) from public.shared_accounting_accounts a where a.tenant_id=v_tenant and a.chart_id=p_command->'source'->>'sourceChartId' order by a.code loop
    if v_initial->>'id' is null then raise exception 'ACCOUNTING_INVALID'; end if;
    v_code:=upper(btrim(v_initial->>'code')); v_pos:=public.accounting_code_position(p_command->'structure',v_code);
    insert into public.shared_accounting_accounts(tenant_id,id,company_id,chart_id,code,name,type,parent_code,is_group,account_kind,is_memorandum,normal_balance,normal_balance_override_reason,monetary_class,version) values(v_tenant,v_initial->>'id',p_scope->>'companyId',v_id,v_code,btrim(v_initial->>'name'),v_initial->>'accountType',v_pos->>'parentCode',(v_initial->>'accountKind')='summary',v_initial->>'accountKind',coalesce((v_initial->>'isMemorandum')::boolean,false),v_initial->>'normalBalance',nullif(v_initial->>'normalBalanceOverrideReason',''),nullif(v_initial->>'monetaryClass',''),1);
   end loop;
  end if;
  for v_initial in select value from jsonb_array_elements(coalesce(p_command->'initialAccounts','[]'::jsonb)) loop
   v_code:=upper(btrim(v_initial->>'code')); v_pos:=public.accounting_code_position(p_command->'structure',v_code);
   insert into public.shared_accounting_accounts(tenant_id,id,company_id,chart_id,code,name,type,parent_code,is_group,account_kind,is_memorandum,normal_balance,normal_balance_override_reason,monetary_class,version) values(v_tenant,v_initial->>'id',p_scope->>'companyId',v_id,v_code,btrim(v_initial->>'name'),v_initial->>'accountType',v_pos->>'parentCode',(v_initial->>'accountKind')='summary',v_initial->>'accountKind',coalesce((v_initial->>'isMemorandum')::boolean,false),coalesce(v_initial->>'normalBalance',case when v_initial->>'accountType' in('asset','expense') then 'debit' else 'credit' end),nullif(v_initial->>'normalBalanceOverrideReason',''),nullif(v_initial->>'monetaryClass',''),1);
  end loop; v_ids:=jsonb_build_array(v_id); v_versions:=jsonb_build_object(v_id,1);
 when 'change_chart_structure' then
  select * into v_chart from public.shared_accounting_charts where tenant_id=v_tenant and id=p_command->>'chartId' and company_id=p_scope->>'companyId' for update; if not found then raise exception 'ACCOUNTING_NOT_FOUND'; end if; if v_chart.version<>(p_command->>'expectedVersion')::integer then raise exception 'ACCOUNTING_VERSION_CONFLICT'; end if;
  for v_child in select code from public.shared_accounting_accounts where tenant_id=v_tenant and chart_id=v_chart.id loop perform public.accounting_code_position(p_command->'structure',v_child.code); end loop;
  update public.shared_accounting_charts set code_structure=p_command->'structure',structure_version=structure_version+1,version=version+1,updated_at=now() where tenant_id=v_tenant and id=v_chart.id; v_ids:=jsonb_build_array(v_chart.id); v_versions:=jsonb_build_object(v_chart.id,v_chart.version+1);
 when 'activate_chart' then
  select * into v_chart from public.shared_accounting_charts where tenant_id=v_tenant and id=p_command->>'chartId' and company_id=p_scope->>'companyId' for update; if not found then raise exception 'ACCOUNTING_NOT_FOUND'; end if; if v_chart.version<>(p_command->>'expectedVersion')::integer then raise exception 'ACCOUNTING_VERSION_CONFLICT'; end if;
  for v_child in select code from public.shared_accounting_accounts where tenant_id=v_tenant and chart_id=v_chart.id loop perform public.accounting_code_position(v_chart.code_structure,v_child.code); end loop;
  select * into v_old_active from public.shared_accounting_charts where tenant_id=v_tenant and company_id=v_chart.company_id and status='active' and id<>v_chart.id for update;
  if found and exists(select 1 from public.shared_accounting_entries e join public.shared_accounting_entry_lines l on l.tenant_id=e.tenant_id and l.entry_id=e.id join public.shared_accounting_accounts a on a.tenant_id=l.tenant_id and a.id=l.account_id where a.tenant_id=v_tenant and a.chart_id=v_old_active.id) then raise exception 'ACCOUNTING_IN_USE'; end if;
  if found then update public.shared_accounting_charts set status='archived',version=version+1,updated_at=now() where tenant_id=v_tenant and id=v_old_active.id; end if;
  update public.shared_accounting_charts set status='active',version=version+1,updated_at=now() where tenant_id=v_tenant and id=v_chart.id; v_ids:=jsonb_build_array(v_chart.id); v_versions:=jsonb_build_object(v_chart.id,v_chart.version+1);
 when 'archive_chart' then
  select * into v_chart from public.shared_accounting_charts where tenant_id=v_tenant and id=p_command->>'chartId' and company_id=p_scope->>'companyId' for update; if not found then raise exception 'ACCOUNTING_NOT_FOUND'; end if; if v_chart.version<>(p_command->>'expectedVersion')::integer then raise exception 'ACCOUNTING_VERSION_CONFLICT'; end if; if v_chart.status='active' then raise exception 'ACCOUNTING_ACTIVE_CHART_CONFLICT'; end if; update public.shared_accounting_charts set status='archived',version=version+1,updated_at=now() where tenant_id=v_tenant and id=v_chart.id; v_ids:=jsonb_build_array(v_chart.id);v_versions:=jsonb_build_object(v_chart.id,v_chart.version+1);
 when 'create_account' then
  select * into v_chart from public.shared_accounting_charts where tenant_id=v_tenant and id=p_command->>'chartId' and company_id=p_scope->>'companyId' for update; if not found then raise exception 'ACCOUNTING_NOT_FOUND'; end if; v_code:=upper(btrim(p_command->>'code')); v_pos:=public.accounting_code_position(v_chart.code_structure,v_code);
  if v_pos->>'parentCode' is not null then select * into v_parent from public.shared_accounting_accounts where tenant_id=v_tenant and chart_id=v_chart.id and code=v_pos->>'parentCode' for update; if not found or v_parent.account_kind<>'summary' or not v_parent.is_active or v_parent.type<>p_command->>'accountType' or v_parent.is_memorandum<>coalesce((p_command->>'isMemorandum')::boolean,false) or (v_parent.monetary_class is not null and v_parent.monetary_class is distinct from nullif(p_command->>'monetaryClass','')) then raise exception 'ACCOUNTING_PARENT_INVALID'; end if; end if;
  insert into public.shared_accounting_accounts(tenant_id,id,company_id,chart_id,code,name,type,parent_code,is_group,account_kind,is_memorandum,normal_balance,normal_balance_override_reason,monetary_class,version) values(v_tenant,p_command->>'accountId',p_scope->>'companyId',v_chart.id,v_code,btrim(p_command->>'name'),p_command->>'accountType',v_pos->>'parentCode',(p_command->>'accountKind')='summary',p_command->>'accountKind',coalesce((p_command->>'isMemorandum')::boolean,false),coalesce(p_command->>'normalBalance',case when p_command->>'accountType' in('asset','expense') then 'debit' else 'credit' end),nullif(p_command->>'normalBalanceOverrideReason',''),nullif(p_command->>'monetaryClass',''),1);v_ids:=jsonb_build_array(p_command->>'accountId');v_versions:=jsonb_build_object(p_command->>'accountId',1);
 when 'update_account','set_account_classification','convert_account_kind','set_account_active','delete_account','recode_account','pair_memorandum_accounts','unpair_memorandum_accounts' then
  -- account mutations share a deterministic account lock and explicit version checks below.
  if v_kind='pair_memorandum_accounts' then
   select * into v_account from public.shared_accounting_accounts where tenant_id=v_tenant and id=least(p_command->>'debitAccountId',p_command->>'creditAccountId') and company_id=p_scope->>'companyId' for update; select * into v_other from public.shared_accounting_accounts where tenant_id=v_tenant and id=greatest(p_command->>'debitAccountId',p_command->>'creditAccountId') and company_id=p_scope->>'companyId' for update;
   if not found or v_account.id=v_other.id or not(v_account.is_memorandum and v_other.is_memorandum and v_account.account_kind='detail' and v_other.account_kind='detail' and v_account.normal_balance<>v_other.normal_balance) then raise exception 'ACCOUNTING_IN_USE'; end if; if v_account.version<>(case when v_account.id=p_command->>'debitAccountId' then (p_command->>'debitExpectedVersion')::integer else (p_command->>'creditExpectedVersion')::integer end) or v_other.version<>(case when v_other.id=p_command->>'debitAccountId' then (p_command->>'debitExpectedVersion')::integer else (p_command->>'creditExpectedVersion')::integer end) then raise exception 'ACCOUNTING_VERSION_CONFLICT'; end if; update public.shared_accounting_accounts set memorandum_counterpart_id=case when id=v_account.id then v_other.id else v_account.id end,version=version+1,updated_at=now() where tenant_id=v_tenant and id in(v_account.id,v_other.id);v_ids:=jsonb_build_array(v_account.id,v_other.id);v_versions:=jsonb_build_object(v_account.id,v_account.version+1,v_other.id,v_other.version+1);
  else
   select * into v_account from public.shared_accounting_accounts where tenant_id=v_tenant and id=p_command->>'accountId' and company_id=p_scope->>'companyId' for update; if not found then raise exception 'ACCOUNTING_NOT_FOUND'; end if; if v_account.version<>(p_command->>'expectedVersion')::integer then raise exception 'ACCOUNTING_VERSION_CONFLICT'; end if;
   if v_kind='delete_account' then if exists(select 1 from public.shared_accounting_entry_lines where tenant_id=v_tenant and account_id=v_account.id) or exists(select 1 from public.shared_accounting_accounts where tenant_id=v_tenant and chart_id=v_account.chart_id and parent_code=v_account.code) or exists(select 1 from public.shared_accounting_integration_rules where tenant_id=v_tenant and (debit_account_id=v_account.id or credit_account_id=v_account.id)) then raise exception 'ACCOUNTING_IN_USE'; end if; delete from public.shared_accounting_accounts where tenant_id=v_tenant and id=v_account.id;v_ids:=jsonb_build_array(v_account.id);v_versions:='{}';
    elsif v_kind='recode_account' then
     select * into v_chart from public.shared_accounting_charts where tenant_id=v_tenant and id=v_account.chart_id for update;
     v_code:=upper(btrim(p_command->>'code')); v_pos:=public.accounting_code_position(v_chart.code_structure,v_code);
     if exists(select 1 from public.shared_accounting_accounts where tenant_id=v_tenant and company_id=v_account.company_id and chart_id is not distinct from v_account.chart_id and (code=v_code or code like v_code||'.%' or code like v_code||'/%' or code like v_code||'-%') and id<>v_account.id) then raise exception 'ACCOUNTING_DUPLICATE_CODE'; end if;
     -- Move the whole descendant prefix through a collision-free temporary prefix,
     -- preserving every account id and rewriting each child's parent_code.
     update public.shared_accounting_accounts set code='~'||md5(v_account.id||':'||id)||'~'||substr(code,length(v_account.code)+1),version=version+1,updated_at=now()
      where tenant_id=v_tenant and chart_id is not distinct from v_account.chart_id and (id=v_account.id or code like v_account.code||'.%' or code like v_account.code||'/%' or code like v_account.code||'-%');
     insert into public.shared_accounting_account_code_history(tenant_id,id,company_id,account_id,previous_code,next_code,correlation_id,actor_id)
      select v_tenant,md5(id||':'||clock_timestamp()::text),company_id,id,v_account.code||substr(code,35),v_code||substr(code,35),p_command->>'correlationId',(p_scope->>'actorId')::uuid
      from public.shared_accounting_accounts where tenant_id=v_tenant and chart_id is not distinct from v_account.chart_id and code like '~%';
     update public.shared_accounting_accounts set code=v_code||substr(code,35), parent_code=case when id=v_account.id then v_pos->>'parentCode' else v_code||substr(parent_code,length(v_account.code)+1) end, updated_at=now()
      where tenant_id=v_tenant and chart_id is not distinct from v_account.chart_id and code like '~%';
     select coalesce(jsonb_agg(id),'[]'::jsonb),coalesce(jsonb_object_agg(id,version),'{}'::jsonb) into v_ids,v_versions from public.shared_accounting_accounts where tenant_id=v_tenant and chart_id is not distinct from v_account.chart_id and (code=v_code or code like v_code||'.%' or code like v_code||'/%' or code like v_code||'-%');
   elsif v_kind='convert_account_kind' then if (p_command->>'accountKind'='summary' and exists(select 1 from public.shared_accounting_entry_lines where tenant_id=v_tenant and account_id=v_account.id)) or (p_command->>'accountKind'='detail' and exists(select 1 from public.shared_accounting_accounts where tenant_id=v_tenant and chart_id=v_account.chart_id and parent_code=v_account.code)) then raise exception 'ACCOUNTING_IN_USE'; end if; update public.shared_accounting_accounts set account_kind=p_command->>'accountKind',is_group=(p_command->>'accountKind'='summary'),version=version+1,updated_at=now() where tenant_id=v_tenant and id=v_account.id;v_ids:=jsonb_build_array(v_account.id);v_versions:=jsonb_build_object(v_account.id,v_account.version+1);
   elsif v_kind='set_account_active' then if not coalesce((p_command->>'isActive')::boolean,true) and exists(select 1 from public.shared_accounting_accounts where tenant_id=v_tenant and chart_id=v_account.chart_id and parent_code=v_account.code and is_active) then raise exception 'ACCOUNTING_HAS_CHILDREN'; end if; if coalesce((p_command->>'isActive')::boolean,false) and v_account.parent_code is not null and not exists(select 1 from public.shared_accounting_accounts where tenant_id=v_tenant and chart_id=v_account.chart_id and code=v_account.parent_code and is_active) then raise exception 'ACCOUNTING_PARENT_INVALID'; end if; update public.shared_accounting_accounts set is_active=(p_command->>'isActive')::boolean,version=version+1,updated_at=now() where tenant_id=v_tenant and id=v_account.id;v_ids:=jsonb_build_array(v_account.id);v_versions:=jsonb_build_object(v_account.id,v_account.version+1);
   elsif v_kind='unpair_memorandum_accounts' then select * into v_other from public.shared_accounting_accounts where tenant_id=v_tenant and id=v_account.memorandum_counterpart_id for update; if not found then raise exception 'ACCOUNTING_NOT_FOUND'; end if; if v_other.version<>(p_command->>'counterpartExpectedVersion')::integer then raise exception 'ACCOUNTING_VERSION_CONFLICT'; end if;update public.shared_accounting_accounts set memorandum_counterpart_id=null,version=version+1,updated_at=now() where tenant_id=v_tenant and id in(v_account.id,v_other.id);v_ids:=jsonb_build_array(v_account.id,v_other.id);v_versions:=jsonb_build_object(v_account.id,v_account.version+1,v_other.id,v_other.version+1);
   else update public.shared_accounting_accounts set name=coalesce(nullif(btrim(p_command->>'name'),''),name),type=coalesce(p_command->>'accountType',type),is_memorandum=coalesce((p_command->>'isMemorandum')::boolean,is_memorandum),normal_balance=coalesce(p_command->>'normalBalance',normal_balance),normal_balance_override_reason=nullif(p_command->>'normalBalanceOverrideReason',''),monetary_class=case when p_command ? 'monetaryClass' then nullif(p_command->>'monetaryClass','') else monetary_class end,account_kind=coalesce(p_command->>'accountKind',account_kind),is_group=(coalesce(p_command->>'accountKind',account_kind)='summary'),version=version+1,updated_at=now() where tenant_id=v_tenant and id=v_account.id;v_ids:=jsonb_build_array(v_account.id);v_versions:=jsonb_build_object(v_account.id,v_account.version+1); end if;
  end if;
 end case;
 v_response:=jsonb_build_object('commandId',coalesce(v_id,p_command->>'accountId',p_command->>'chartId',p_command->>'debitAccountId'),'replayed',false,'affectedIds',v_ids,'versions',v_versions);
 insert into public.shared_accounting_command_receipts(tenant_id,company_id,idempotency_key,intent_hash,response,correlation_id) values(v_tenant,p_scope->>'companyId',v_idem,v_hash,v_response,p_command->>'correlationId');
 insert into public.shared_accounting_command_audit(tenant_id,id,organization_id,company_id,actor_id,kind,correlation_id,command) values(v_tenant,md5(v_tenant::text||':'||(p_scope->>'companyId')||':'||v_idem), (p_scope->>'organizationId')::uuid,p_scope->>'companyId',(p_scope->>'actorId')::uuid,v_kind,p_command->>'correlationId',p_command);
 return v_response;
end; $$;

create or replace function public.shared_accounting_query(p_scope jsonb,p_query jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_tenant uuid; v_kind text; v_account public.shared_accounting_accounts%rowtype; v_refs jsonb;
begin
 v_tenant:=public.accounting_require_scope(p_scope,'accounting.read'); if p_query is null or jsonb_typeof(p_query)<>'object' then raise exception 'ACCOUNTING_INVALID'; end if; v_kind:=p_query->>'kind';
 if v_kind='list_charts' then return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'companyId',c.company_id,'name',c.name,'status',c.status,'structure',c.code_structure,'version',c.version) order by c.name) from public.shared_accounting_charts c where c.tenant_id=v_tenant and c.company_id=p_scope->>'companyId' and (p_query->>'status' is null or c.status=p_query->>'status')),'[]');
 elsif v_kind='find_accounts' then return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'chartId',a.chart_id,'code',a.code,'name',a.name,'parentCode',a.parent_code,'level',array_length(regexp_split_to_array(a.code,'[./-]'),1),'kind',a.account_kind,'type',a.type,'isMemorandum',a.is_memorandum,'normalBalance',a.normal_balance,'normalBalanceOverrideReason',a.normal_balance_override_reason,'memorandumCounterpartId',a.memorandum_counterpart_id,'monetaryClass',a.monetary_class,'isActive',a.is_active,'version',a.version,'historicalOpeningBalance',a.opening_balance::text) order by a.code) from public.shared_accounting_accounts a where a.tenant_id=v_tenant and a.company_id=p_scope->>'companyId' and a.chart_id is not distinct from nullif(p_query->>'chartId','') and (coalesce((p_query->>'includeInactive')::boolean,false) or a.is_active) and (p_query->>'search' is null or a.code ilike ('%'||(p_query->>'search')||'%') or a.name ilike ('%'||(p_query->>'search')||'%'))),'[]');
  elsif v_kind='get_account' then select * into v_account from public.shared_accounting_accounts where tenant_id=v_tenant and company_id=p_scope->>'companyId' and id=p_query->>'accountId'; if not found then return null; end if; select jsonb_build_object('postings',(select count(*) from public.shared_accounting_entry_lines where tenant_id=v_tenant and account_id=v_account.id),'children',(select count(*) from public.shared_accounting_accounts where tenant_id=v_tenant and chart_id is not distinct from v_account.chart_id and parent_code=v_account.code),'integrationRules',(select count(*) from public.shared_accounting_integration_rules where tenant_id=v_tenant and (debit_account_id=v_account.id or credit_account_id=v_account.id)),'specialRoles',0,'associations',0) into v_refs; return jsonb_build_object('account',jsonb_build_object('id',v_account.id,'chartId',v_account.chart_id,'code',v_account.code,'name',v_account.name,'parentCode',v_account.parent_code,'level',array_length(regexp_split_to_array(v_account.code,'[./-]'),1),'kind',v_account.account_kind,'type',v_account.type,'isMemorandum',v_account.is_memorandum,'normalBalance',v_account.normal_balance,'normalBalanceOverrideReason',v_account.normal_balance_override_reason,'memorandumCounterpartId',v_account.memorandum_counterpart_id,'monetaryClass',v_account.monetary_class,'isActive',v_account.is_active,'version',v_account.version,'historicalOpeningBalance',v_account.opening_balance::text),'references',v_refs);
 else raise exception 'ACCOUNTING_INVALID'; end if;
end; $$;
revoke all on function public.shared_accounting_execute_command(jsonb,jsonb),public.shared_accounting_query(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_accounting_execute_command(jsonb,jsonb),public.shared_accounting_query(jsonb,jsonb) to service_role;
alter table public.shared_accounting_command_receipts enable row level security;
alter table public.shared_accounting_account_code_history enable row level security;
alter table public.shared_accounting_command_audit enable row level security;
revoke all on public.shared_accounting_command_receipts,public.shared_accounting_account_code_history,public.shared_accounting_command_audit from public,anon,authenticated;
grant all on public.shared_accounting_command_receipts,public.shared_accounting_account_code_history,public.shared_accounting_command_audit to service_role;
