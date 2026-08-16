-- Native billing preserves the current manually reviewed payment-request workflow.
alter table public.payment_requests
  add column if not exists receipt_storage_key text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('billing-payment-receipts','billing-payment-receipts',false,8000000,array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.list_organization_manual_payment_requests(p_organization_id uuid)
returns table(
  id uuid,organization_id uuid,plan_id uuid,billing_cycle text,amount_usd numeric,
  discount_usd numeric,payment_method text,receipt_storage_key text,status text,
  notes text,submitted_at timestamptz,reviewed_at timestamptz
) language sql stable security definer set search_path=public as $$
  select request.id,p_organization_id,request.plan_id,request.billing_cycle,request.amount_usd,
    coalesce(request.discount_usd,0),request.payment_method,request.receipt_storage_key,
    request.status,request.notes,request.submitted_at,request.reviewed_at
  from public.organizations organization
  join public.payment_requests request on request.tenant_id=organization.legacy_tenant_id
  where organization.id=p_organization_id
  order by request.submitted_at desc,request.id
$$;

create or replace function public.submit_organization_manual_payment_request(
  p_organization_id uuid,p_plan_id uuid,p_billing_cycle text,p_payment_method text,
  p_receipt_storage_key text default null
) returns jsonb language plpgsql security definer set search_path=public,storage as $$
declare
  v_tenant_id uuid;v_price numeric(10,2);v_discount numeric(10,2);v_remaining numeric(10,2);
  v_request public.payment_requests;v_credit record;v_take numeric(10,2);v_new_remaining numeric(10,2);
  v_period_end date;
begin
  if p_billing_cycle not in('monthly','quarterly','annual') or p_payment_method not in('transfer','cash') then
    raise exception 'BILLING_PAYMENT_REQUEST_INVALID';
  end if;
  select legacy_tenant_id into v_tenant_id from public.organizations where id=p_organization_id;
  if v_tenant_id is null then raise exception 'BILLING_ACCOUNT_NOT_FOUND';end if;
  select case p_billing_cycle when 'monthly' then price_monthly_usd when 'quarterly' then price_quarterly_usd else price_annual_usd end
    into v_price from public.plans where id=p_plan_id and is_active=true and not is_contact_only;
  if not found then
    if exists(select 1 from public.plans where id=p_plan_id and is_active=true and is_contact_only)then raise exception 'BILLING_PLAN_CONTACT_REQUIRED';end if;
    raise exception 'BILLING_PLAN_NOT_FOUND';
  end if;
  if p_receipt_storage_key is not null then
    if p_receipt_storage_key not like p_organization_id::text||'/%' or not exists(
      select 1 from storage.objects where bucket_id='billing-payment-receipts' and name=p_receipt_storage_key
    )then raise exception 'BILLING_RECEIPT_INVALID';end if;
  end if;

  select least(v_price,coalesce(sum(remaining_usd),0)) into v_discount
  from public.referral_credits where referrer_tenant_id=v_tenant_id and status<>'consumed';
  v_discount:=round(coalesce(v_discount,0),2);v_remaining:=round(v_price-v_discount,2);

  insert into public.payment_requests(tenant_id,plan_id,billing_cycle,amount_usd,discount_usd,payment_method,receipt_url,receipt_storage_key,status,reviewed_at)
  values(v_tenant_id,p_plan_id,p_billing_cycle,v_remaining,v_discount,case when v_remaining=0 and v_discount>0 then 'credit' else p_payment_method end,null,p_receipt_storage_key,case when v_remaining=0 and v_discount>0 then 'approved' else 'pending' end,case when v_remaining=0 and v_discount>0 then now() else null end)
  returning * into v_request;

  v_remaining:=v_discount;
  for v_credit in select * from public.referral_credits where referrer_tenant_id=v_tenant_id and status<>'consumed' order by created_at,id for update loop
    exit when v_remaining<=0;v_take:=least(v_credit.remaining_usd,v_remaining);
    if v_take<=0 then continue;end if;
    v_new_remaining:=round(v_credit.remaining_usd-v_take,2);
    insert into public.referral_redemptions(credit_id,payment_request_id,amount_usd)values(v_credit.id,v_request.id,v_take);
    update public.referral_credits set remaining_usd=v_new_remaining,status=case when v_new_remaining<=0 then 'consumed' else 'partial' end where id=v_credit.id;
    v_remaining:=round(v_remaining-v_take,2);
  end loop;

  if v_request.status='approved' then
    v_period_end:=case p_billing_cycle when 'monthly' then current_date+interval '1 month' when 'quarterly' then current_date+interval '3 months' else current_date+interval '1 year' end;
    update public.tenants set status='active',plan_id=p_plan_id,billing_cycle=p_billing_cycle,last_payment_at=now(),current_period_start=current_date,current_period_end=v_period_end,updated_at=now()where id=v_tenant_id;
  end if;
  return jsonb_build_object('id',v_request.id,'organization_id',p_organization_id,'plan_id',v_request.plan_id,'billing_cycle',v_request.billing_cycle,'amount_usd',v_request.amount_usd,'discount_usd',v_request.discount_usd,'payment_method',v_request.payment_method,'receipt_storage_key',v_request.receipt_storage_key,'status',v_request.status,'notes',v_request.notes,'submitted_at',v_request.submitted_at,'reviewed_at',v_request.reviewed_at);
end $$;

revoke all on function public.list_organization_manual_payment_requests(uuid),public.submit_organization_manual_payment_request(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.list_organization_manual_payment_requests(uuid),public.submit_organization_manual_payment_request(uuid,uuid,text,text,text) to service_role;
