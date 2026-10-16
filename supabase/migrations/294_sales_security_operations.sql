-- Package entrypoints for commercial security. Existing Web RPC signatures remain intact.
-- Credit limits use VES and debt's historical VES rate, never a client-supplied balance.
create table public.shared_customer_credit_limits (
  tenant_id uuid not null, company_id text not null, customer_id text not null,
  limit_ves numeric(28,8) not null check (limit_ves >= 0),
  version integer not null default 1 check (version > 0),
  updated_by uuid not null, updated_at timestamptz not null default now(),
  primary key (tenant_id,company_id,customer_id),
  foreign key (tenant_id,company_id) references public.shared_companies(tenant_id,id),
  foreign key (tenant_id,customer_id) references public.shared_inventory_customers(tenant_id,id)
);
create table public.shared_sales_payment_reversals (
  tenant_id uuid not null, id text not null default gen_random_uuid()::text,
  payment_id text not null, idempotency_key text not null,
  actor_id uuid not null, reason text not null check(length(trim(reason)) between 1 and 500),
  occurred_at timestamptz not null default now(),
  primary key(tenant_id,id), unique(tenant_id,payment_id), unique(tenant_id,idempotency_key),
  foreign key(tenant_id,payment_id) references public.shared_sales_receivable_payments(tenant_id,id)
);
alter table public.shared_inventory_sales_invoices add column if not exists security_price_list_id text;
alter table public.shared_customer_credit_limits enable row level security;
alter table public.shared_sales_payment_reversals enable row level security;
revoke all on public.shared_customer_credit_limits,public.shared_sales_payment_reversals from public,anon,authenticated,service_role;
grant select on public.shared_sales_payment_reversals to service_role;

create or replace function public.reject_sales_payment_reversal_mutation()
returns trigger language plpgsql set search_path=public as $$
begin raise exception 'SALES_REVERSAL_IMMUTABLE'; end $$;
create trigger sales_payment_reversals_immutable before update or delete or truncate
on public.shared_sales_payment_reversals for each statement execute function public.reject_sales_payment_reversal_mutation();
revoke all on function public.reject_sales_payment_reversal_mutation() from public,anon,authenticated;
create trigger operational_audit_sales_payment_reversal after insert
on public.shared_sales_payment_reversals for each row
execute function public.append_operational_audit_trigger('receivable_payment_reversal','payment_reversal');

create or replace function public.set_native_customer_credit_limit(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_customer_id text,
  p_limit_ves numeric,p_expected_version integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_current public.shared_customer_credit_limits%rowtype; v_customer text;
begin
  v_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'sales.update');
  if p_limit_ves is null or p_limit_ves < 0 or p_limit_ves::text in ('NaN','Infinity','-Infinity')
     or p_limit_ves <> round(p_limit_ves,8) or p_limit_ves >= 100000000000000000000
     or p_expected_version is null or p_expected_version < 0 then raise exception 'SALES_CREDIT_INVALID'; end if;
  select id into v_customer from public.shared_inventory_customers
    where tenant_id=v_tenant and company_id=p_company_id and id=p_customer_id for update;
  if not found then raise exception 'SALES_NOT_FOUND'; end if;
  select * into v_current from public.shared_customer_credit_limits
    where tenant_id=v_tenant and company_id=p_company_id and customer_id=p_customer_id;
  if coalesce(v_current.version,0) <> p_expected_version then raise exception 'SALES_CONCURRENCY_CONFLICT'; end if;
  insert into public.shared_customer_credit_limits(tenant_id,company_id,customer_id,limit_ves,updated_by)
    values(v_tenant,p_company_id,p_customer_id,p_limit_ves,p_actor_user_id)
    on conflict(tenant_id,company_id,customer_id) do update set limit_ves=excluded.limit_ves,
      version=shared_customer_credit_limits.version+1,updated_by=excluded.updated_by,updated_at=clock_timestamp()
    returning * into v_current;
  return jsonb_build_object('companyId',p_company_id,'customerId',p_customer_id,
    'limitVes',v_current.limit_ves::text,'version',v_current.version);
