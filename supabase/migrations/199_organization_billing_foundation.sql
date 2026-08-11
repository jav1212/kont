-- Additive organization-owned billing model. Legacy billing tables remain unchanged.

create table if not exists public.organization_billing_accounts (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null unique references public.organizations(id) on delete cascade,
    legal_name text not null,
    tax_id text,
    billing_email text,
    country_code char(2) not null default 'VE',
    currency char(3) not null default 'USD' check (currency in ('USD', 'VES')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.organization_subscriptions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    legacy_subscription_id uuid unique references public.tenant_subscriptions(id) on delete set null,
    product_id uuid not null references public.products(id),
    plan_id uuid references public.plans(id),
    status text not null check (status in ('trial', 'active', 'suspended', 'cancelled')),
    billing_cycle text check (billing_cycle in ('monthly', 'quarterly', 'annual')),
    current_period_start timestamptz,
    current_period_end timestamptz,
    last_payment_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, product_id)
);

create table if not exists public.organization_payment_methods (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    kind text not null check (kind in ('card', 'bank_transfer', 'cash', 'other')),
    provider text not null,
    provider_reference text not null,
    display_label text not null,
    is_default boolean not null default false,
    status text not null default 'active' check (status in ('active', 'disabled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (provider, provider_reference)
);

create unique index if not exists organization_payment_methods_one_default_idx
    on public.organization_payment_methods(organization_id) where is_default and status = 'active';

create table if not exists public.organization_invoices (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    subscription_id uuid references public.organization_subscriptions(id) on delete set null,
    number text not null unique,
    status text not null check (status in ('draft', 'open', 'paid', 'void', 'uncollectible')),
    currency char(3) not null check (currency in ('USD', 'VES')),
    subtotal_minor bigint not null check (subtotal_minor >= 0),
    tax_minor bigint not null default 0 check (tax_minor >= 0),
    total_minor bigint not null check (total_minor >= 0 and total_minor = subtotal_minor + tax_minor),
    issued_at timestamptz,
    due_at timestamptz,
    paid_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists organization_subscriptions_organization_idx on public.organization_subscriptions(organization_id, status);
create index if not exists organization_invoices_organization_idx on public.organization_invoices(organization_id, created_at desc);
create index if not exists organization_payment_methods_organization_idx on public.organization_payment_methods(organization_id, status);

insert into public.organization_billing_accounts (organization_id, legal_name, billing_email)
select o.id, o.name, nullif(trim(p.email), '')
from public.organizations o
left join public.profiles p on p.id = o.legacy_tenant_id
on conflict (organization_id) do nothing;

insert into public.organization_subscriptions (
    organization_id, legacy_subscription_id, product_id, plan_id, status, billing_cycle,
    current_period_start, current_period_end, last_payment_at, created_at, updated_at
)
select
    o.id, s.id, s.product_id, s.plan_id, s.status, s.billing_cycle,
    s.current_period_start, s.current_period_end, s.last_payment_at, s.created_at, now()
from public.tenant_subscriptions s
join public.organizations o on o.legacy_tenant_id = s.tenant_id
on conflict (organization_id, product_id) do update set
    legacy_subscription_id = excluded.legacy_subscription_id,
    plan_id = excluded.plan_id,
    status = excluded.status,
    billing_cycle = excluded.billing_cycle,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    last_payment_at = excluded.last_payment_at,
    updated_at = now();

create or replace function public.create_organization_billing_account()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.organization_billing_accounts (organization_id, legal_name)
    values (new.id, new.name)
    on conflict (organization_id) do nothing;
    return new;
end;
$$;
drop trigger if exists organizations_create_billing_account on public.organizations;
create trigger organizations_create_billing_account
after insert on public.organizations
for each row execute function public.create_organization_billing_account();

create or replace function public.sync_legacy_organization_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_organization_id uuid;
begin
    select id into v_organization_id from public.organizations where legacy_tenant_id = new.tenant_id;
    if v_organization_id is null then return new; end if;
    insert into public.organization_subscriptions (
        organization_id, legacy_subscription_id, product_id, plan_id, status, billing_cycle,
        current_period_start, current_period_end, last_payment_at, created_at, updated_at
    ) values (
        v_organization_id, new.id, new.product_id, new.plan_id, new.status, new.billing_cycle,
        new.current_period_start, new.current_period_end, new.last_payment_at, new.created_at, now()
    )
    on conflict (organization_id, product_id) do update set
        legacy_subscription_id = excluded.legacy_subscription_id,
        plan_id = excluded.plan_id,
        status = excluded.status,
        billing_cycle = excluded.billing_cycle,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        last_payment_at = excluded.last_payment_at,
        updated_at = now();
    return new;
end;
$$;
drop trigger if exists tenant_subscriptions_sync_organization on public.tenant_subscriptions;
create trigger tenant_subscriptions_sync_organization
after insert or update of plan_id, status, billing_cycle, current_period_start, current_period_end, last_payment_at
on public.tenant_subscriptions
for each row execute function public.sync_legacy_organization_subscription();

alter table public.organization_billing_accounts enable row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.organization_payment_methods enable row level security;
alter table public.organization_invoices enable row level security;

create policy organization_billing_accounts_member_read on public.organization_billing_accounts for select to authenticated using (
    exists (select 1 from public.organization_memberships m where m.organization_id=organization_billing_accounts.organization_id and m.user_id=(select auth.uid()) and m.status='active')
);
create policy organization_subscriptions_member_read on public.organization_subscriptions for select to authenticated using (
    exists (select 1 from public.organization_memberships m where m.organization_id=organization_subscriptions.organization_id and m.user_id=(select auth.uid()) and m.status='active')
);
create policy organization_invoices_finance_read on public.organization_invoices for select to authenticated using (
    exists (select 1 from public.organization_memberships m where m.organization_id=organization_invoices.organization_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin','accountant'))
);
create policy organization_payment_methods_admin_read on public.organization_payment_methods for select to authenticated using (
    exists (select 1 from public.organization_memberships m where m.organization_id=organization_payment_methods.organization_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin'))
);

grant select on public.organization_billing_accounts to authenticated;
grant select on public.organization_subscriptions to authenticated;
grant select on public.organization_invoices to authenticated;
grant select on public.organization_payment_methods to authenticated;
