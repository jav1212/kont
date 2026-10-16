-- AUD-001..AUD-022: immutable operational facts.  The trigger runs in the
-- caller's transaction, so an unsuccessful business statement has no audit row.

create table if not exists public.shared_operational_audit_trail (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  entity_type text not null check (entity_type in ('invoice','payment_order','receivable_payment_reversal','customer','product','employee','payroll_receipt','accounting_entry')),
  entity_id text not null,
  action text not null check (action in ('create','update','delete','cancel')),
  actor_id uuid,
  occurred_at timestamptz not null default statement_timestamp(),
  branch_id text,
  device_id text,
  before_snapshot jsonb,
  after_snapshot jsonb,
  changes jsonb not null default '[]'::jsonb,
  check ((action='create' and before_snapshot is null and after_snapshot is not null)
      or (action='delete' and before_snapshot is not null and after_snapshot is null)
      or (action in ('update','cancel') and before_snapshot is not null and after_snapshot is not null))
);
create index if not exists shared_operational_audit_scope_time_idx on public.shared_operational_audit_trail(tenant_id,organization_id,company_id,occurred_at desc,id desc);
create index if not exists shared_operational_audit_entity_idx on public.shared_operational_audit_trail(tenant_id,organization_id,company_id,entity_type,entity_id,occurred_at desc,id desc);

-- Credentials and recovery material are never included, even if a future
-- operational table happens to add a similarly named column.
create or replace function public.operational_audit_snapshot(p_row jsonb) returns jsonb
language sql immutable set search_path=public as $$
 select p_row - array['password','password_hash','password_digest','token','token_hash','refresh_token','access_token','secret','api_key','mfa_secret','recovery_codes','encrypted_password']
$$;
create or replace function public.operational_audit_changes(p_before jsonb,p_after jsonb) returns jsonb
language sql immutable set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('field',key,'before',case when p_before ? key then p_before->key else null end,'after',case when p_after ? key then p_after->key else null end) order by key),'[]'::jsonb)
 from (select key from jsonb_object_keys(coalesce(p_before,'{}'::jsonb)) key union select key from jsonb_object_keys(coalesce(p_after,'{}'::jsonb)) key) keys
 where (p_before ? key) is distinct from (p_after ? key) or (p_before ? key and p_after ? key and p_before->key is distinct from p_after->key)
$$;

create or replace function public.append_operational_audit_trigger() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_old jsonb:=case when tg_op='INSERT' then null else public.operational_audit_snapshot(to_jsonb(old)) end;
declare v_new jsonb:=case when tg_op='DELETE' then null else public.operational_audit_snapshot(to_jsonb(new)) end;
declare v_source jsonb:=coalesce(v_new,v_old); declare v_tenant uuid; declare v_company text; declare v_org uuid;
declare v_action text:=case when tg_op='INSERT' then 'create' when tg_op='DELETE' then 'delete' when coalesce(v_new->>'status','') in ('cancelled','anulado','anulada','annulled') and coalesce(v_old->>'status','') not in ('cancelled','anulado','anulada','annulled') then 'cancel' else 'update' end;
declare v_actor uuid:=auth.uid(); declare v_branch text; declare v_device text;
begin
  if tg_op='UPDATE' and v_old=v_new then return new; end if;
  v_tenant:=nullif(v_source->>'tenant_id','')::uuid; v_company:=nullif(v_source->>'company_id','');
  if tg_argv[1]='payment_reversal' then
    select r.company_id into v_company from public.shared_sales_payment_reversals x join public.shared_sales_receivable_payments p on p.tenant_id=x.tenant_id and p.id=x.payment_id join public.shared_sales_receivables r on r.tenant_id=p.tenant_id and r.id=p.receivable_id where x.tenant_id=v_tenant and x.id=v_source->>'id';
  end if;
  if v_tenant is null or v_company is null or nullif(v_source->>'id','') is null then
    raise exception 'OPERATIONAL_AUDIT_SCOPE_MISSING' using errcode='23514';
  end if;
  select c.organization_id into v_org from public.shared_companies c where c.tenant_id=v_tenant and c.id=v_company;
  if v_org is null then raise exception 'OPERATIONAL_AUDIT_ORGANIZATION_MISSING' using errcode='23514'; end if;
  -- Only the service-role wrapper may supply an actor context; direct clients
  -- always use auth.uid().  The membership check prevents arbitrary GUC spoofing.
  if v_actor is null and current_setting('role',true)='service_role' and nullif(current_setting('kontave.operation.actor_user_id',true),'') is not null then
    v_actor:=current_setting('kontave.operation.actor_user_id',true)::uuid;
    if not exists(select 1 from public.organization_memberships m where m.organization_id=v_org and m.user_id=v_actor and m.status='active') then raise exception 'OPERATIONAL_AUDIT_ACTOR_INVALID' using errcode='42501'; end if;
    if current_setting('kontave.operation.organization_id',true) is distinct from v_org::text or current_setting('kontave.operation.company_id',true) is distinct from v_company or current_setting('kontave.operation.tenant_id',true) is distinct from v_tenant::text then raise exception 'OPERATIONAL_AUDIT_CONTEXT_SCOPE_INVALID' using errcode='42501'; end if;
    v_branch:=nullif(current_setting('kontave.operation.branch_id',true),''); v_device:=nullif(current_setting('kontave.operation.device_id',true),'');
  end if;
  insert into public.shared_operational_audit_trail(tenant_id,organization_id,company_id,entity_type,entity_id,action,actor_id,occurred_at,branch_id,device_id,before_snapshot,after_snapshot,changes)
  values(v_tenant,v_org,v_company,tg_argv[0],v_source->>'id',v_action,v_actor,clock_timestamp(),v_branch,v_device,v_old,v_new,public.operational_audit_changes(v_old,v_new));
  return case when tg_op='DELETE' then old else new end;
