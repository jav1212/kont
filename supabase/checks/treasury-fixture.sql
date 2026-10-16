-- Minimal isolated schema for treasury SQL integration tests.  Production
-- migrations 291/292/295/313 own these objects in a deployed database.
create schema if not exists auth;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
-- PGlite's compact distribution does not bundle pgcrypto. These deterministic
-- test doubles preserve the migration's required function signatures only.
create or replace function public.gen_random_uuid() returns uuid language sql immutable as $$ select '00000000-0000-4000-8000-000000000099'::uuid $$;
create or replace function public.digest(text,text) returns bytea language sql immutable as $$ select convert_to($1,'UTF8') $$;
create table if not exists auth.users(id uuid primary key);
create table if not exists public.tenants(id uuid primary key);
create table if not exists public.organizations(id uuid primary key);
create table if not exists public.shared_companies(tenant_id uuid not null references public.tenants(id),id text not null,organization_id uuid not null references public.organizations(id),primary key(tenant_id,id));
create table if not exists public.access_control_permissions(code text primary key,resource text,action text,description text);
create table if not exists public.organization_roles(id uuid primary key default gen_random_uuid(),organization_id uuid not null,code text not null,status text not null default 'active');
create table if not exists public.organization_memberships(organization_id uuid not null,user_id uuid not null,role_id uuid not null,status text not null default 'active',primary key(organization_id,user_id));
create table if not exists public.organization_role_permissions(role_id uuid not null,permission_code text not null,primary key(role_id,permission_code));
create table if not exists public.shared_operational_audit_trail(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,organization_id uuid not null,company_id text not null,entity_type text not null,entity_id text not null,action text not null,actor_id uuid,occurred_at timestamptz not null default now(),branch_id text,device_id text,before_snapshot jsonb,after_snapshot jsonb,changes jsonb not null default '[]');
create table if not exists public.shared_payment_orders(tenant_id uuid not null,id text not null,company_id text not null,beneficiary text not null,concept text not null,amount numeric(28,8) not null,currency varchar(3) not null,due_date date,status text not null default 'draft',version integer not null default 1,created_at timestamptz default now(),updated_at timestamptz default now(),primary key(tenant_id,id));
create table if not exists public.shared_sales_receivables(tenant_id uuid not null,id text not null,company_id text not null,primary key(tenant_id,id));
create table if not exists public.shared_sales_receivable_payments(tenant_id uuid not null,id text not null,receivable_id text not null,received_amount numeric(28,8) not null,received_currency_code varchar(3) not null,primary key(tenant_id,id));
create or replace function public.assert_user_security_access(p_actor uuid,p_organization uuid,p_company text,p_permission text) returns uuid language plpgsql as $$ declare v_tenant uuid; begin select c.tenant_id into v_tenant from public.shared_companies c join public.organizations o on o.id=c.organization_id join public.organization_memberships m on m.organization_id=o.id and m.user_id=p_actor and m.status='active' join public.organization_roles r on r.id=m.role_id and r.organization_id=o.id and r.status='active' join public.organization_role_permissions rp on rp.role_id=r.id and rp.permission_code=p_permission where c.organization_id=p_organization and c.id=p_company; if v_tenant is null then raise exception 'ORGANIZATIONAL_USER_ACCESS_DENIED'; end if; return v_tenant; end $$;
create or replace function public.set_operational_audit_context(p_actor uuid,p_org uuid,p_company text,p_branch text,p_device text) returns void language plpgsql as $$ begin perform set_config('kontave.operation.actor_user_id',p_actor::text,true); perform set_config('kontave.operation.organization_id',p_org::text,true); end $$;
create or replace function public.append_operational_audit_trigger() returns trigger language plpgsql as $$ declare r jsonb; begin r:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end; insert into public.shared_operational_audit_trail(tenant_id,organization_id,company_id,entity_type,entity_id,action,actor_id,before_snapshot,after_snapshot) values((r->>'tenant_id')::uuid,nullif(current_setting('kontave.operation.organization_id',true),'')::uuid,r->>'company_id',tg_argv[0],r->>'id',case when tg_op='INSERT' then 'create' when tg_op='DELETE' then 'delete' else 'update' end,nullif(current_setting('kontave.operation.actor_user_id',true),'')::uuid,case when tg_op='INSERT' then null else to_jsonb(old) end,case when tg_op='DELETE' then null else to_jsonb(new) end); return case when tg_op='DELETE' then old else new end; end $$;
insert into public.tenants values('00000000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.organizations values('00000000-0000-4000-8000-000000000002') on conflict do nothing;
insert into auth.users values('00000000-0000-4000-8000-000000000003') on conflict do nothing;
insert into public.organization_roles(id,organization_id,code) values('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','owner') on conflict do nothing;
insert into public.organization_memberships(organization_id,user_id,role_id) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004') on conflict do nothing;
insert into public.shared_companies values('00000000-0000-4000-8000-000000000001','J-00000000-0','00000000-0000-4000-8000-000000000002') on conflict do nothing;
