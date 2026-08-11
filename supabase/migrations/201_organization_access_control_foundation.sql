-- Organization-scoped Access Control for native clients.
-- Additive migration: legacy role text, shared authorization tables, routes and Web
-- behavior remain available and unchanged until the explicit Web cutover.

create table if not exists public.access_control_permissions (
    code text primary key,
    resource text not null,
    action text not null,
    description text not null,
    created_at timestamptz not null default now(),
    unique (resource, action)
);

create table if not exists public.organization_roles (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade,
    code text not null check (code ~ '^[a-z][a-z0-9_-]{1,63}$'),
    name text not null check (length(trim(name)) between 1 and 100),
    description text not null default '',
    kind text not null check (kind in ('system', 'custom')),
    status text not null default 'active' check (status in ('active', 'archived')),
    version integer not null default 1 check (version > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, id)
);
create unique index if not exists organization_roles_organization_code_unique
    on public.organization_roles (organization_id, code) where organization_id is not null;
create unique index if not exists organization_roles_template_code_unique
    on public.organization_roles (code) where organization_id is null;

create table if not exists public.organization_role_permissions (
    role_id uuid not null references public.organization_roles(id) on delete cascade,
    permission_code text not null references public.access_control_permissions(code) on delete restrict,
    created_at timestamptz not null default now(),
    primary key (role_id, permission_code)
);

alter table public.organization_memberships add column if not exists role_id uuid;
alter table public.organization_memberships add column if not exists authorization_version integer not null default 1;

insert into public.access_control_permissions (code, resource, action, description) values
 ('billing.read','billing','read','Ver facturación'),
 ('billing.invoices.read','billing.invoices','read','Ver facturas de Kontave'),
 ('billing.payment_methods.read','billing.payment_methods','read','Ver métodos de pago'),
 ('billing.manage','billing','manage','Gestionar facturación'),
 ('companies.read','companies','read','Ver empresas'), ('companies.create','companies','create','Crear empresas'),
 ('companies.update','companies','update','Editar empresas'), ('companies.delete','companies','delete','Eliminar empresas'),
 ('members.read','members','read','Ver miembros'), ('members.invite','members','invite','Invitar miembros'),
 ('members.update','members','update','Cambiar roles'), ('members.revoke','members','revoke','Revocar miembros'),
 ('roles.read','roles','read','Ver roles'), ('roles.manage','roles','manage','Gestionar roles'),
 ('employees.read','employees','read','Ver empleados'), ('employees.create','employees','create','Crear empleados'),
 ('employees.update','employees','update','Editar empleados'), ('employees.delete','employees','delete','Eliminar empleados'),
 ('documents.read','documents','read','Ver documentos'), ('documents.create','documents','create','Crear documentos'),
 ('documents.update','documents','update','Editar documentos'), ('documents.delete','documents','delete','Eliminar documentos'),
 ('payroll.read','payroll','read','Ver nómina'), ('payroll.create','payroll','create','Crear nómina'),
 ('payroll.confirm','payroll','confirm','Confirmar nómina'), ('payroll.delete','payroll','delete','Eliminar nómina'),
 ('inventory.read','inventory','read','Ver inventario'), ('inventory.create','inventory','create','Crear inventario'),
 ('inventory.update','inventory','update','Editar inventario'), ('inventory.delete','inventory','delete','Eliminar inventario'),
 ('purchases.read','purchases','read','Ver compras'), ('purchases.create','purchases','create','Crear compras'),
 ('purchases.confirm','purchases','confirm','Confirmar compras'), ('purchases.cancel','purchases','cancel','Anular compras'),
 ('sales.read','sales','read','Ver ventas'), ('sales.create','sales','create','Crear ventas'),
 ('sales.update','sales','update','Editar ventas'), ('sales.confirm','sales','confirm','Confirmar ventas'),
 ('sales.cancel','sales','cancel','Anular ventas'), ('accounting.read','accounting','read','Ver contabilidad'),
 ('accounting.create','accounting','create','Crear registros contables'), ('accounting.update','accounting','update','Editar contabilidad'),
 ('accounting.post','accounting','post','Publicar asientos'), ('accounting.close','accounting','close','Cerrar períodos'),
 ('reports.read','reports','read','Ver reportes')
on conflict (code) do update set resource=excluded.resource, action=excluded.action, description=excluded.description;

-- System templates document defaults. Organization roles are independent copies.
insert into public.organization_roles (organization_id, code, name, description, kind)
values (null,'owner','Propietario','Control total de la organización','system'),
       (null,'admin','Administrador','Administración operativa','system'),
       (null,'accountant','Contador','Operaciones contables y fiscales','system'),
       (null,'seller','Vendedor','Operaciones comerciales','system'),
       (null,'cashier','Cajero','Operaciones de caja','system')
