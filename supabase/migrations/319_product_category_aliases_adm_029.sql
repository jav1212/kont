-- ADM-029 bounded slice: alternate names for canonical product categories.
-- Other classification domains require their own scope and are not stored here.

create table public.shared_inventory_product_category_aliases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id text not null,
  category_id text not null,
  alias text not null,
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, company_id)
    references public.shared_companies(tenant_id, id) on delete cascade,
  foreign key (tenant_id, category_id)
    references public.shared_inventory_departments(tenant_id, id) on delete cascade,
  check (alias = btrim(alias) and length(alias) between 1 and 120 and alias !~ '[[:cntrl:]]')
);

create unique index shared_inventory_product_category_aliases_active_name_uidx
  on public.shared_inventory_product_category_aliases(tenant_id, company_id, lower(btrim(alias)))
  where active;
create index shared_inventory_product_category_aliases_category_idx
  on public.shared_inventory_product_category_aliases(tenant_id, company_id, category_id, lower(alias))
  where active;

create table public.shared_inventory_product_category_alias_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id text not null,
  category_id text not null,
  alias_id uuid not null,
  alias text not null,
  actor_user_id uuid not null,
  action text not null check (action in ('created', 'retired')),
  previous_version integer,
  version integer not null check (version > 0),
  occurred_at timestamptz not null default now(),
  foreign key (tenant_id, company_id)
    references public.shared_companies(tenant_id, id) on delete cascade
);
create index shared_inventory_product_category_alias_events_scope_idx
  on public.shared_inventory_product_category_alias_events(tenant_id, company_id, occurred_at desc);

alter table public.shared_inventory_product_category_aliases enable row level security;
alter table public.shared_inventory_product_category_alias_events enable row level security;
revoke all on public.shared_inventory_product_category_aliases,
  public.shared_inventory_product_category_alias_events from public, anon, authenticated, service_role;

create or replace function public.guard_product_category_alias_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and lower(btrim(old.name)) = lower(btrim(new.name)) then
    return new;
  end if;
  -- Serialize canonical labels and aliases for this company. The existing
  -- category RPC also writes this table, so this trigger covers legacy writers.
  perform pg_advisory_xact_lock(hashtextextended(
    new.tenant_id::text || ':' || new.company_id || ':product-category-alias', 0
  ));
  if exists (
    select 1 from public.shared_inventory_product_category_aliases a
    where a.tenant_id = new.tenant_id and a.company_id = new.company_id and a.active
      and lower(btrim(a.alias)) = lower(btrim(new.name))
  ) then raise exception 'PRODUCT_CATEGORY_ALIAS_CONFLICT'; end if;
  return new;
end;
$$;
create trigger shared_inventory_department_alias_guard
before insert or update on public.shared_inventory_departments
for each row execute function public.guard_product_category_alias_name();

create or replace function public.list_native_product_category_aliases(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text, p_category_id text
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_tenant uuid;
begin
  v_tenant := public.native_products_assert_access(p_actor_user_id, p_organization_id, p_company_id);
  if not exists (
    select 1 from public.shared_inventory_departments
    where tenant_id = v_tenant and company_id = p_company_id and id = p_category_id
  ) then raise exception 'PRODUCT_CATEGORY_NOT_FOUND'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'companyId', a.company_id, 'categoryId', a.category_id,
      'alias', a.alias, 'status', case when a.active then 'active' else 'retired' end,
      'version', a.version
    ) order by lower(a.alias), a.id)
    from public.shared_inventory_product_category_aliases a
    where a.tenant_id = v_tenant and a.company_id = p_company_id
      and a.category_id = p_category_id and a.active
  ), '[]'::jsonb);
end;
$$;

create or replace function public.create_native_product_category_alias(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
  p_category_id text, p_alias text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_alias text; v_saved public.shared_inventory_product_category_aliases%rowtype;
begin
  v_tenant := public.native_products_assert_access(p_actor_user_id, p_organization_id, p_company_id);
  if not exists (
    select 1 from public.organization_memberships m
    join public.organization_roles r on r.id = m.role_id and r.organization_id = m.organization_id
    join public.organization_role_permissions rp on rp.role_id = r.id
    where m.organization_id = p_organization_id and m.user_id = p_actor_user_id
      and m.status = 'active' and r.status = 'active'
      and rp.permission_code = 'inventory.update'
  ) then raise exception 'PRODUCT_ACCESS_DENIED'; end if;
  v_alias := btrim(coalesce(p_alias, ''));
  if p_category_id is null or length(v_alias) not between 1 and 120
    or v_alias ~ '[[:cntrl:]]'
  then raise exception 'PRODUCT_CATEGORY_ALIAS_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_tenant::text || ':' || p_company_id || ':product-category-alias', 0
  ));
  perform 1 from public.shared_inventory_departments
    where tenant_id = v_tenant and company_id = p_company_id
      and id = p_category_id and active for update;
  if not found then raise exception 'PRODUCT_CATEGORY_NOT_FOUND'; end if;
  if exists (
    select 1 from public.shared_inventory_departments d
    where d.tenant_id = v_tenant and d.company_id = p_company_id
      and lower(btrim(d.name)) = lower(v_alias)
  ) then raise exception 'PRODUCT_CATEGORY_ALIAS_CONFLICT'; end if;
  begin
    insert into public.shared_inventory_product_category_aliases(
      tenant_id, company_id, category_id, alias
    ) values (v_tenant, p_company_id, p_category_id, v_alias)
    returning * into v_saved;
  exception when unique_violation then
    raise exception 'PRODUCT_DUPLICATE_CATEGORY_ALIAS';
  end;
  insert into public.shared_inventory_product_category_alias_events(
    tenant_id, company_id, category_id, alias_id, alias, actor_user_id, action, version
  ) values (v_tenant, p_company_id, p_category_id, v_saved.id, v_saved.alias,
    p_actor_user_id, 'created', v_saved.version);
  return jsonb_build_object('id', v_saved.id, 'companyId', v_saved.company_id,
    'categoryId', v_saved.category_id, 'alias', v_saved.alias, 'status', 'active',
    'version', v_saved.version);
