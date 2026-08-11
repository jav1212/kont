-- Organization referrals and billing credit ledger. Additive: legacy referral
-- tables, routes and Web behavior remain unchanged.
insert into public.access_control_permissions(code,resource,action,description) values
('referrals.read','referrals','read','Ver referidos y créditos'),('referrals.manage','referrals','manage','Gestionar referidos') on conflict do nothing;
insert into public.organization_role_permissions(role_id,permission_code)
select r.id,p.code from public.organization_roles r join public.access_control_permissions p on
(r.code='owner' and p.resource='referrals') or (r.code='admin' and p.resource='referrals') or (r.code='accountant' and p.code='referrals.read') on conflict do nothing;
create table public.referral_policies(
 id uuid primary key default gen_random_uuid(),code text not null,version integer not null check(version>0),
 reward_type text not null check(reward_type in('fixed_amount','percentage')),value_basis_points integer not null check(value_basis_points between 1 and 10000),
 currency text not null check(currency in('USD','VES')),first_paid_invoice_only boolean not null default true,status text not null check(status in('active','archived')),
 created_at timestamptz not null default now(),unique(code,version));
insert into public.referral_policies(code,version,reward_type,value_basis_points,currency,first_paid_invoice_only,status)
values('legacy-first-payment',1,'percentage',2000,'USD',true,'active');