end $$;

-- This catalog is deliberately conditional: it attaches only to real shared
-- operational tables present in this installation, never creating substitutes.
do $$
declare r record;
begin
 for r in select * from (values
   ('shared_inventory_sales_invoices','invoice','direct'),('shared_inventory_purchase_invoices','invoice','direct'),
   ('shared_inventory_customers','customer','direct'),
   ('shared_inventory_products','product','direct'),('shared_employees','employee','direct'),
   ('shared_payroll_receipts','payroll_receipt','direct'),('shared_accounting_entries','accounting_entry','direct')
 ) as m(table_name,entity_type,scope_mapper) loop
   if to_regclass('public.'||r.table_name) is null then raise exception 'OPERATIONAL_AUDIT_REQUIRED_TABLE_MISSING: %',r.table_name; end if;
   if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='tenant_id') or not exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='company_id') or not exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='id') then raise exception 'OPERATIONAL_AUDIT_REQUIRED_COLUMNS_MISSING: %',r.table_name; end if;
   execute format('drop trigger if exists operational_audit_%I on public.%I',r.table_name,r.table_name);
   execute format('create trigger operational_audit_%I after insert or update or delete on public.%I for each row execute function public.append_operational_audit_trigger(%L,%L)',r.table_name,r.table_name,r.entity_type,r.scope_mapper);
 end loop;
end $$;

insert into public.access_control_permissions(code,resource,action,description) values ('audit.read','audit','read','Consultar auditoría operativa') on conflict(code) do update set description=excluded.description;
insert into public.organization_role_permissions(role_id,permission_code)
select r.id,'audit.read' from public.organization_roles r where r.code in ('owner','admin') on conflict do nothing;

alter table public.shared_operational_audit_trail enable row level security;
revoke all on public.shared_operational_audit_trail from public,anon,authenticated,service_role;
create or replace function public.reject_operational_audit_mutation() returns trigger language plpgsql set search_path=public as $$ begin raise exception 'OPERATIONAL_AUDIT_IMMUTABLE'; end $$;
create trigger shared_operational_audit_immutable before update or delete or truncate on public.shared_operational_audit_trail for each statement execute function public.reject_operational_audit_mutation();
revoke all on function public.reject_operational_audit_mutation() from public,anon,authenticated,service_role;

create or replace function public.set_operational_audit_context(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_branch_id text,p_device_id text) returns void
language plpgsql security definer set search_path=public as $$
declare v_tenant uuid;
begin
  v_tenant:=public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'companies.read');
  if p_branch_id is not null and (length(trim(p_branch_id))=0 or length(p_branch_id)>128) then raise exception 'OPERATIONAL_AUDIT_CONTEXT_INVALID'; end if;
  if p_device_id is not null and (length(trim(p_device_id))=0 or length(p_device_id)>128) then raise exception 'OPERATIONAL_AUDIT_CONTEXT_INVALID'; end if;
  perform set_config('kontave.operation.actor_user_id',p_actor_user_id::text,true); perform set_config('kontave.operation.organization_id',p_organization_id::text,true); perform set_config('kontave.operation.tenant_id',v_tenant::text,true); perform set_config('kontave.operation.company_id',p_company_id,true); perform set_config('kontave.operation.branch_id',coalesce(nullif(trim(p_branch_id),''),''),true); perform set_config('kontave.operation.device_id',coalesce(nullif(trim(p_device_id),''),''),true);
end $$;
revoke all on function public.set_operational_audit_context(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.set_operational_audit_context(uuid,uuid,text,text,text) to service_role;

create or replace function public.query_operational_audit_trail(p_tenant_id uuid,p_organization_id uuid,p_company_id text,p_actor_user_id uuid,p_entity_type text default null,p_entity_id text default null,p_actions text[] default null,p_offset integer default 0,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_entries jsonb; declare v_total bigint;
begin
 if p_offset is null or p_limit is null or p_offset<0 or p_limit<1 or p_limit>100 then raise exception 'AUDIT_QUERY_INVALID'; end if;
 if public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'audit.read') is distinct from p_tenant_id then raise exception 'AUDIT_SCOPE_INVALID'; end if;
 select count(*) into v_total from public.shared_operational_audit_trail a where a.tenant_id=p_tenant_id and a.organization_id=p_organization_id and a.company_id=p_company_id and (p_entity_type is null or a.entity_type=p_entity_type) and (p_entity_id is null or a.entity_id=p_entity_id) and (p_actions is null or a.action=any(p_actions));
 select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc,x.id desc),'[]'::jsonb) into v_entries from (select * from public.shared_operational_audit_trail a where a.tenant_id=p_tenant_id and a.organization_id=p_organization_id and a.company_id=p_company_id and (p_entity_type is null or a.entity_type=p_entity_type) and (p_entity_id is null or a.entity_id=p_entity_id) and (p_actions is null or a.action=any(p_actions)) order by a.occurred_at desc,a.id desc offset p_offset limit p_limit) x;
 return jsonb_build_object('entries',v_entries,'total',v_total,'offset',p_offset,'limit',p_limit);
end $$;
revoke all on function public.query_operational_audit_trail(uuid,uuid,text,uuid,text,text,text[],integer,integer) from public,anon,authenticated;
grant execute on function public.query_operational_audit_trail(uuid,uuid,text,uuid,text,text,text[],integer,integer) to service_role;