end $$;

create or replace function public.get_native_customer_credit_limit(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_customer_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_current public.shared_customer_credit_limits%rowtype;
begin
  v_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'sales.read');
  select * into v_current from public.shared_customer_credit_limits
    where tenant_id=v_tenant and company_id=p_company_id and customer_id=p_customer_id;
  if not found then return null; end if;
  return jsonb_build_object('companyId',p_company_id,'customerId',p_customer_id,
    'limitVes',v_current.limit_ves::text,'version',v_current.version);
end $$;

create or replace function public.confirm_native_sales_invoice_secure(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_invoice_id text,
  p_allow_negative_stock boolean default false,p_price_list_id text default null,
  p_branch_id text default null,p_device_id text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_invoice public.shared_inventory_sales_invoices%rowtype;
  v_limit numeric; v_debt numeric; v_additional numeric; v_result jsonb;
begin
  v_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'sales.confirm');
  select * into v_invoice from public.shared_inventory_sales_invoices
    where tenant_id=v_tenant and company_id=p_company_id and id=p_invoice_id for update;
  if not found then raise exception 'SALES_NOT_FOUND'; end if;
  if v_invoice.status <> 'borrador' then raise exception 'SALES_ORDER_TRANSITION_INVALID'; end if;
  if coalesce(p_allow_negative_stock,false) then
    perform public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'inventory.negative_stock.use');
  end if;
  -- Omission selects the ordinary price tier, which still requires an exact
  -- grant. A caller cannot bypass a restriction simply by omitting the tier.
  p_price_list_id := coalesce(p_price_list_id,'default');
  if length(trim(p_price_list_id)) not between 1 and 128 then raise exception 'SALES_CREDIT_INVALID'; end if;
    perform public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'sales.price_lists.use');
    if not public.organization_scoped_grant_has(p_actor_user_id,p_organization_id,p_company_id,
      'sales.price_lists.use','price_list',p_price_list_id) then raise exception 'SALES_ACCESS_DENIED'; end if;
  -- All confirmations and reversals for this customer serialize on the same row.
  perform 1 from public.shared_inventory_customers where tenant_id=v_tenant
    and company_id=p_company_id and id=v_invoice.customer_id for update;
  if not found then raise exception 'SALES_NOT_FOUND'; end if;
  select limit_ves into v_limit from public.shared_customer_credit_limits where tenant_id=v_tenant
    and company_id=p_company_id and customer_id=v_invoice.customer_id;
  if found then
    select coalesce(sum((r.original_amount-coalesce(p.paid,0))*r.debt_exchange_rate),0) into v_debt
    from public.shared_sales_receivables r
    left join lateral(select sum(x.applied_debt_amount) paid from public.shared_sales_receivable_payments x
      where x.tenant_id=r.tenant_id and x.receivable_id=r.id and not exists(
        select 1 from public.shared_sales_payment_reversals y where y.tenant_id=x.tenant_id and y.payment_id=x.id)) p on true
    where r.tenant_id=v_tenant and r.company_id=p_company_id and r.customer_id=v_invoice.customer_id and r.status<>'cancelled';
    v_additional := case when v_invoice.payment_terms='credito' then v_invoice.credit_amount*v_invoice.credit_exchange_rate else 0 end;
    if v_additional is null then raise exception 'SALES_CREDIT_INVALID'; end if;
    if v_debt+v_additional > v_limit then
      perform public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'sales.overdrawn_customer.bill');
    end if;
  end if;
  perform public.set_operational_audit_context(p_actor_user_id,p_organization_id,p_company_id,p_branch_id,p_device_id);
  update public.shared_inventory_sales_invoices set security_price_list_id=p_price_list_id
    where tenant_id=v_tenant and id=p_invoice_id;
  v_result := public.shared_inventory_sales_invoice_confirm_attributed(v_tenant,p_invoice_id,p_actor_user_id,coalesce(p_allow_negative_stock,false));
  return jsonb_build_object('invoiceId',p_invoice_id,'companyId',p_company_id,'status','confirmed','result',v_result);
