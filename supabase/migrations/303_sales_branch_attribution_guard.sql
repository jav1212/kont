-- Protect the additive branch column from legacy table-wide UPDATE grants.
-- Existing invoice write access remains intact; branch attribution must pass
-- through the trusted, membership-checked confirmation RPC.
create or replace function public.guard_sales_invoice_branch_attribution()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_actor uuid;
  v_org uuid;
begin
  if tg_op='INSERT' and new.branch_id is null then return new; end if;
  if tg_op='UPDATE' and new.branch_id is not distinct from old.branch_id then return new; end if;
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception 'SALES_BRANCH_ASSIGNMENT_RPC_REQUIRED';
  end if;
  v_actor := nullif(current_setting('kontave.sales.branch_actor_user_id',true),'')::uuid;
  if new.branch_id is null or current_setting('kontave.sales.branch_id',true) is distinct from new.branch_id::text or v_actor is null then
    raise exception 'SALES_BRANCH_ASSIGNMENT_RPC_REQUIRED';
  end if;
  select c.organization_id into v_org from public.shared_companies c
  where c.tenant_id=new.tenant_id and c.id=new.company_id;
  if v_org is null then raise exception 'SALES_BRANCH_NOT_FOUND'; end if;
  perform public.assert_native_sales_branch_access(v_actor,v_org,new.company_id,new.tenant_id,new.branch_id);
  return new;
end $$;
revoke all on function public.guard_sales_invoice_branch_attribution() from public,anon,authenticated,service_role;
create trigger shared_sales_invoice_branch_attribution_guard
before insert or update of branch_id on public.shared_inventory_sales_invoices
for each row execute function public.guard_sales_invoice_branch_attribution();

create or replace function public.confirm_native_sales_invoice_branch_secure(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_invoice_id text,p_company_branch_id uuid,
  p_allow_negative_stock boolean default false,p_price_list_id text default null,
  p_branch_id text default null,p_device_id text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid;
  v_invoice public.shared_inventory_sales_invoices%rowtype;
  v_result jsonb;
  v_secure_rpc regprocedure;
begin
  select o.legacy_tenant_id into v_tenant
  from public.organizations o
  join public.shared_companies c on c.organization_id=o.id and c.id=p_company_id and c.tenant_id=o.legacy_tenant_id
  join public.organization_memberships m on m.organization_id=o.id and m.user_id=p_actor_user_id and m.status='active'
  join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.status='active'
  join public.organization_role_permissions rp on rp.role_id=r.id and rp.permission_code='sales.confirm'
  where o.id=p_organization_id and o.status='active' and c.status='active'
  for share of o,c,m,r,rp;
  if not found or v_tenant is null then raise exception 'SALES_ACCESS_DENIED'; end if;
  if coalesce(p_allow_negative_stock,false) and not exists(
    select 1 from public.organization_memberships m
    join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.status='active'
    join public.organization_role_permissions rp on rp.role_id=r.id and rp.permission_code='inventory.negative_stock.use'
    where m.organization_id=p_organization_id and m.user_id=p_actor_user_id and m.status='active'
  ) then raise exception 'SALES_ACCESS_DENIED'; end if;
  perform public.assert_native_sales_branch_access(p_actor_user_id,p_organization_id,p_company_id,v_tenant,p_company_branch_id);
  select * into v_invoice from public.shared_inventory_sales_invoices where tenant_id=v_tenant
    and company_id=p_company_id and id=p_invoice_id for update;
  if not found then raise exception 'SALES_NOT_FOUND'; end if;
  if v_invoice.status<>'borrador' then raise exception 'SALES_ORDER_TRANSITION_INVALID'; end if;
  perform set_config('kontave.sales.branch_actor_user_id',p_actor_user_id::text,true);
  perform set_config('kontave.sales.branch_id',p_company_branch_id::text,true);
  update public.shared_inventory_sales_invoices set branch_id=p_company_branch_id
  where tenant_id=v_tenant and company_id=p_company_id and id=p_invoice_id;
  v_secure_rpc := to_regprocedure('public.confirm_native_sales_invoice_secure(uuid,uuid,text,text,boolean,text,text,text)');
  if v_secure_rpc is not null then
    execute 'select public.confirm_native_sales_invoice_secure($1,$2,$3,$4,$5,$6,$7,$8)'
      into v_result using p_actor_user_id,p_organization_id,p_company_id,p_invoice_id,
        coalesce(p_allow_negative_stock,false),p_price_list_id,
        coalesce(p_branch_id,p_company_branch_id::text),p_device_id;
  else
    if p_price_list_id is not null then raise exception 'SALES_ACCESS_DENIED'; end if;
    v_result := public.shared_inventory_sales_invoice_confirm_attributed(
      v_tenant,p_invoice_id,p_actor_user_id,coalesce(p_allow_negative_stock,false));
    v_result := jsonb_build_object('invoiceId',p_invoice_id,'companyId',p_company_id,'status','confirmed','result',v_result);
  end if;
  return v_result;
end $$;
revoke all on function public.confirm_native_sales_invoice_branch_secure(uuid,uuid,text,text,uuid,boolean,text,text,text) from public,anon,authenticated;
grant execute on function public.confirm_native_sales_invoice_branch_secure(uuid,uuid,text,text,uuid,boolean,text,text,text) to service_role;
