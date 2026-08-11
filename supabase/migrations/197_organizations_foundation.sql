-- Organization foundation for native clients.
-- Additive compatibility migration: legacy tenant tables and columns remain authoritative
-- for the current Web application until its explicit cutover.

create table if not exists public.organizations (
    id uuid primary key default gen_random_uuid(),
    legacy_tenant_id uuid unique references public.tenants(id) on delete restrict,
    name text not null,
    slug text not null unique,
    status text not null default 'active' check (status in ('active', 'suspended')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.organization_memberships (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('owner', 'admin', 'accountant', 'seller', 'cashier')),
    status text not null default 'active' check (status in ('active', 'suspended')),
    joined_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, user_id)
);

create index if not exists organization_memberships_user_idx
    on public.organization_memberships(user_id, status);

alter table public.shared_companies
    add column if not exists organization_id uuid references public.organizations(id) on delete restrict;

create index if not exists shared_companies_organization_idx
    on public.shared_companies(organization_id, name);

insert into public.organizations (legacy_tenant_id, name, slug, status, created_at, updated_at)
select
    t.id,
    coalesce(nullif(trim(p.name), ''), nullif(trim(p.email), ''), 'Organización'),
    'org-' || replace(t.id::text, '-', ''),
    case when t.status = 'suspended' then 'suspended' else 'active' end,
    t.created_at,
    t.updated_at
from public.tenants t
left join public.profiles p on p.id = t.id
on conflict (legacy_tenant_id) do update set
    name = excluded.name,
    status = excluded.status,
    updated_at = excluded.updated_at;

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
select o.id, t.id, 'owner', case when t.status = 'suspended' then 'suspended' else 'active' end, t.created_at
from public.tenants t
join public.organizations o on o.legacy_tenant_id = t.id
on conflict (organization_id, user_id) do update set
    role = 'owner',
    status = excluded.status,
    updated_at = now();

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
select
    o.id,
    m.member_id,
    case m.role
        when 'owner' then 'owner'
        when 'contador' then 'accountant'
        when 'contable' then 'accountant'
        when 'vendedor' then 'seller'
        when 'cajero' then 'cashier'
        when 'admin' then 'admin'
        else 'cashier'
    end,
    case when m.accepted_at is not null and m.revoked_at is null then 'active' else 'suspended' end,
    coalesce(m.accepted_at, m.created_at)
from public.tenant_memberships m
join public.organizations o on o.legacy_tenant_id = m.tenant_id
where m.member_id is not null
on conflict (organization_id, user_id) do nothing;

update public.shared_companies c
set organization_id = o.id
from public.organizations o
where o.legacy_tenant_id = c.tenant_id
  and c.organization_id is null;

create or replace function public.sync_legacy_tenant_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_organization_id uuid;
    v_name text;
begin
    select coalesce(nullif(trim(p.name), ''), nullif(trim(p.email), ''), 'Organización')
      into v_name from public.profiles p where p.id = new.id;
    v_name := coalesce(v_name, 'Organización');

    insert into public.organizations (legacy_tenant_id, name, slug, status, created_at, updated_at)
    values (
        new.id,
        v_name,
        'org-' || replace(new.id::text, '-', ''),
        case when new.status = 'suspended' then 'suspended' else 'active' end,
        new.created_at,
        new.updated_at
    )
    on conflict (legacy_tenant_id) do update set
        status = excluded.status,
        updated_at = excluded.updated_at
    returning id into v_organization_id;

    insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
    values (
        v_organization_id,
        new.id,
        'owner',
        case when new.status = 'suspended' then 'suspended' else 'active' end,
        new.created_at
    )
    on conflict (organization_id, user_id) do update set
        role = 'owner',
        status = excluded.status,
        updated_at = now();
    return new;
end;
$$;

drop trigger if exists tenants_sync_organization on public.tenants;
create trigger tenants_sync_organization
after insert or update of status on public.tenants
for each row execute function public.sync_legacy_tenant_organization();

create or replace function public.sync_legacy_organization_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_organization_id uuid;
begin
    if new.member_id is null then return new; end if;
    select id into v_organization_id from public.organizations where legacy_tenant_id = new.tenant_id;
    if v_organization_id is null then return new; end if;

    insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
    values (
        v_organization_id,
        new.member_id,
        case new.role
            when 'owner' then 'owner'
            when 'contador' then 'accountant'
            when 'contable' then 'accountant'
            when 'vendedor' then 'seller'
            when 'cajero' then 'cashier'
            when 'admin' then 'admin'
            else 'cashier'
        end,
        case when new.accepted_at is not null and new.revoked_at is null then 'active' else 'suspended' end,
        coalesce(new.accepted_at, new.created_at)
    )
    on conflict (organization_id, user_id) do update set
        role = excluded.role,
        status = excluded.status,
        updated_at = now();
    return new;
end;
$$;

drop trigger if exists tenant_memberships_sync_organization on public.tenant_memberships;
create trigger tenant_memberships_sync_organization
after insert or update of role, accepted_at, revoked_at on public.tenant_memberships
for each row execute function public.sync_legacy_organization_membership();

create or replace function public.assign_shared_company_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.organization_id is null then
        select id into new.organization_id from public.organizations where legacy_tenant_id = new.tenant_id;
    end if;
    return new;
end;
$$;

drop trigger if exists shared_companies_assign_organization on public.shared_companies;
create trigger shared_companies_assign_organization
before insert or update of tenant_id on public.shared_companies
for each row execute function public.assign_shared_company_organization();

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;

drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations
for select to authenticated using (
    exists (
        select 1 from public.organization_memberships membership
        where membership.organization_id = organizations.id
          and membership.user_id = auth.uid()
          and membership.status = 'active'
    )
);

drop policy if exists organization_memberships_self_read on public.organization_memberships;
create policy organization_memberships_self_read on public.organization_memberships
for select to authenticated using (user_id = auth.uid());

grant select on public.organizations to authenticated;
grant select on public.organization_memberships to authenticated;