end $$;

create or replace function public.reverse_native_receivable_payment(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_receivable_id text,
  p_payment_id text,p_idempotency_key text,p_reason text,p_branch_id text default null,p_device_id text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_receivable public.shared_sales_receivables%rowtype;
  v_previous public.shared_sales_payment_reversals%rowtype; v_replayed boolean := false;
begin
  v_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'sales.receivable_payments.reverse');
  if p_reason is null or length(trim(p_reason)) not between 1 and 500
    or p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 128 then raise exception 'SALES_RECEIVABLE_PAYMENT_INVALID'; end if;
  select * into v_receivable from public.shared_sales_receivables
    where tenant_id=v_tenant and company_id=p_company_id and id=p_receivable_id;
  if not found then raise exception 'SALES_NOT_FOUND'; end if;
  perform 1 from public.shared_inventory_customers where tenant_id=v_tenant
    and company_id=p_company_id and id=v_receivable.customer_id for update;
  select * into v_receivable from public.shared_sales_receivables
    where tenant_id=v_tenant and company_id=p_company_id and id=p_receivable_id for update;
  if v_receivable.status='cancelled' then raise exception 'SALES_ORDER_TRANSITION_INVALID'; end if;
  perform 1 from public.shared_sales_receivable_payments where tenant_id=v_tenant
    and receivable_id=p_receivable_id and id=p_payment_id;
  if not found then raise exception 'SALES_NOT_FOUND'; end if;
  select * into v_previous from public.shared_sales_payment_reversals
    where tenant_id=v_tenant and (idempotency_key=p_idempotency_key or payment_id=p_payment_id);
  if found then
    if v_previous.payment_id<>p_payment_id or v_previous.idempotency_key<>p_idempotency_key
      or v_previous.reason<>trim(p_reason) or v_previous.actor_id<>p_actor_user_id then raise exception 'SALES_RECEIVABLE_IDEMPOTENCY_CONFLICT'; end if;
    v_replayed := true;
  else
    perform public.set_operational_audit_context(p_actor_user_id,p_organization_id,p_company_id,p_branch_id,p_device_id);
    insert into public.shared_sales_payment_reversals(tenant_id,payment_id,idempotency_key,actor_id,reason)
      values(v_tenant,p_payment_id,p_idempotency_key,p_actor_user_id,trim(p_reason)) returning * into v_previous;
    update public.shared_sales_receivables set status='open' where tenant_id=v_tenant and id=p_receivable_id;
  end if;
  return jsonb_build_object('id',v_previous.id,'paymentId',p_payment_id,'receivableId',p_receivable_id,
    'companyId',p_company_id,'reason',v_previous.reason,'actorId',v_previous.actor_id,
    'occurredAt',v_previous.occurred_at,'replayed',v_replayed);
end $$;

revoke all on function public.set_native_customer_credit_limit(uuid,uuid,text,text,numeric,integer),
  public.get_native_customer_credit_limit(uuid,uuid,text,text),
  public.confirm_native_sales_invoice_secure(uuid,uuid,text,text,boolean,text,text,text),
  public.reverse_native_receivable_payment(uuid,uuid,text,text,text,text,text,text,text)
from public,anon,authenticated;
grant execute on function public.set_native_customer_credit_limit(uuid,uuid,text,text,numeric,integer),
  public.get_native_customer_credit_limit(uuid,uuid,text,text),
  public.confirm_native_sales_invoice_secure(uuid,uuid,text,text,boolean,text,text,text),
  public.reverse_native_receivable_payment(uuid,uuid,text,text,text,text,text,text,text)
to service_role;

