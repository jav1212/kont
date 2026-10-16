-- ADM-012 correction: the connected development schema still uses the legacy
-- invoice-confirmation RPC and does not have the staged 291/294 security helpers.
-- Keep the additive branch feature aligned with the deployed contracts.
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
  if v_invoice.status <> 'borrador' then raise exception 'SALES_ORDER_TRANSITION_INVALID'; end if;

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

create or replace function public.get_native_sales_branch_consolidation(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_from date,p_to date,p_branch_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid;
  v_branch_tenant uuid;
  v_select_any boolean;
  v_rows jsonb;
  v_attributed_count bigint;
  v_unattributed_count bigint;
begin
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>365
    or coalesce(cardinality(p_branch_ids),0)>100
    or p_branch_ids is not null and (exists(select 1 from unnest(p_branch_ids) ids(branch_id) where branch_id is null)
      or cardinality(p_branch_ids)<>(select count(distinct ids.branch_id) from unnest(p_branch_ids) ids(branch_id))) then
    raise exception 'SALES_BRANCH_CONSOLIDATION_INVALID';
  end if;
  select o.legacy_tenant_id into v_tenant
  from public.organizations o
  join public.shared_companies c on c.organization_id=o.id and c.id=p_company_id and c.tenant_id=o.legacy_tenant_id
  join public.organization_memberships m on m.organization_id=o.id and m.user_id=p_actor_user_id and m.status='active'
  join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.status='active'
  join public.organization_role_permissions rp on rp.role_id=r.id and rp.permission_code='sales.read'
  where o.id=p_organization_id and o.status='active';
  if not found or v_tenant is null then raise exception 'SALES_BRANCH_CONSOLIDATION_ACCESS_DENIED'; end if;
  begin v_branch_tenant := public.assert_company_administration_access(p_organization_id,p_actor_user_id,'branches.consolidate');
  exception when others then
    if sqlerrm in ('COMPANY_ACCESS_DENIED','COMPANY_ORGANIZATION_NOT_READY') then raise exception 'SALES_BRANCH_CONSOLIDATION_ACCESS_DENIED'; end if;
    raise;
  end;
  if v_tenant is distinct from v_branch_tenant then raise exception 'SALES_BRANCH_CONSOLIDATION_ACCESS_DENIED'; end if;
  v_select_any := public.company_branch_user_can_select_any(p_actor_user_id,p_organization_id);
  if p_branch_ids is not null and exists(
    select 1 from unnest(p_branch_ids) requested(branch_id)
    where not exists(select 1 from public.shared_company_branches b where b.id=requested.branch_id
      and b.tenant_id=v_tenant and b.organization_id=p_organization_id and b.company_id=p_company_id
      and (v_select_any or exists(select 1 from public.shared_company_branch_memberships m where m.tenant_id=b.tenant_id
        and m.organization_id=b.organization_id and m.company_id=b.company_id and m.branch_id=b.id
        and m.user_id=p_actor_user_id and m.status='active')))
  ) then raise exception 'SALES_BRANCH_CONSOLIDATION_ACCESS_DENIED'; end if;

  with accessible_branches as (
    select b.id,b.code,b.name from public.shared_company_branches b
    where b.tenant_id=v_tenant and b.organization_id=p_organization_id and b.company_id=p_company_id
      and (p_branch_ids is null or b.id=any(p_branch_ids))
      and (v_select_any or exists(select 1 from public.shared_company_branch_memberships m where m.tenant_id=b.tenant_id
        and m.organization_id=b.organization_id and m.company_id=b.company_id and m.branch_id=b.id
        and m.user_id=p_actor_user_id and m.status='active'))
  ), filtered_invoices as (
    select i.*,b.code as branch_code,b.name as branch_name from public.shared_inventory_sales_invoices i
    join accessible_branches b on b.id=i.branch_id
    where i.tenant_id=v_tenant and i.company_id=p_company_id and i.status='confirmada'
      and i.invoice_date between p_from and p_to
  ), grouped as (
    select branch_id,branch_code,branch_name,document_type,currency_code,count(*)::bigint document_count,
      sum(subtotal)::text subtotal,sum(vat_amount)::text vat_amount,sum(total)::text total
    from filtered_invoices group by branch_id,branch_code,branch_name,document_type,currency_code
  )
  select coalesce(jsonb_agg(jsonb_build_object('branchId',branch_id,'branchCode',branch_code,'branchName',branch_name,
    'documentType',document_type,'currencyCode',currency_code,'documentCount',document_count,
    'subtotal',subtotal,'vatAmount',vat_amount,'total',total)
    order by branch_code,document_type,currency_code),'[]'::jsonb) into v_rows from grouped;

  select count(*) into v_attributed_count from public.shared_inventory_sales_invoices i
  where i.tenant_id=v_tenant and i.company_id=p_company_id and i.status='confirmada'
    and i.invoice_date between p_from and p_to and i.branch_id is not null
    and (p_branch_ids is null or i.branch_id=any(p_branch_ids))
    and exists(select 1 from public.shared_company_branches b where b.id=i.branch_id and b.tenant_id=i.tenant_id
      and b.company_id=i.company_id and b.organization_id=p_organization_id
      and (v_select_any or exists(select 1 from public.shared_company_branch_memberships m where m.tenant_id=b.tenant_id
        and m.organization_id=b.organization_id and m.company_id=b.company_id and m.branch_id=b.id
        and m.user_id=p_actor_user_id and m.status='active')));
  if v_select_any then
    select count(*) into v_unattributed_count from public.shared_inventory_sales_invoices i
      where i.tenant_id=v_tenant and i.company_id=p_company_id and i.status='confirmada'
        and i.invoice_date between p_from and p_to and i.branch_id is null;
  end if;
  return jsonb_build_object('period',jsonb_build_object('from',p_from,'to',p_to),'rows',v_rows,
    'coverage',jsonb_build_object('attributedConfirmedDocumentCount',v_attributed_count,
      'unattributedConfirmedDocumentCount',case when v_select_any then v_unattributed_count else null end,
      'includesUnattributed',v_select_any),'generatedAt',clock_timestamp());
end $$;
revoke all on function public.get_native_sales_branch_consolidation(uuid,uuid,text,date,date,uuid[]) from public,anon,authenticated;
grant execute on function public.get_native_sales_branch_consolidation(uuid,uuid,text,date,date,uuid[]) to service_role;