end;
$$;

create or replace function public.retire_native_product_category_alias(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
  p_alias_id uuid, p_expected_version integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_alias public.shared_inventory_product_category_aliases%rowtype;
begin
  v_tenant := public.native_products_assert_access(p_actor_user_id, p_organization_id, p_company_id);
  if not exists (
    select 1 from public.organization_memberships m
    join public.organization_roles r on r.id = m.role_id and r.organization_id = m.organization_id
    join public.organization_role_permissions rp on rp.role_id = r.id
    where m.organization_id = p_organization_id and m.user_id = p_actor_user_id
      and m.status = 'active' and r.status = 'active'
      and rp.permission_code = 'inventory.update'
  ) then raise exception 'PRODUCT_ACCESS_DENIED'; end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'PRODUCT_CATEGORY_ALIAS_INVALID';
  end if;
  select * into v_alias from public.shared_inventory_product_category_aliases
  where tenant_id = v_tenant and company_id = p_company_id and id = p_alias_id for update;
  if not found then raise exception 'PRODUCT_CATEGORY_ALIAS_NOT_FOUND'; end if;
  if not v_alias.active then
    if p_expected_version in (v_alias.version, v_alias.version - 1) then
      return jsonb_build_object('id', v_alias.id, 'companyId', v_alias.company_id,
        'categoryId', v_alias.category_id, 'alias', v_alias.alias, 'status', 'retired',
        'version', v_alias.version);
    end if;
    raise exception 'PRODUCT_CATEGORY_ALIAS_VERSION_CONFLICT';
  end if;
  if v_alias.version <> p_expected_version then
    raise exception 'PRODUCT_CATEGORY_ALIAS_VERSION_CONFLICT';
  end if;
  update public.shared_inventory_product_category_aliases
  set active = false, version = version + 1, updated_at = now()
  where id = v_alias.id returning * into v_alias;
  insert into public.shared_inventory_product_category_alias_events(
    tenant_id, company_id, category_id, alias_id, alias, actor_user_id,
    action, previous_version, version
  ) values (v_tenant, p_company_id, v_alias.category_id, v_alias.id, v_alias.alias,
    p_actor_user_id, 'retired', p_expected_version, v_alias.version);
  return jsonb_build_object('id', v_alias.id, 'companyId', v_alias.company_id,
    'categoryId', v_alias.category_id, 'alias', v_alias.alias, 'status', 'retired',
    'version', v_alias.version);
end;
$$;

create or replace function public.resolve_native_product_category_alias(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text, p_source_name text
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_tenant uuid; v_name text; v_count integer; v_match record;
begin
  v_tenant := public.native_products_assert_access(p_actor_user_id, p_organization_id, p_company_id);
  v_name := btrim(coalesce(p_source_name, ''));
  if length(v_name) not between 1 and 120 or v_name ~ '[[:cntrl:]]' then
    raise exception 'PRODUCT_CATEGORY_ALIAS_INVALID';
  end if;
  select count(*) into v_count from public.shared_inventory_departments d
  where d.tenant_id = v_tenant and d.company_id = p_company_id and d.active
    and lower(btrim(d.name)) = lower(v_name);
  if v_count > 1 then raise exception 'PRODUCT_CATEGORY_ALIAS_CONFLICT'; end if;
  if v_count = 1 then
    select d.id, d.name into v_match from public.shared_inventory_departments d
    where d.tenant_id = v_tenant and d.company_id = p_company_id and d.active
      and lower(btrim(d.name)) = lower(v_name);
    return jsonb_build_object('categoryId', v_match.id, 'categoryName', v_match.name,
      'matchedAs', 'canonical');
  end if;
  select d.id, d.name into v_match
  from public.shared_inventory_product_category_aliases a
  join public.shared_inventory_departments d
    on d.tenant_id = a.tenant_id and d.company_id = a.company_id and d.id = a.category_id
  where a.tenant_id = v_tenant and a.company_id = p_company_id and a.active
    and d.active and lower(btrim(a.alias)) = lower(v_name);
  if not found then return null; end if;
  return jsonb_build_object('categoryId', v_match.id, 'categoryName', v_match.name,
    'matchedAs', 'alias');
end;
$$;

do $grants$
declare r record;
begin
  for r in select p.oid::regprocedure as signature
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'guard_product_category_alias_name',
    'list_native_product_category_aliases',
    'create_native_product_category_alias',
    'retire_native_product_category_alias',
    'resolve_native_product_category_alias'
  ) loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', r.signature);
  end loop;
end;
$grants$;

revoke all on function public.list_native_product_category_aliases(uuid, uuid, text, text),
  public.create_native_product_category_alias(uuid, uuid, text, text, text),
  public.retire_native_product_category_alias(uuid, uuid, text, uuid, integer),
  public.resolve_native_product_category_alias(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.list_native_product_category_aliases(uuid, uuid, text, text),
  public.create_native_product_category_alias(uuid, uuid, text, text, text),
  public.retire_native_product_category_alias(uuid, uuid, text, uuid, integer),
  public.resolve_native_product_category_alias(uuid, uuid, text, text)
  to service_role;
