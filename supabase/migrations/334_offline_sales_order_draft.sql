-- ADM-014: server-side persistence for a branch-scoped offline sales-order draft.
-- A draft has no invoice number, payment, fiscal issuance, stock reservation or movement.
-- Actor identity must be derived by a trusted authenticated gateway before this service RPC.

create table public.shared_sales_order_drafts (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id text not null,
  branch_id uuid not null,
  customer_id text not null,
  customer_updated_at timestamptz not null,
  order_date date not null,
  currency_code text not null check (currency_code in ('VES','USD')),
  lines jsonb not null check (jsonb_typeof(lines)='array' and jsonb_array_length(lines) between 1 and 50),
  intent jsonb not null,
  intent_sha256 text not null check (intent_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'draft' check (status='draft'),
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index shared_sales_order_drafts_org_company_idx
  on public.shared_sales_order_drafts(organization_id,company_id,created_at desc);
create index shared_sales_order_drafts_tenant_company_idx
  on public.shared_sales_order_drafts(tenant_id,company_id,created_at desc);
alter table public.shared_sales_order_drafts enable row level security;
revoke all on public.shared_sales_order_drafts from public,anon,authenticated,service_role;

create function public.create_native_offline_sales_order_draft(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,
  p_branch_id uuid,p_operation_id uuid,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid;
  v_company public.shared_companies%rowtype;
  v_existing public.shared_sales_order_drafts%rowtype;
  v_customer public.shared_inventory_customers%rowtype;
  v_product public.shared_inventory_products%rowtype;
  v_customer_id text;
  v_customer_updated_at timestamptz;
  v_order_date date;
  v_currency text;
  v_line jsonb;
  v_product_id text;
  v_quantity numeric(14,4);
  v_expected_price numeric(14,4);
  v_expected_pricing_version integer;
  v_seen text[] := array[]::text[];
  v_lines jsonb := '[]'::jsonb;
  v_hash text;
begin
  v_tenant := public.assert_user_security_access(
    p_actor_user_id,p_organization_id,p_company_id,'sales.create');
  select * into v_company from public.shared_companies
   where tenant_id=v_tenant and organization_id=p_organization_id
     and id=p_company_id and status='active' for share;
  if not found then raise exception 'SALES_OFFLINE_DRAFT_AUTHORIZATION_REVOKED'; end if;
  begin
    perform public.assert_native_sales_branch_access(
      p_actor_user_id,p_organization_id,p_company_id,v_tenant,p_branch_id);
  exception when others then
    if sqlerrm in ('SALES_BRANCH_NOT_FOUND','SALES_BRANCH_ACCESS_DENIED')
    then raise exception 'SALES_OFFLINE_DRAFT_BRANCH_UNAVAILABLE'; end if;
    raise;
  end;
  if p_operation_id is null or p_payload is null
    or jsonb_typeof(p_payload)<>'object'
    or octet_length(p_payload::text)>65536
  then raise exception 'SALES_OFFLINE_DRAFT_VALIDATION_FAILED'; end if;
  v_hash := encode(extensions.digest(p_payload::text,'sha256'),'hex');
  select * into v_existing from public.shared_sales_order_drafts where id=p_operation_id;
  if found then
    if v_existing.tenant_id is distinct from v_tenant
      or v_existing.organization_id is distinct from p_organization_id
      or v_existing.company_id is distinct from p_company_id
      or v_existing.branch_id is distinct from p_branch_id
      or v_existing.created_by is distinct from p_actor_user_id
      or v_existing.intent_sha256 is distinct from v_hash
      or v_existing.intent is distinct from p_payload
    then raise exception 'SALES_OFFLINE_DRAFT_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('draftId',v_existing.id,'replayed',true);
  end if;
  if (select count(*) from jsonb_object_keys(p_payload))<>6
    or exists(select 1 from jsonb_object_keys(p_payload) k
      where k not in ('version','customerId','customerUpdatedAt','orderDate','currencyCode','lines'))
    or jsonb_typeof(p_payload->'version')<>'number' or p_payload->>'version'<>'1'
    or jsonb_typeof(p_payload->'customerId')<>'string'
    or jsonb_typeof(p_payload->'customerUpdatedAt')<>'string'
    or jsonb_typeof(p_payload->'orderDate')<>'string'
    or jsonb_typeof(p_payload->'currencyCode')<>'string'
    or jsonb_typeof(p_payload->'lines')<>'array'
  then raise exception 'SALES_OFFLINE_DRAFT_VALIDATION_FAILED'; end if;
  if jsonb_array_length(p_payload->'lines') not between 1 and 50
    then raise exception 'SALES_OFFLINE_DRAFT_VALIDATION_FAILED'; end if;
  v_customer_id := p_payload->>'customerId';
  v_currency := p_payload->>'currencyCode';
  if length(btrim(v_customer_id)) not between 1 and 128
    or v_currency not in ('VES','USD')
    or p_payload->>'orderDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or p_payload->>'customerUpdatedAt' !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
  then raise exception 'SALES_OFFLINE_DRAFT_VALIDATION_FAILED'; end if;
  begin
    v_order_date := (p_payload->>'orderDate')::date;
    v_customer_updated_at := (p_payload->>'customerUpdatedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'SALES_OFFLINE_DRAFT_VALIDATION_FAILED';
  end;
  select * into v_customer from public.shared_inventory_customers
   where tenant_id=v_tenant and company_id=p_company_id and id=v_customer_id for share;
  if not found or not v_customer.active
    or v_customer.updated_at is distinct from v_customer_updated_at
  then raise exception 'SALES_OFFLINE_DRAFT_SOURCE_CHANGED'; end if;

  for v_line in select value from jsonb_array_elements(p_payload->'lines')
    order by value->>'productId'
  loop
    if jsonb_typeof(v_line)<>'object'
      or (select count(*) from jsonb_object_keys(v_line))<>4
      or exists(select 1 from jsonb_object_keys(v_line) k
        where k not in ('productId','quantity','expectedPricingVersion','expectedUnitPrice'))
      or jsonb_typeof(v_line->'productId')<>'string'
      or jsonb_typeof(v_line->'quantity')<>'string'
      or jsonb_typeof(v_line->'expectedPricingVersion')<>'number'
      or jsonb_typeof(v_line->'expectedUnitPrice')<>'string'
    then raise exception 'SALES_OFFLINE_DRAFT_VALIDATION_FAILED'; end if;
    v_product_id := v_line->>'productId';
    if length(btrim(v_product_id)) not between 1 and 128
      or v_product_id=any(v_seen)
      or v_line->>'quantity' !~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,4})?$'
      or v_line->>'expectedUnitPrice' !~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,4})?$'
      or v_line->>'expectedPricingVersion' !~ '^[1-9][0-9]{0,9}$'
    then raise exception 'SALES_OFFLINE_DRAFT_VALIDATION_FAILED'; end if;
    begin
      v_quantity := (v_line->>'quantity')::numeric(14,4);
      v_expected_price := (v_line->>'expectedUnitPrice')::numeric(14,4);
      v_expected_pricing_version := (v_line->>'expectedPricingVersion')::integer;
    exception when numeric_value_out_of_range then
      raise exception 'SALES_OFFLINE_DRAFT_VALIDATION_FAILED';
    end;
    if v_quantity<=0 or v_expected_price<=0
    then raise exception 'SALES_OFFLINE_DRAFT_VALIDATION_FAILED'; end if;
    v_seen := array_append(v_seen,v_product_id);
    select * into v_product from public.shared_inventory_products
     where tenant_id=v_tenant and company_id=p_company_id and id=v_product_id for share;
    if not found or not v_product.active or v_product.type<>'mercancia'
      or v_product.sale_price_mode<>'fixed'
      or v_product.sale_price_currency_code<>v_currency
      or v_product.sale_pricing_version<>v_expected_pricing_version
      or v_product.sale_price_value is distinct from v_expected_price
    then raise exception 'SALES_OFFLINE_DRAFT_SOURCE_CHANGED'; end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'productId',v_product.id,'productName',v_product.name,
      'quantity',v_quantity::text,'unit',v_product.measure_unit,
      'unitPrice',v_product.sale_price_value::text,
      'currencyCode',v_currency,'pricingVersion',v_product.sale_pricing_version));
  end loop;

  insert into public.shared_sales_order_drafts(
    id,tenant_id,organization_id,company_id,branch_id,customer_id,
    customer_updated_at,order_date,currency_code,lines,intent,intent_sha256,created_by)
  values(p_operation_id,v_tenant,p_organization_id,p_company_id,p_branch_id,v_customer_id,
    v_customer_updated_at,v_order_date,v_currency,v_lines,p_payload,v_hash,p_actor_user_id)
  on conflict (id) do nothing;
  if found then return jsonb_build_object('draftId',p_operation_id,'replayed',false); end if;
  select * into v_existing from public.shared_sales_order_drafts where id=p_operation_id;
  if not found or v_existing.tenant_id is distinct from v_tenant
    or v_existing.organization_id is distinct from p_organization_id
    or v_existing.company_id is distinct from p_company_id
    or v_existing.branch_id is distinct from p_branch_id
    or v_existing.created_by is distinct from p_actor_user_id
    or v_existing.intent_sha256 is distinct from v_hash
    or v_existing.intent is distinct from p_payload
  then raise exception 'SALES_OFFLINE_DRAFT_IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('draftId',v_existing.id,'replayed',true);
end;
$$;
revoke all on function public.create_native_offline_sales_order_draft(uuid,uuid,text,uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.create_native_offline_sales_order_draft(uuid,uuid,text,uuid,uuid,jsonb)
  to service_role;
