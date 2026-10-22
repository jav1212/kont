-- ADM-014: reversible server draft creation and source/permission revalidation.
begin;
set local role service_role;

do $smoke$
declare
  fixture record;
  customer public.shared_inventory_customers%rowtype;
  product public.shared_inventory_products%rowtype;
  branch jsonb;
  branch_id uuid;
  operation_id uuid := gen_random_uuid();
  payload jsonb;
  changed jsonb;
  result jsonb;
  replay jsonb;
begin
  select o.id as organization_id,m.user_id as actor_user_id,c.id as company_id,c.tenant_id
    into fixture from public.organizations o
    join public.organization_memberships m on m.organization_id=o.id and m.status='active'
    join public.organization_roles r on r.id=m.role_id and r.organization_id=o.id and r.status='active'
    join public.shared_companies c on c.organization_id=o.id and c.status='active'
   where o.status='active'
     and exists(select 1 from public.organization_role_permissions p where p.role_id=r.id and p.permission_code='branches.select_any')
     and exists(select 1 from public.organization_role_permissions p where p.role_id=r.id and p.permission_code='sales.create')
     and exists(select 1 from public.organization_role_permissions p where p.role_id=r.id and p.permission_code='branches.create')
     and exists(select 1 from public.organization_role_permissions p where p.role_id=r.id and p.permission_code='branches.select')
     and exists(select 1 from public.shared_inventory_customers u where u.tenant_id=c.tenant_id and u.company_id=c.id and u.active)
     and exists(select 1 from public.shared_inventory_products p where p.tenant_id=c.tenant_id and p.company_id=c.id and p.active
       and p.type='mercancia' and p.sale_price_mode='fixed' and p.sale_price_currency_code in ('VES','USD'))
   limit 1;
  if not found then raise exception 'No authorized ADM-014 development fixture is available'; end if;
  select * into customer from public.shared_inventory_customers
   where tenant_id=fixture.tenant_id and company_id=fixture.company_id and active limit 1;
  select * into product from public.shared_inventory_products
   where tenant_id=fixture.tenant_id and company_id=fixture.company_id and active
     and type='mercancia' and sale_price_mode='fixed'
     and sale_price_currency_code in ('VES','USD') limit 1;
  branch := public.create_native_company_branch(
    fixture.actor_user_id,fixture.organization_id,fixture.company_id,
    'adm014-'||replace(gen_random_uuid()::text,'-',''),
    'O'||substring(replace(gen_random_uuid()::text,'-','') from 1 for 8),
    'ADM-014 rollback branch');
  branch_id := (branch->>'id')::uuid;
  payload := jsonb_build_object(
    'version',1,'customerId',customer.id,'customerUpdatedAt',customer.updated_at,
    'orderDate',current_date,'currencyCode',product.sale_price_currency_code,
    'lines',jsonb_build_array(jsonb_build_object(
      'productId',product.id,'quantity','1','expectedPricingVersion',product.sale_pricing_version,
      'expectedUnitPrice',product.sale_price_value::text)));

  result := public.create_native_offline_sales_order_draft(
    fixture.actor_user_id,fixture.organization_id,fixture.company_id,branch_id,operation_id,payload);
  if result->>'draftId'<>operation_id::text or result->>'replayed'<>'false'
  then raise exception 'Offline draft creation failed'; end if;
  replay := public.create_native_offline_sales_order_draft(
    fixture.actor_user_id,fixture.organization_id,fixture.company_id,branch_id,operation_id,payload);
  if replay->>'draftId'<>operation_id::text or replay->>'replayed'<>'true'
  then raise exception 'Offline draft replay failed'; end if;
  changed := jsonb_set(payload,'{lines,0,quantity}','"2"'::jsonb);
  begin
    perform public.create_native_offline_sales_order_draft(
      fixture.actor_user_id,fixture.organization_id,fixture.company_id,branch_id,operation_id,changed);
    raise exception 'Expected offline draft idempotency conflict';
  exception when others then
    if sqlerrm not like '%SALES_OFFLINE_DRAFT_IDEMPOTENCY_CONFLICT%' then raise; end if;
  end;
  changed := jsonb_set(payload,'{lines,0,expectedUnitPrice}',to_jsonb((product.sale_price_value+1)::text));
  begin
    perform public.create_native_offline_sales_order_draft(
      fixture.actor_user_id,fixture.organization_id,fixture.company_id,branch_id,gen_random_uuid(),changed);
    raise exception 'Expected changed source price rejection';
  exception when others then
    if sqlerrm not like '%SALES_OFFLINE_DRAFT_SOURCE_CHANGED%' then raise; end if;
  end;
  changed := jsonb_set(payload,'{customerUpdatedAt}',to_jsonb((customer.updated_at+interval '1 second')));
  begin
    perform public.create_native_offline_sales_order_draft(
      fixture.actor_user_id,fixture.organization_id,fixture.company_id,branch_id,gen_random_uuid(),changed);
    raise exception 'Expected changed customer rejection';
  exception when others then
    if sqlerrm not like '%SALES_OFFLINE_DRAFT_SOURCE_CHANGED%' then raise; end if;
  end;
  begin
    perform public.create_native_offline_sales_order_draft(
      fixture.actor_user_id,fixture.organization_id,fixture.company_id,gen_random_uuid(),gen_random_uuid(),payload);
    raise exception 'Expected unknown branch rejection';
  exception when others then
    if sqlerrm not like '%SALES_OFFLINE_DRAFT_BRANCH_UNAVAILABLE%' then raise; end if;
  end;
  changed := jsonb_set(payload,'{lines}',(payload->'lines')||(payload->'lines'));
  begin
    perform public.create_native_offline_sales_order_draft(
      fixture.actor_user_id,fixture.organization_id,fixture.company_id,branch_id,gen_random_uuid(),changed);
    raise exception 'Expected duplicate line rejection';
  exception when others then
    if sqlerrm not like '%SALES_OFFLINE_DRAFT_VALIDATION_FAILED%' then raise; end if;
  end;
  begin
    perform public.create_native_offline_sales_order_draft(
      gen_random_uuid(),fixture.organization_id,fixture.company_id,branch_id,gen_random_uuid(),payload);
    raise exception 'Expected actor denial';
  exception when others then
    if sqlerrm not like '%ORGANIZATIONAL_USER_ACCESS_DENIED%' then raise; end if;
  end;
  perform set_config('kontave.adm014_operation_id',operation_id::text,true);
end;
$smoke$;

reset role;
do $audit$
begin
  if (select count(*) from public.shared_sales_order_drafts)<>1
    or (select status from public.shared_sales_order_drafts
      where id=current_setting('kontave.adm014_operation_id')::uuid)<>'draft'
    or (select jsonb_array_length(lines) from public.shared_sales_order_drafts
      where id=current_setting('kontave.adm014_operation_id')::uuid)<>1
  then raise exception 'Offline draft persistence state mismatch'; end if;
end;
$audit$;

rollback;