on conflict do nothing;

insert into public.organization_roles (organization_id, code, name, description, kind)
select o.id, template.code, template.name, template.description, 'system'
from public.organizations o cross join public.organization_roles template
where template.organization_id is null
on conflict do nothing;

-- Owners receive every capability. Other defaults preserve legacy behavior while
-- making the billing distinctions explicit.
insert into public.organization_role_permissions (role_id, permission_code)
select role.id, permission.code from public.organization_roles role cross join public.access_control_permissions permission
where role.code='owner' on conflict do nothing;
insert into public.organization_role_permissions (role_id, permission_code)
select role.id, permission.code from public.organization_roles role cross join public.access_control_permissions permission
where role.code='admin' and permission.code <> 'billing.manage' on conflict do nothing;
insert into public.organization_role_permissions (role_id, permission_code)
select role.id, permission.code from public.organization_roles role cross join public.access_control_permissions permission
where role.code='accountant' and (
 permission.code in ('billing.read','billing.invoices.read') or
 (permission.resource in ('companies','employees','payroll','purchases','sales','inventory','accounting','reports') and permission.action in ('read','create','update','confirm','post','close'))
) on conflict do nothing;
insert into public.organization_role_permissions (role_id, permission_code)
select role.id, permission.code from public.organization_roles role join public.access_control_permissions permission on
 (role.code='seller' and permission.code in ('companies.read','sales.read','sales.create','sales.update','sales.confirm','inventory.read','reports.read')) or
 (role.code='cashier' and permission.code in ('companies.read','sales.read','sales.create','sales.confirm','inventory.read'))
on conflict do nothing;

update public.organization_memberships membership set role_id=role.id
from public.organization_roles role
where role.organization_id=membership.organization_id and role.code=membership.role and membership.role_id is null;

alter table public.organization_memberships alter column role_id set not null;
alter table public.organization_memberships drop constraint if exists organization_memberships_role_id_fkey;
alter table public.organization_memberships add constraint organization_memberships_organization_role_fkey
 foreign key (organization_id, role_id) references public.organization_roles(organization_id, id) on delete restrict;
create index if not exists organization_memberships_role_idx on public.organization_memberships(role_id) where status='active';
create index if not exists organization_role_permissions_permission_idx on public.organization_role_permissions(permission_code);

