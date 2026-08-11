-- Native billing orchestration. Additive only; legacy Web billing remains unchanged.
create table public.organization_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid not null references public.organization_invoices(id) on delete restrict,
  provider text not null check (provider in ('manual','stripe','mercado_pago','bank')),
  provider_reference text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency in ('USD','VES')),
  status text not null check (status in ('pending','confirmed','failed','refunded')),
  idempotency_key text not null unique,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_reference)
);

create index organization_payments_organization_idx
  on public.organization_payments(organization_id, created_at desc);
create index organization_payments_invoice_idx
  on public.organization_payments(invoice_id);

create table public.organization_domain_event_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processed','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  occurred_at timestamptz not null,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(aggregate_type, aggregate_id, event_type)
);

create index organization_domain_event_outbox_pending_idx
  on public.organization_domain_event_outbox(status, occurred_at)
  where status = 'pending';
create index organization_domain_event_outbox_organization_idx
  on public.organization_domain_event_outbox(organization_id, occurred_at desc);

create or replace function public.confirm_organization_payment(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_provider text,
  p_provider_reference text,
  p_amount_minor bigint,
  p_currency text,
  p_idempotency_key text,
  p_occurred_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  invoice_record public.organization_invoices%rowtype;
  payment_record public.organization_payments%rowtype;
  event_record public.organization_domain_event_outbox%rowtype;
  applied_minor bigint;
  expected_minor bigint;
  first_paid boolean;
begin
  select * into payment_record from public.organization_payments where idempotency_key=p_idempotency_key;
  if found then
    if payment_record.organization_id<>p_organization_id then raise exception 'idempotency_conflict'; end if;
    select * into event_record from public.organization_domain_event_outbox
      where aggregate_type='payment' and aggregate_id=payment_record.id and event_type='payment.confirmed';
    return jsonb_build_object('payment',to_jsonb(payment_record),'event',event_record.payload||jsonb_build_object('id',event_record.id));
  end if;

  select * into invoice_record from public.organization_invoices
    where id=p_invoice_id and organization_id=p_organization_id for update;
  if not found or invoice_record.status <> 'open' then raise exception 'invoice_not_payable'; end if;
  if invoice_record.currency <> p_currency then raise exception 'currency_mismatch'; end if;

  select coalesce(sum(amount_minor),0) into applied_minor
    from public.organization_billing_credit_applications
    where organization_id=p_organization_id and invoice_id=p_invoice_id::text and currency=p_currency;
  expected_minor:=invoice_record.total_minor-applied_minor;
  if p_amount_minor<=0 or p_amount_minor<>expected_minor then raise exception 'payment_amount_invalid'; end if;

  select not exists(select 1 from public.organization_payments where organization_id=p_organization_id and status='confirmed') into first_paid;
  insert into public.organization_payments(organization_id,invoice_id,provider,provider_reference,amount_minor,currency,status,idempotency_key,confirmed_at)
    values(p_organization_id,p_invoice_id,p_provider,p_provider_reference,p_amount_minor,p_currency,'confirmed',p_idempotency_key,p_occurred_at)
    returning * into payment_record;
  update public.organization_invoices set status='paid',paid_at=p_occurred_at,updated_at=now() where id=p_invoice_id;
  insert into public.organization_domain_event_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,occurred_at)
    values(p_organization_id,'payment',payment_record.id,'payment.confirmed',jsonb_build_object(
      'paymentId',payment_record.id,'organizationId',p_organization_id,'invoiceId',p_invoice_id,
      'amountMinor',p_amount_minor::text,'currency',p_currency,'isFirstPaidInvoice',first_paid,'occurredAt',p_occurred_at
    ),p_occurred_at) returning * into event_record;
  return jsonb_build_object('payment',to_jsonb(payment_record),'event',event_record.payload||jsonb_build_object('id',event_record.id));
end $$;

create or replace function public.apply_organization_billing_credit(
  p_organization_id uuid,
  p_invoice_id text,
  p_amount_minor bigint,
  p_currency text,
  p_idempotency_key text,
  p_occurred_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare invoice_record public.organization_invoices%rowtype; entry_record public.organization_billing_credit_entries%rowtype;
 application_record public.organization_billing_credit_applications%rowtype; balance_minor bigint; applied_minor bigint;
begin
  select * into entry_record from public.organization_billing_credit_entries where idempotency_key=p_idempotency_key;
  if found then
   if entry_record.organization_id<>p_organization_id or entry_record.source_id<>p_invoice_id then raise exception 'idempotency_conflict'; end if;
   select * into application_record from public.organization_billing_credit_applications where entry_id=entry_record.id;
   return to_jsonb(application_record);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_currency,0));
  select * into invoice_record from public.organization_invoices where id=p_invoice_id::uuid and organization_id=p_organization_id for update;
  if not found or invoice_record.status<>'open' then raise exception 'invoice_not_applicable'; end if;
  if invoice_record.currency<>p_currency then raise exception 'currency_mismatch'; end if;
  select public.organization_billing_credit_balance(p_organization_id,p_currency) into balance_minor;
  if p_amount_minor<=0 or p_amount_minor>balance_minor then raise exception 'insufficient_credit'; end if;
  select coalesce(sum(amount_minor),0) into applied_minor from public.organization_billing_credit_applications where organization_id=p_organization_id and invoice_id=p_invoice_id;
  if p_amount_minor>invoice_record.total_minor-applied_minor then raise exception 'invoice_not_applicable'; end if;
  insert into public.organization_billing_credit_entries(organization_id,entry_type,amount_minor,currency,source_type,source_id,idempotency_key,occurred_at)
    values(p_organization_id,'invoice_application',p_amount_minor,p_currency,'organization_invoice',p_invoice_id,p_idempotency_key,p_occurred_at) returning * into entry_record;
  insert into public.organization_billing_credit_applications(organization_id,invoice_id,entry_id,amount_minor,currency,created_at)
    values(p_organization_id,p_invoice_id,entry_record.id,p_amount_minor,p_currency,p_occurred_at) returning * into application_record;
  return to_jsonb(application_record);
end $$;

create or replace function public.mark_organization_outbox_processed(p_event_id uuid,p_processed_at timestamptz)
returns void language sql security definer set search_path=public as $$
 update public.organization_domain_event_outbox set status='processed',processed_at=p_processed_at,attempts=attempts+1,last_error=null
 where id=p_event_id and status='pending' $$;

revoke all on function public.confirm_organization_payment(uuid,uuid,text,text,bigint,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.apply_organization_billing_credit(uuid,text,bigint,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.mark_organization_outbox_processed(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.confirm_organization_payment(uuid,uuid,text,text,bigint,text,text,timestamptz) to service_role;
grant execute on function public.apply_organization_billing_credit(uuid,text,bigint,text,text,timestamptz) to service_role;
grant execute on function public.mark_organization_outbox_processed(uuid,timestamptz) to service_role;

alter table public.organization_payments enable row level security;
alter table public.organization_domain_event_outbox enable row level security;
-- Payments and outbox events are exposed only through the authorized Native API.
create policy organization_payments_no_direct_access on public.organization_payments for select to authenticated using(false);
create policy organization_outbox_no_direct_access on public.organization_domain_event_outbox for select to authenticated using(false);