create table public.organization_referral_accounts(
 organization_id uuid primary key references public.organizations(id) on delete cascade,code text not null unique,
 status text not null default 'active' check(status in('active','suspended')),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create or replace function public.ensure_organization_referral_account(p_organization_id uuid) returns text
language plpgsql security definer set search_path=public as $$
declare result text; candidate text;
begin
 select code into result from public.organization_referral_accounts where organization_id=p_organization_id;
 if result is not null then return result; end if;
 if not exists(select 1 from public.organizations where id=p_organization_id) then raise exception 'Organization not found'; end if;
 loop
  candidate:='K'||upper(substr(md5(gen_random_uuid()::text),1,10));
  begin
   insert into public.organization_referral_accounts(organization_id,code) values(p_organization_id,candidate) returning code into result;
   return result;
  exception when unique_violation then
   select code into result from public.organization_referral_accounts where organization_id=p_organization_id;
   if result is not null then return result; end if;
  end;
 end loop;
end $$;
revoke all on function public.ensure_organization_referral_account(uuid) from public,anon,authenticated;
grant execute on function public.ensure_organization_referral_account(uuid) to service_role;
create table public.organization_referral_attributions(
 id uuid primary key default gen_random_uuid(),referrer_organization_id uuid not null references public.organizations(id) on delete restrict,
 referred_organization_id uuid not null unique references public.organizations(id) on delete restrict,referral_code text not null,
 status text not null default 'active' check(status in('active','qualified','cancelled')),attributed_at timestamptz not null default now(),qualified_at timestamptz,
 check(referrer_organization_id<>referred_organization_id));
create index organization_referral_attributions_referrer_idx on public.organization_referral_attributions(referrer_organization_id,status);
create table public.organization_referral_rewards(
 id uuid primary key default gen_random_uuid(),beneficiary_organization_id uuid not null references public.organizations(id) on delete restrict,
 referred_organization_id uuid not null references public.organizations(id) on delete restrict,policy_id uuid not null references public.referral_policies(id) on delete restrict,
 policy_version integer not null,reward_type text not null check(reward_type in('fixed_amount','percentage')),configured_value integer not null,
 calculated_minor bigint not null check(calculated_minor>0),currency text not null check(currency in('USD','VES')),source_invoice_id text not null unique,
 status text not null check(status in('pending','qualified','granted','cancelled','expired')),created_at timestamptz not null default now(),
 unique(referred_organization_id,policy_id));

create table public.organization_billing_credit_entries(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete restrict,
 entry_type text not null check(entry_type in('referral_grant','promotional_grant','manual_adjustment','invoice_application','grant_reversal','application_reversal','expiration')),
 amount_minor bigint not null check(amount_minor>0),currency text not null check(currency in('USD','VES')),source_type text not null,source_id text not null,
 idempotency_key text not null unique,occurred_at timestamptz not null,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create index organization_billing_credit_entries_org_currency_idx on public.organization_billing_credit_entries(organization_id,currency,occurred_at);
create table public.organization_billing_credit_applications(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete restrict,
 invoice_id text not null,entry_id uuid not null unique references public.organization_billing_credit_entries(id) on delete restrict,
 amount_minor bigint not null check(amount_minor>0),currency text not null check(currency in('USD','VES')),created_at timestamptz not null default now());
create index organization_billing_credit_applications_invoice_idx on public.organization_billing_credit_applications(organization_id,invoice_id);

insert into public.organization_referral_accounts(organization_id,code,status,created_at)
select o.id,t.referral_code,case when o.status='active' then 'active' else 'suspended' end,t.created_at
from public.organizations o join public.tenants t on t.id=o.legacy_tenant_id where t.referral_code is not null on conflict do nothing;
insert into public.organization_referral_attributions(referrer_organization_id,referred_organization_id,referral_code,status,attributed_at)
select referrer.id,referred.id,rt.referral_code,'active',coalesce(t.created_at,now())
from public.tenants t join public.organizations referred on referred.legacy_tenant_id=t.id join public.organizations referrer on referrer.legacy_tenant_id=t.referred_by
join public.tenants rt on rt.id=t.referred_by where t.referred_by is not null on conflict do nothing;
insert into public.organization_referral_rewards(id,beneficiary_organization_id,referred_organization_id,policy_id,policy_version,reward_type,configured_value,calculated_minor,currency,source_invoice_id,status,created_at)
select c.id,ro.id,rd.id,p.id,p.version,p.reward_type,p.value_basis_points,round(c.amount_usd*100)::bigint,'USD',c.source_payment_request_id::text,'granted',c.created_at
from public.referral_credits c join public.organizations ro on ro.legacy_tenant_id=c.referrer_tenant_id join public.organizations rd on rd.legacy_tenant_id=c.referred_tenant_id
cross join lateral(select * from public.referral_policies where code='legacy-first-payment' and version=1)p on conflict do nothing;
insert into public.organization_billing_credit_entries(organization_id,entry_type,amount_minor,currency,source_type,source_id,idempotency_key,occurred_at)
select beneficiary_organization_id,'referral_grant',calculated_minor,currency,'referral_reward',id::text,'legacy-referral-credit:'||id,created_at from public.organization_referral_rewards on conflict do nothing;
insert into public.organization_billing_credit_entries(organization_id,entry_type,amount_minor,currency,source_type,source_id,idempotency_key,occurred_at)
select reward.beneficiary_organization_id,'invoice_application',round(redemption.amount_usd*100)::bigint,'USD','legacy_referral_redemption',redemption.id::text,'legacy-referral-redemption:'||redemption.id,redemption.created_at
from public.referral_redemptions redemption join public.organization_referral_rewards reward on reward.id=redemption.credit_id on conflict do nothing;
insert into public.organization_billing_credit_applications(organization_id,invoice_id,entry_id,amount_minor,currency,created_at)
select entry.organization_id,redemption.payment_request_id::text,entry.id,entry.amount_minor,entry.currency,redemption.created_at
from public.referral_redemptions redemption join public.organization_billing_credit_entries entry on entry.idempotency_key='legacy-referral-redemption:'||redemption.id on conflict do nothing;

create or replace function public.organization_billing_credit_balance(p_organization_id uuid,p_currency text default 'USD') returns bigint language sql stable security invoker set search_path=public as $$
 select coalesce(sum(case when entry_type in('referral_grant','promotional_grant','manual_adjustment','application_reversal') then amount_minor else -amount_minor end),0)::bigint
 from public.organization_billing_credit_entries where organization_id=p_organization_id and currency=p_currency $$;
create or replace function public.issue_organization_billing_credit(p_organization_id uuid,p_entry_type text,p_amount_minor bigint,p_currency text,p_source_type text,p_source_id text,p_idempotency_key text,p_occurred_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$ declare result uuid; begin
 if p_entry_type not in('referral_grant','promotional_grant','manual_adjustment','application_reversal') or p_amount_minor<=0 then raise exception 'Invalid credit grant';end if;
 insert into public.organization_billing_credit_entries(organization_id,entry_type,amount_minor,currency,source_type,source_id,idempotency_key,occurred_at)
 values(p_organization_id,p_entry_type,p_amount_minor,p_currency,p_source_type,p_source_id,p_idempotency_key,p_occurred_at)
 on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into result;return result;end $$;
revoke all on function public.issue_organization_billing_credit(uuid,text,bigint,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.issue_organization_billing_credit(uuid,text,bigint,text,text,text,text,timestamptz) to service_role;

alter table public.referral_policies enable row level security;alter table public.organization_referral_accounts enable row level security;
alter table public.organization_referral_attributions enable row level security;alter table public.organization_referral_rewards enable row level security;
alter table public.organization_billing_credit_entries enable row level security;alter table public.organization_billing_credit_applications enable row level security;
create policy referral_policies_read on public.referral_policies for select to authenticated using(true);
create policy referral_accounts_member_read on public.organization_referral_accounts for select to authenticated using(exists(select 1 from public.organization_memberships m where m.organization_id=organization_referral_accounts.organization_id and m.user_id=(select auth.uid()) and m.status='active'));
create policy referral_attributions_member_read on public.organization_referral_attributions for select to authenticated using(exists(select 1 from public.organization_memberships m where m.organization_id in(referrer_organization_id,referred_organization_id) and m.user_id=(select auth.uid()) and m.status='active'));
create policy referral_rewards_member_read on public.organization_referral_rewards for select to authenticated using(exists(select 1 from public.organization_memberships m where m.organization_id in(beneficiary_organization_id,referred_organization_id) and m.user_id=(select auth.uid()) and m.status='active'));
create policy billing_credit_entries_member_read on public.organization_billing_credit_entries for select to authenticated using(exists(select 1 from public.organization_memberships m where m.organization_id=organization_billing_credit_entries.organization_id and m.user_id=(select auth.uid()) and m.status='active'));
create policy billing_credit_applications_member_read on public.organization_billing_credit_applications for select to authenticated using(exists(select 1 from public.organization_memberships m where m.organization_id=organization_billing_credit_applications.organization_id and m.user_id=(select auth.uid()) and m.status='active'));
grant select on public.referral_policies,public.organization_referral_accounts,public.organization_referral_attributions,public.organization_referral_rewards,public.organization_billing_credit_entries,public.organization_billing_credit_applications to authenticated;