create table if not exists public.organization_authorization_audit (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
 user_id uuid not null, membership_id uuid, role_id uuid, permission_code text not null,
 effective_permissions jsonb not null default '[]'::jsonb, policy_name text, policy_version text,
 resource_type text, resource_id text, company_id text, request_id text not null,
 source text not null check (source in ('web','desktop','mobile','system')),
 decision text not null check (decision in ('allow','deny')), reason text not null,
 occurred_at timestamptz not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists organization_authorization_audit_org_created_idx on public.organization_authorization_audit(organization_id, created_at desc);
create index if not exists organization_authorization_audit_request_idx on public.organization_authorization_audit(request_id);

create or replace function public.provision_organization_system_roles() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.organization_roles(organization_id,code,name,description,kind)
 select new.id,code,name,description,'system' from public.organization_roles where organization_id is null on conflict do nothing;
 insert into public.organization_role_permissions(role_id,permission_code)
 select target.id, source_permission.permission_code
 from public.organization_roles target join public.organization_roles template on template.organization_id is null and template.code=target.code
 join public.organization_role_permissions source_permission on source_permission.role_id=template.id
 where target.organization_id=new.id on conflict do nothing;
 return new;
end $$;
drop trigger if exists organizations_provision_access_control on public.organizations;
create trigger organizations_provision_access_control after insert on public.organizations for each row execute function public.provision_organization_system_roles();

create or replace function public.assign_membership_organization_role() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.role_id is null or (tg_op='UPDATE' and new.role is distinct from old.role) then
   select id into new.role_id from public.organization_roles where organization_id=new.organization_id and code=new.role and status='active';
 end if;
 if new.role_id is null then raise exception 'No active role % exists in organization %',new.role,new.organization_id; end if;
 return new;
end $$;
drop trigger if exists organization_memberships_assign_role_id on public.organization_memberships;
create trigger organization_memberships_assign_role_id before insert or update of role,organization_id on public.organization_memberships for each row execute function public.assign_membership_organization_role();

create or replace function public.protect_last_organization_owner() returns trigger language plpgsql set search_path=public as $$
declare old_is_owner boolean; new_is_owner boolean;
begin
 select code='owner' into old_is_owner from public.organization_roles where id=old.role_id;
 if tg_op='UPDATE' then select code='owner' into new_is_owner from public.organization_roles where id=new.role_id; else new_is_owner:=false; end if;
 if old_is_owner and old.status='active' and (tg_op='DELETE' or new.status<>'active' or not new_is_owner) and not exists(
   select 1 from public.organization_memberships m join public.organization_roles r on r.id=m.role_id
   where m.organization_id=old.organization_id and m.id<>old.id and m.status='active' and r.code='owner'
 ) then raise exception using errcode='23514', message='An organization must retain at least one active owner'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists organization_memberships_protect_last_owner on public.organization_memberships;
create trigger organization_memberships_protect_last_owner before update of role_id,status or delete on public.organization_memberships for each row execute function public.protect_last_organization_owner();

create or replace function public.protect_system_organization_role() returns trigger language plpgsql set search_path=public as $$
begin if old.kind='system' and (tg_op='DELETE' or new.status='archived') then raise exception using errcode='23514',message='System roles cannot be deleted or archived'; end if; return case when tg_op='DELETE' then old else new end; end $$;
drop trigger if exists organization_roles_protect_system on public.organization_roles;
create trigger organization_roles_protect_system before update of status or delete on public.organization_roles for each row execute function public.protect_system_organization_role();

create or replace function public.bump_role_authorization_version() returns trigger language plpgsql security definer set search_path=public as $$
declare target_role uuid:=coalesce(new.role_id,old.role_id);
begin
 update public.organization_roles set version=version+1,updated_at=now() where id=target_role;
 update public.organization_memberships set authorization_version=authorization_version+1,updated_at=now() where role_id=target_role;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
drop trigger if exists organization_role_permissions_bump_version on public.organization_role_permissions;
create trigger organization_role_permissions_bump_version after insert or update or delete on public.organization_role_permissions for each row execute function public.bump_role_authorization_version();

alter table public.access_control_permissions enable row level security;
alter table public.organization_roles enable row level security;
alter table public.organization_role_permissions enable row level security;
alter table public.organization_authorization_audit enable row level security;
create policy access_control_permissions_member_read on public.access_control_permissions for select to authenticated using (true);
create policy organization_roles_member_read on public.organization_roles for select to authenticated using (organization_id is null or exists(select 1 from public.organization_memberships m where m.organization_id=organization_roles.organization_id and m.user_id=(select auth.uid()) and m.status='active'));
create policy organization_role_permissions_member_read on public.organization_role_permissions for select to authenticated using (exists(select 1 from public.organization_roles r join public.organization_memberships m on m.organization_id=r.organization_id where r.id=organization_role_permissions.role_id and m.user_id=(select auth.uid()) and m.status='active'));
create policy organization_authorization_audit_service_only on public.organization_authorization_audit for all to service_role using(true) with check(true);
grant select on public.access_control_permissions,public.organization_roles,public.organization_role_permissions to authenticated;
grant all on public.organization_authorization_audit to service_role;

-- Atomic write operations used only by the isolated Access Control adapter.
create or replace function public.access_control_assign_membership_role(p_membership_id uuid,p_role_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare target_code text; target_organization uuid; membership_organization uuid;
begin
 select organization_id into membership_organization from public.organization_memberships where id=p_membership_id for update;
 select organization_id,code into target_organization,target_code from public.organization_roles where id=p_role_id and status='active';
 if membership_organization is null or target_organization is distinct from membership_organization then raise exception 'Role and membership must belong to the same organization'; end if;
 update public.organization_memberships set role_id=p_role_id,role=target_code,authorization_version=authorization_version+1,updated_at=now() where id=p_membership_id;
end $$;
create or replace function public.access_control_replace_role_permissions(p_role_id uuid,p_permissions text[])
returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.organization_roles where id=p_role_id and organization_id is not null and kind='custom' and status='active' for update) then raise exception 'Only active custom organization roles can be modified'; end if;
 if exists(select 1 from unnest(p_permissions) code left join public.access_control_permissions permission on permission.code=code where permission.code is null) then raise exception 'Unknown permission'; end if;
 delete from public.organization_role_permissions where role_id=p_role_id;
 insert into public.organization_role_permissions(role_id,permission_code) select p_role_id,code from unnest(p_permissions) code on conflict do nothing;
end $$;
revoke all on function public.access_control_assign_membership_role(uuid,uuid) from public,anon,authenticated;
revoke all on function public.access_control_replace_role_permissions(uuid,text[]) from public,anon,authenticated;
revoke all on function public.provision_organization_system_roles() from public,anon,authenticated;
revoke all on function public.assign_membership_organization_role() from public,anon,authenticated;
revoke all on function public.protect_last_organization_owner() from public,anon,authenticated;
revoke all on function public.protect_system_organization_role() from public,anon,authenticated;
revoke all on function public.bump_role_authorization_version() from public,anon,authenticated;
grant execute on function public.access_control_assign_membership_role(uuid,uuid) to service_role;
grant execute on function public.access_control_replace_role_permissions(uuid,text[]) to service_role;
