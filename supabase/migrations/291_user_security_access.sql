-- Portable user administration and exact access restrictions (SEG-001..025).
-- This is additive: a membership without an administration row retains legacy
-- company access until a portable consumer explicitly invokes the guards.

-- shared_companies is keyed by (tenant_id, id).  Organization ownership is
-- one-to-one with its legacy tenant, but PostgreSQL requires this explicit
-- candidate key before organization-scoped foreign keys may reference it.
create unique index if not exists shared_companies_organization_id_id_unique
  on public.shared_companies(organization_id, id);

create table if not exists public.organization_user_security (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  display_name text,
  administrative_priority integer not null default 0 check (administrative_priority between 0 and 1000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  foreign key (organization_id, user_id) references public.organization_memberships(organization_id, user_id) on delete cascade
);
create table if not exists public.organization_user_allowed_companies (
  organization_id uuid not null, user_id uuid not null, company_id text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, company_id),
  foreign key (organization_id, user_id) references public.organization_user_security(organization_id, user_id) on delete cascade,
  foreign key (organization_id, company_id) references public.shared_companies(organization_id, id) on delete restrict
);
create table if not exists public.organization_membership_scoped_grants (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null references public.organization_memberships(id) on delete cascade,
  permission_code text not null references public.access_control_permissions(code) on delete restrict,
  target_kind text not null check (target_kind in ('module','report','toolbar_action','table','process','price_list')),
  target_id text not null check (length(trim(target_id)) between 1 and 128),
  -- Empty denotes an organization-wide grant; non-empty values are checked by
  -- the write RPC against shared_companies before insertion.
  company_id text not null default '',
  created_at timestamptz not null default now(),
  primary key (membership_id, permission_code, target_kind, target_id, company_id)
);
create index if not exists organization_membership_scoped_grants_lookup_idx on public.organization_membership_scoped_grants(organization_id, membership_id, permission_code, target_kind, target_id);

insert into public.access_control_permissions(code,resource,action,description) values
 ('modules.access','modules','access','Acceder a módulos permitidos'), ('reports.run','reports','run','Ejecutar reportes permitidos'),
 ('toolbar_actions.use','toolbar_actions','use','Usar acciones permitidas'), ('tables.access','tables','access','Acceder a tablas permitidas'),
 ('processes.execute','processes','execute','Ejecutar procesos permitidos'), ('documents.void','documents','void','Anular documentos'),
 ('documents.print','documents','print','Imprimir documentos'), ('sales.price_lists.use','sales.price_lists','use','Usar listas de precio permitidas'),
 ('inventory.negative_stock.use','inventory','negative_stock','Permitir inventario negativo'), ('sales.overdrawn_customer.bill','sales','overdrawn_customer','Facturar cliente sobregirado'),
 ('sales.receivable_payments.reverse','sales.receivable_payments','reverse','Reversar cobros')
on conflict(code) do update set resource=excluded.resource, action=excluded.action, description=excluded.description;

-- Owners are the stable full-control baseline. New granular grants are not
-- silently added to administrator defaults, so an organization can opt in.
insert into public.organization_role_permissions(role_id,permission_code)
select r.id,p.code from public.organization_roles r cross join public.access_control_permissions p
where r.code='owner' and r.status='active' and p.code in ('modules.access','reports.run','toolbar_actions.use','tables.access','processes.execute','documents.void','documents.print','sales.price_lists.use','inventory.negative_stock.use','sales.overdrawn_customer.bill','sales.receivable_payments.reverse')
on conflict do nothing;

create or replace function public.assert_user_security_access(p_actor_user_id uuid,p_organization_id uuid,p_company_id text default null,p_permission text default 'members.update') returns uuid
language plpgsql security definer set search_path=public as $$
declare v_tenant_id uuid;
begin
  select o.legacy_tenant_id into v_tenant_id from public.organizations o join public.organization_memberships m on m.organization_id=o.id join public.organization_roles r on r.id=m.role_id and r.organization_id=o.id join public.organization_role_permissions rp on rp.role_id=r.id
  where o.id=p_organization_id and o.status='active' and m.user_id=p_actor_user_id and m.status='active' and r.status='active' and rp.permission_code=p_permission for share of o,m,r,rp;
  if not found then raise exception 'ORGANIZATIONAL_USER_ACCESS_DENIED'; end if;
  if p_company_id is not null and not exists(select 1 from public.shared_companies c where c.organization_id=p_organization_id and c.id=p_company_id) then raise exception 'ORGANIZATIONAL_USER_COMPANY_INVALID'; end if;
  -- A missing configuration preserves legacy access during the staged cutover.
  -- Once configured, the allow-list is authoritative and locked with its
  -- parent row so concurrent edits cannot bypass this decision.
  if p_company_id is not null and exists(select 1 from public.organization_user_security s where s.organization_id=p_organization_id and s.user_id=p_actor_user_id for share)
    and not exists(select 1 from public.organization_user_allowed_companies a where a.organization_id=p_organization_id and a.user_id=p_actor_user_id and a.company_id=p_company_id)
  then raise exception 'ORGANIZATIONAL_USER_ACCESS_DENIED'; end if;
  return v_tenant_id;
