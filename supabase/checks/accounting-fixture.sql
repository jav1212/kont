-- Isolated prerequisites for accounting PGlite checks. Load this before 131.
create schema if not exists auth;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create table if not exists public.tenants(id uuid primary key, schema_name text);
create table if not exists public.tenant_memberships(tenant_id uuid not null,member_id uuid not null,accepted_at timestamptz,revoked_at timestamptz);
create table if not exists public.organizations(id uuid primary key);
create table if not exists public.shared_companies(tenant_id uuid not null references public.tenants(id),id text not null,organization_id uuid not null references public.organizations(id),primary key(tenant_id,id));
create table if not exists public.access_control_permissions(code text primary key,resource text,action text,description text);
insert into public.access_control_permissions(code,resource,action,description) values('accounting.read','accounting','read','Ver contabilidad') on conflict do nothing;
create table if not exists public.organization_roles(id uuid primary key,organization_id uuid not null,code text not null,status text not null default 'active');
create table if not exists public.organization_memberships(organization_id uuid not null,user_id uuid not null,role_id uuid not null,status text not null default 'active',primary key(organization_id,user_id));
create table if not exists public.organization_role_permissions(role_id uuid not null,permission_code text not null,primary key(role_id,permission_code));
create or replace function public.assert_user_security_access(p_actor uuid,p_organization uuid,p_company text,p_permission text) returns uuid language plpgsql as $$ declare v_tenant uuid; begin select c.tenant_id into v_tenant from public.shared_companies c join public.organization_memberships m on m.organization_id=c.organization_id and m.user_id=p_actor and m.status='active' join public.organization_roles r on r.id=m.role_id and r.organization_id=c.organization_id and r.status='active' join public.organization_role_permissions rp on rp.role_id=r.id and rp.permission_code=p_permission where c.organization_id=p_organization and c.id=p_company; if v_tenant is null then raise exception 'ORGANIZATIONAL_USER_ACCESS_DENIED'; end if; return v_tenant; end $$;
create or replace function public.set_operational_audit_context(p_actor uuid,p_org uuid,p_company text,p_branch text,p_device text) returns void language plpgsql as $$ begin perform set_config('kontave.operation.actor_user_id',p_actor::text,true); perform set_config('kontave.operation.organization_id',p_org::text,true); end $$;