-- Preserve the established RPC while excluding explicitly reversed receipts from debt.
create or replace function public.shared_sales_receivable_apply_payment(
  p_tenant_id uuid,p_receivable_id text,p_idempotency_key text,p_received_amount numeric,
  p_received_currency_code varchar,p_exchange_rate_to_ves numeric,p_rate_effective_date date,
  p_rate_source text,p_payment_method text default null,p_reference text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.shared_sales_receivables%rowtype; v_applied numeric(20,8); v_paid numeric(20,8);
  v_payment public.shared_sales_receivable_payments%rowtype;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 128
    or p_received_amount is null or p_received_amount<=0 or p_received_amount::text in ('NaN','Infinity','-Infinity')
    or p_exchange_rate_to_ves is null or p_exchange_rate_to_ves<=0 or p_exchange_rate_to_ves::text in ('NaN','Infinity','-Infinity')
    or p_received_currency_code is null or p_received_currency_code !~ '^[A-Z]{3}$'
    or p_rate_effective_date is null or p_rate_source is null or p_rate_source not in ('bcv','manual','legacy','identity')
    or (p_received_currency_code='VES' and p_exchange_rate_to_ves<>1) then raise exception 'SALES_RECEIVABLE_PAYMENT_INVALID'; end if;
  select * into r from public.shared_sales_receivables where tenant_id=p_tenant_id and id=p_receivable_id for update;
  if not found then raise exception 'SALES_NOT_FOUND'; end if;
  select * into v_payment from public.shared_sales_receivable_payments where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
  if found then
    if v_payment.receivable_id<>p_receivable_id or v_payment.received_amount<>p_received_amount
      or v_payment.received_currency_code<>p_received_currency_code or v_payment.exchange_rate_to_ves<>p_exchange_rate_to_ves
      or v_payment.rate_effective_date<>p_rate_effective_date or v_payment.rate_source<>p_rate_source
      or v_payment.payment_method is distinct from p_payment_method or v_payment.reference is distinct from p_reference
      then raise exception 'SALES_RECEIVABLE_IDEMPOTENCY_CONFLICT'; end if;
    return to_jsonb(v_payment);
  end if;
  if r.status<>'open' then raise exception 'SALES_ORDER_TRANSITION_INVALID'; end if;
  v_applied := round(p_received_amount*p_exchange_rate_to_ves/r.debt_exchange_rate,8);
  if v_applied<=0 then raise exception 'SALES_RECEIVABLE_PAYMENT_INVALID'; end if;
  select coalesce(sum(p.applied_debt_amount),0) into v_paid from public.shared_sales_receivable_payments p
    where p.tenant_id=p_tenant_id and p.receivable_id=p_receivable_id
      and not exists(select 1 from public.shared_sales_payment_reversals v where v.tenant_id=p.tenant_id and v.payment_id=p.id);
  if v_applied>r.original_amount-v_paid then raise exception 'SALES_RECEIVABLE_PAYMENT_EXCEEDS_BALANCE'; end if;
  insert into public.shared_sales_receivable_payments(tenant_id,receivable_id,idempotency_key,received_amount,received_currency_code,
    applied_debt_amount,exchange_rate_to_ves,rate_effective_date,rate_source,payment_method,reference)
    values(p_tenant_id,p_receivable_id,p_idempotency_key,p_received_amount,p_received_currency_code,
      v_applied,p_exchange_rate_to_ves,p_rate_effective_date,p_rate_source,p_payment_method,p_reference) returning * into v_payment;
  if v_paid+v_applied=r.original_amount then update public.shared_sales_receivables set status='settled' where tenant_id=p_tenant_id and id=p_receivable_id; end if;
  return to_jsonb(v_payment);
end $$;
revoke all on function public.shared_sales_receivable_apply_payment(uuid,text,text,numeric,varchar,numeric,date,text,text,text) from public,anon,authenticated;
grant execute on function public.shared_sales_receivable_apply_payment(uuid,text,text,numeric,varchar,numeric,date,text,text,text) to service_role;