end $$;

create or replace function public.organization_user_security_json(p_organization_id uuid,p_user_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('organization_id',s.organization_id,'user_id',s.user_id,'email',u.email::text,'display_name',s.display_name,'administrative_priority',s.administrative_priority,'allowed_company_ids',coalesce((select jsonb_agg(a.company_id order by a.company_id) from public.organization_user_allowed_companies a where a.organization_id=s.organization_id and a.user_id=s.user_id),'[]'::jsonb),'status',m.status,'version',s.version)
 from public.organization_user_security s join public.organization_memberships m on m.organization_id=s.organization_id and m.user_id=s.user_id join auth.users u on u.id=s.user_id where s.organization_id=p_organization_id and s.user_id=p_user_id
$$;
create or replace function public.organization_user_security_authorize(p_organization_id uuid,p_actor_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_role_code text;
begin
 perform public.assert_user_security_access(p_actor_user_id,p_organization_id,null,'members.update');
 select r.code into v_role_code from public.organization_memberships m join public.organization_roles r on r.id=m.role_id where m.organization_id=p_organization_id and m.user_id=p_actor_user_id and m.status='active';
 return jsonb_build_object('organization_id',p_organization_id,'maximum_assignable_priority',case v_role_code when 'owner' then 1000 when 'admin' then 500 else 0 end);
end $$;
create or replace function public.organization_user_security_identity(p_user_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$ select jsonb_build_object('id',u.id,'email',u.email::text,'display_name',p.name) from auth.users u left join public.profiles p on p.id=u.id where u.id=p_user_id $$;
create or replace function public.organization_user_security_list(p_organization_id uuid,p_actor_user_id uuid) returns setof jsonb
language plpgsql security definer set search_path=public as $$ begin perform public.assert_user_security_access(p_actor_user_id,p_organization_id,null,'members.read'); return query select public.organization_user_security_json(s.organization_id,s.user_id) from public.organization_user_security s where s.organization_id=p_organization_id; end $$;
create or replace function public.organization_user_security_get(p_organization_id uuid,p_actor_user_id uuid,p_user_id uuid) returns setof jsonb
language plpgsql security definer set search_path=public as $$ begin perform public.assert_user_security_access(p_actor_user_id,p_organization_id,null,'members.read'); return query select public.organization_user_security_json(p_organization_id,p_user_id) where exists(select 1 from public.organization_user_security s where s.organization_id=p_organization_id and s.user_id=p_user_id); end $$;
create or replace function public.organization_user_security_create(p_organization_id uuid,p_actor_user_id uuid,p_user_id uuid,p_display_name text,p_administrative_priority integer,p_allowed_company_ids text[]) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 perform public.assert_user_security_access(p_actor_user_id,p_organization_id,null,'members.update');
 if p_administrative_priority is null or p_administrative_priority not between 0 and 1000 or p_display_name is not null and length(trim(p_display_name)) not between 1 and 160 or p_allowed_company_ids is null or exists(select 1 from unnest(p_allowed_company_ids) x where not exists(select 1 from public.shared_companies c where c.organization_id=p_organization_id and c.id=x)) then raise exception 'ORGANIZATIONAL_USER_DATA_INVALID'; end if;
 if not exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=p_user_id and m.status='active') then raise exception 'ORGANIZATIONAL_USER_NOT_FOUND'; end if;
 insert into public.organization_user_security(organization_id,user_id,display_name,administrative_priority) values(p_organization_id,p_user_id,nullif(trim(p_display_name),''),p_administrative_priority);
 insert into public.organization_user_allowed_companies(organization_id,user_id,company_id) select p_organization_id,p_user_id,x from unnest(p_allowed_company_ids) x on conflict do nothing;
 return public.organization_user_security_json(p_organization_id,p_user_id);
exception when unique_violation then raise exception 'ORGANIZATIONAL_USER_ALREADY_EXISTS'; end $$;
create or replace function public.organization_user_security_update(p_organization_id uuid,p_actor_user_id uuid,p_user_id uuid,p_expected_version integer,p_changes jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_current integer; v_companies text[];
begin
 perform public.assert_user_security_access(p_actor_user_id,p_organization_id,null,'members.update');
 if p_expected_version is null or p_expected_version<1 or p_changes is null or jsonb_typeof(p_changes)<>'object' or p_changes='{}'::jsonb or exists(select 1 from jsonb_object_keys(p_changes) k where k not in('displayName','administrativePriority','allowedCompanyIds')) then raise exception 'ORGANIZATIONAL_USER_DATA_INVALID'; end if;
 select version into v_current from public.organization_user_security where organization_id=p_organization_id and user_id=p_user_id for update; if v_current is null then raise exception 'ORGANIZATIONAL_USER_NOT_FOUND'; end if; if v_current<>p_expected_version then raise exception 'ORGANIZATIONAL_USER_VERSION_CONFLICT'; end if;
 if p_changes ? 'displayName' and (jsonb_typeof(p_changes->'displayName') not in ('string','null') or (jsonb_typeof(p_changes->'displayName')='string' and length(trim(p_changes->>'displayName')) not between 1 and 160)) then raise exception 'ORGANIZATIONAL_USER_DATA_INVALID'; end if;
 if p_changes ? 'administrativePriority' and (jsonb_typeof(p_changes->'administrativePriority')<>'number' or p_changes->>'administrativePriority' !~ '^[0-9]+$' or (p_changes->>'administrativePriority')::integer not between 0 and 1000) then raise exception 'ORGANIZATIONAL_USER_PRIORITY_INVALID'; end if;
 if p_changes ? 'allowedCompanyIds' then if jsonb_typeof(p_changes->'allowedCompanyIds')<>'array' then raise exception 'ORGANIZATIONAL_USER_COMPANY_INVALID'; end if; select array_agg(value) into v_companies from jsonb_array_elements_text(p_changes->'allowedCompanyIds'); if exists(select 1 from unnest(coalesce(v_companies,'{}')) x where not exists(select 1 from public.shared_companies c where c.organization_id=p_organization_id and c.id=x)) then raise exception 'ORGANIZATIONAL_USER_COMPANY_INVALID'; end if; delete from public.organization_user_allowed_companies where organization_id=p_organization_id and user_id=p_user_id; insert into public.organization_user_allowed_companies(organization_id,user_id,company_id) select p_organization_id,p_user_id,x from unnest(coalesce(v_companies,'{}')) x on conflict do nothing; end if;
 update public.organization_user_security set display_name=case when p_changes?'displayName' then nullif(trim(p_changes->>'displayName'),'') else display_name end,administrative_priority=case when p_changes?'administrativePriority' then (p_changes->>'administrativePriority')::integer else administrative_priority end,version=version+1,updated_at=now() where organization_id=p_organization_id and user_id=p_user_id;
 return public.organization_user_security_json(p_organization_id,p_user_id);
end $$;
create or replace function public.organization_user_security_revoke(p_organization_id uuid,p_actor_user_id uuid,p_user_id uuid,p_expected_version integer) returns void
language plpgsql security definer set search_path=public as $$
declare v_role_code text;
begin
 -- Serialize every owner transition for this organization before the access
 -- helper takes shared locks. This prevents two administrators revoking the
 -- final two owners in concurrent transactions and avoids lock upgrades.
 perform 1 from public.organizations where id=p_organization_id for update;
 perform public.assert_user_security_access(p_actor_user_id,p_organization_id,null,'members.revoke');
 select r.code into v_role_code from public.organization_memberships m join public.organization_roles r on r.id=m.role_id where m.organization_id=p_organization_id and m.user_id=p_user_id for update of m;
 if v_role_code='owner' and not exists(select 1 from public.organization_memberships m join public.organization_roles r on r.id=m.role_id where m.organization_id=p_organization_id and m.user_id<>p_user_id and m.status='active' and r.code='owner') then raise exception 'ORGANIZATIONAL_USER_ACCESS_DENIED'; end if;
 delete from public.organization_user_security where organization_id=p_organization_id and user_id=p_user_id and version=p_expected_version;
 if not found then raise exception 'ORGANIZATIONAL_USER_VERSION_CONFLICT'; end if;
 update public.organization_memberships set status='suspended',version=version+1,authorization_version=authorization_version+1,updated_at=now() where organization_id=p_organization_id and user_id=p_user_id;
end $$;

create or replace function public.organization_scoped_grant_has(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_permission_code text,p_target_kind text,p_target_id text) returns boolean
language plpgsql volatile security definer set search_path=public as $$
begin
  perform public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,p_permission_code);
  return exists(
    select 1 from public.organization_memberships m
    join public.organization_membership_scoped_grants g on g.membership_id=m.id
    where m.organization_id=p_organization_id and m.user_id=p_actor_user_id and m.status='active'
      and g.permission_code=p_permission_code and g.target_kind=p_target_kind
      and g.target_id=p_target_id and g.company_id=coalesce(p_company_id,'')
    for share of m,g
  );
end $$;
create or replace function public.organization_scoped_grant_grant(p_organization_id uuid,p_actor_user_id uuid,p_membership_id uuid,p_permission_code text,p_target_kind text,p_target_id text,p_company_id text) returns void
language plpgsql security definer set search_path=public as $$ begin perform public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'roles.manage'); if not public.organization_actor_has_permission(p_organization_id,p_actor_user_id,p_permission_code) then raise exception 'ORGANIZATIONAL_USER_ACCESS_DENIED'; end if; if not exists(select 1 from public.organization_memberships where id=p_membership_id and organization_id=p_organization_id) then raise exception 'ORGANIZATIONAL_USER_NOT_FOUND'; end if; insert into public.organization_membership_scoped_grants values(p_organization_id,p_membership_id,p_permission_code,p_target_kind,trim(p_target_id),coalesce(p_company_id,'')) on conflict do nothing; end $$;
create or replace function public.organization_scoped_grant_revoke(p_organization_id uuid,p_actor_user_id uuid,p_membership_id uuid,p_permission_code text,p_target_kind text,p_target_id text,p_company_id text) returns void
language plpgsql security definer set search_path=public as $$ begin perform public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'roles.manage'); delete from public.organization_membership_scoped_grants where organization_id=p_organization_id and membership_id=p_membership_id and permission_code=p_permission_code and target_kind=p_target_kind and target_id=trim(p_target_id) and company_id=coalesce(p_company_id,''); end $$;

