create or replace function public.confirm_web_sales_invoice_secure(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_invoice_id text,
  p_allow_negative_stock boolean default false,p_price_list_id text default null,
  p_branch_id text default null,p_device_id text default null,p_sales_register_id text default null
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
  -- Legacy Web uses the ordinary tier until its price-list category is configured.
  -- A configured category stays restricted after its final exact grant is revoked.
  p_price_list_id := coalesce(p_price_list_id,'default');
  if length(trim(p_price_list_id)) not between 1 and 128 then raise exception 'SALES_CREDIT_INVALID'; end if;
  if p_price_list_id <> 'default' or exists(
    select 1 from public.organization_scoped_grant_policies g
    join public.organization_memberships m on m.id=g.membership_id
    where m.organization_id=p_organization_id and m.user_id=p_actor_user_id
      and g.permission_code='sales.price_lists.use' and g.target_kind='price_list'
      and g.company_id in ('',p_company_id)
  ) then
    perform public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'sales.price_lists.use');
    if not public.organization_scoped_grant_has(p_actor_user_id,p_organization_id,p_company_id,
      'sales.price_lists.use','price_list',p_price_list_id) then raise exception 'SALES_ACCESS_DENIED'; end if;
  end if;
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
  v_result := public.shared_inventory_sales_invoice_confirm_with_register(v_tenant,p_invoice_id,p_actor_user_id,coalesce(p_allow_negative_stock,false),p_sales_register_id);
  return jsonb_build_object('invoiceId',p_invoice_id,'companyId',p_company_id,'status','confirmed','result',v_result);
end $$;

-- Keep native callers on the same transactional policy and credit-limit boundary.
create or replace function public.confirm_native_sales_invoice_secure(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_invoice_id text,
  p_allow_negative_stock boolean default false,p_price_list_id text default null,
  p_branch_id text default null,p_device_id text default null
) returns jsonb language sql security definer set search_path=public as $$
  select public.confirm_web_sales_invoice_secure(p_actor_user_id,p_organization_id,p_company_id,
    p_invoice_id,p_allow_negative_stock,p_price_list_id,p_branch_id,p_device_id,null)
$$;
revoke all on function public.confirm_web_sales_invoice_secure(uuid,uuid,text,text,boolean,text,text,text,text),
  public.confirm_native_sales_invoice_secure(uuid,uuid,text,text,boolean,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.confirm_web_sales_invoice_secure(uuid,uuid,text,text,boolean,text,text,text,text),
  public.confirm_native_sales_invoice_secure(uuid,uuid,text,text,boolean,text,text,text) to service_role;