-- Close the old archive race and include suspended memberships in the atomic check.
-- Membership writers acquire the same role lock before accepting an assignment;
-- a foreign-key check alone does not reject an existing but archived role.
create or replace function public.validate_active_membership_role() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.organization_roles where id=new.role_id
    and organization_id=new.organization_id and status='active' for share;
  if not found then raise exception 'ROLE_NOT_FOUND'; end if;
  return new;
end $$;
create trigger organization_memberships_validate_active_role
before insert or update of role_id,organization_id on public.organization_memberships
for each row execute function public.validate_active_membership_role();
revoke all on function public.validate_active_membership_role() from public,anon,authenticated,service_role;

create or replace function public.access_control_archive_role(p_role_id uuid,p_expected_version integer) returns jsonb language plpgsql security definer set search_path=public as $$ declare v_result jsonb; begin perform 1 from public.organization_roles where id=p_role_id for update; if exists(select 1 from public.organization_memberships where role_id=p_role_id) then raise exception 'ROLE_IN_USE'; end if; update public.organization_roles set status='archived',version=version+1,updated_at=now() where id=p_role_id and kind='custom' and status='active' and version=p_expected_version; if not found then raise exception 'ROLE_VERSION_CONFLICT'; end if; v_result:=public.access_control_role_json(p_role_id);return v_result; end $$;

alter table public.organization_user_security enable row level security; alter table public.organization_user_allowed_companies enable row level security; alter table public.organization_membership_scoped_grants enable row level security;
revoke all on public.organization_user_security,public.organization_user_allowed_companies,public.organization_membership_scoped_grants from public,anon,authenticated,service_role;
revoke all on function public.assert_user_security_access(uuid,uuid,text,text),public.organization_user_security_json(uuid,uuid),public.organization_user_security_authorize(uuid,uuid),public.organization_user_security_identity(uuid),public.organization_user_security_list(uuid,uuid),public.organization_user_security_get(uuid,uuid,uuid),public.organization_user_security_create(uuid,uuid,uuid,text,integer,text[]),public.organization_user_security_update(uuid,uuid,uuid,integer,jsonb),public.organization_user_security_revoke(uuid,uuid,uuid,integer),public.organization_scoped_grant_has(uuid,uuid,text,text,text,text),public.organization_scoped_grant_grant(uuid,uuid,uuid,text,text,text,text),public.organization_scoped_grant_revoke(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.access_control_archive_role(uuid,integer) from public,anon,authenticated;
grant execute on function public.organization_user_security_authorize(uuid,uuid),public.organization_user_security_identity(uuid),public.organization_user_security_list(uuid,uuid),public.organization_user_security_get(uuid,uuid,uuid),public.organization_user_security_create(uuid,uuid,uuid,text,integer,text[]),public.organization_user_security_update(uuid,uuid,uuid,integer,jsonb),public.organization_user_security_revoke(uuid,uuid,uuid,integer),public.organization_scoped_grant_has(uuid,uuid,text,text,text,text),public.organization_scoped_grant_grant(uuid,uuid,uuid,text,text,text,text),public.organization_scoped_grant_revoke(uuid,uuid,uuid,text,text,text,text),public.access_control_archive_role(uuid,integer) to service_role;
