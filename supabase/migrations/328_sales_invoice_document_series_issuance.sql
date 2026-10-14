-- ADM-017/018/019: issue a sales invoice and its series number in one transaction.
-- Existing confirmation RPCs remain unchanged for legacy Web callers.

create table public.shared_sales_invoice_series_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  invoice_id text not null,
  actor_user_id uuid not null,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 8 and 128),
  intent jsonb not null,
  intent_sha256 text not null check (intent_sha256 ~ '^[0-9a-f]{64}$'),
  series_id uuid not null,
  number integer not null check (number between 1 and 99999999),
  display_number text not null,
  issued_at timestamptz not null default clock_timestamp(),
  unique (organization_id, actor_user_id, idempotency_key),
  unique (tenant_id, invoice_id),
  unique (tenant_id, series_id, number),
  foreign key (tenant_id, company_id) references public.shared_companies(tenant_id, id) on delete restrict,
  foreign key (tenant_id, invoice_id) references public.shared_inventory_sales_invoices(tenant_id, id) on delete restrict,
  foreign key (series_id, tenant_id, organization_id, company_id)
    references public.shared_company_document_series(id, tenant_id, organization_id, company_id) on delete restrict
);
create index shared_sales_invoice_series_allocations_company_idx
  on public.shared_sales_invoice_series_allocations(tenant_id, company_id, issued_at desc);
create index shared_sales_invoice_series_allocations_organization_idx
  on public.shared_sales_invoice_series_allocations(organization_id, issued_at desc);
create index shared_sales_invoice_series_allocations_series_scope_idx
  on public.shared_sales_invoice_series_allocations(series_id, tenant_id, organization_id, company_id);

alter table public.shared_sales_invoice_series_allocations enable row level security;
revoke all on public.shared_sales_invoice_series_allocations from public, anon, authenticated, service_role;

create function public.prevent_sales_invoice_series_allocation_mutation()
returns trigger language plpgsql set search_path=public as $$
begin raise exception 'SALES_DOCUMENT_SERIES_ALLOCATION_IMMUTABLE'; end;
$$;
create trigger shared_sales_invoice_series_allocations_immutable
before update or delete or truncate on public.shared_sales_invoice_series_allocations
for each statement execute function public.prevent_sales_invoice_series_allocation_mutation();
revoke all on function public.prevent_sales_invoice_series_allocation_mutation() from public, anon, authenticated, service_role;

create function public.confirm_native_sales_invoice_with_document_series_secure(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text, p_invoice_id text,
  p_idempotency_key text, p_scope_kind text, p_scope_branch_id uuid,
  p_selection_kind text, p_series_id uuid,
  p_allow_negative_stock boolean default false, p_price_list_id text default null,
  p_branch_id text default null, p_device_id text default null,
  p_company_branch_id uuid default null, p_sales_register_id text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid;
  v_invoice public.shared_inventory_sales_invoices%rowtype;
  v_rule public.shared_company_document_series_selection_rules%rowtype;
  v_series public.shared_company_document_series%rowtype;
  v_existing public.shared_sales_invoice_series_allocations%rowtype;
  v_intent jsonb;
  v_hash text;
  v_selected_id uuid;
  v_display_number text;
  v_result jsonb;
begin
  v_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'sales.confirm');
  if p_invoice_id is null or length(btrim(p_invoice_id)) not between 1 and 128
    or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 8 and 128
    or p_scope_kind not in ('company','branch')
    or (p_scope_kind='company' and p_scope_branch_id is not null)
    or (p_scope_kind='branch' and (p_scope_branch_id is null or p_company_branch_id is distinct from p_scope_branch_id))
    or p_selection_kind not in ('policy','explicit')
    or (p_selection_kind='policy' and p_series_id is not null)
    or (p_selection_kind='explicit' and p_series_id is null)
    or p_allow_negative_stock is null
    or p_sales_register_id is not null and (p_company_branch_id is not null or length(btrim(p_sales_register_id)) not between 1 and 128)
    or p_price_list_id is not null and length(btrim(p_price_list_id)) not between 1 and 128
    or public.company_document_series_scope_valid(v_tenant,p_organization_id,p_company_id,p_scope_kind,p_scope_branch_id) is distinct from true
  then raise exception 'SALES_DOCUMENT_SERIES_INVALID'; end if;
  if p_company_branch_id is not null then
    perform public.assert_native_sales_branch_access(p_actor_user_id,p_organization_id,p_company_id,v_tenant,p_company_branch_id);
  end if;

  -- The key row serializes exact retries; no allocation can outlive a failed confirmation.
  v_intent := jsonb_build_object('companyId',p_company_id,'invoiceId',btrim(p_invoice_id),
    'scopeKind',p_scope_kind,'scopeBranchId',p_scope_branch_id,'selectionKind',p_selection_kind,
    'seriesId',p_series_id,'allowNegativeStock',p_allow_negative_stock,'priceListId',p_price_list_id,
    'branchId',p_branch_id,'deviceId',p_device_id,'companyBranchId',p_company_branch_id,
    'salesRegisterId',p_sales_register_id);
  v_hash := encode(extensions.digest(v_intent::text,'sha256'),'hex');
  select * into v_existing from public.shared_sales_invoice_series_allocations
    where organization_id=p_organization_id and actor_user_id=p_actor_user_id and idempotency_key=btrim(p_idempotency_key)
    for update;
  if found then
    if v_existing.tenant_id <> v_tenant or v_existing.intent_sha256 <> v_hash or v_existing.intent is distinct from v_intent
      then raise exception 'SALES_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT'; end if;
    select * into v_invoice from public.shared_inventory_sales_invoices
      where tenant_id=v_tenant and company_id=p_company_id and id=btrim(p_invoice_id) for update;
    if not found or v_invoice.status <> 'confirmada' or v_invoice.invoice_number <> v_existing.display_number
      then raise exception 'SALES_DOCUMENT_SERIES_RECONCILIATION_FAILED'; end if;
    return jsonb_build_object('invoiceId',v_existing.invoice_id,'companyId',v_existing.company_id,
      'status','confirmed','seriesId',v_existing.series_id,'displayNumber',v_existing.display_number,
      'number',v_existing.number,'replayed',true);
  end if;

  select * into v_invoice from public.shared_inventory_sales_invoices
    where tenant_id=v_tenant and company_id=p_company_id and id=btrim(p_invoice_id) for update;
  if not found then raise exception 'SALES_NOT_FOUND'; end if;
  -- A concurrent exact retry may have committed while this caller waited on the invoice lock.
  select * into v_existing from public.shared_sales_invoice_series_allocations
    where organization_id=p_organization_id and actor_user_id=p_actor_user_id and idempotency_key=btrim(p_idempotency_key)
    for update;
  if found then
    if v_existing.tenant_id <> v_tenant or v_existing.intent_sha256 <> v_hash or v_existing.intent is distinct from v_intent
      then raise exception 'SALES_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT'; end if;
    if v_invoice.status <> 'confirmada' or v_invoice.invoice_number <> v_existing.display_number
      then raise exception 'SALES_DOCUMENT_SERIES_RECONCILIATION_FAILED'; end if;
    return jsonb_build_object('invoiceId',v_existing.invoice_id,'companyId',v_existing.company_id,
      'status','confirmed','seriesId',v_existing.series_id,'displayNumber',v_existing.display_number,
      'number',v_existing.number,'replayed',true);
  end if;
  if v_invoice.status <> 'borrador' then raise exception 'SALES_ORDER_TRANSITION_INVALID'; end if;
  if exists(select 1 from public.shared_sales_invoice_series_allocations a where a.tenant_id=v_tenant and a.invoice_id=v_invoice.id)
    then raise exception 'SALES_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT'; end if;

  if p_selection_kind='policy' then
    select * into v_rule from public.shared_company_document_series_selection_rules
      where tenant_id=v_tenant and organization_id=p_organization_id and company_id=p_company_id
        and scope_kind=p_scope_kind and branch_id is not distinct from p_scope_branch_id
        and document_type='sales_invoice' for share;
    if not found or v_rule.policy='explicit_series_required' or v_rule.default_series_id is null
      then raise exception 'SALES_DOCUMENT_SERIES_SELECTION_INVALID'; end if;
    v_selected_id := v_rule.default_series_id;
  else
    v_selected_id := p_series_id;
  end if;

  select * into v_series from public.shared_company_document_series
    where id=v_selected_id and tenant_id=v_tenant and organization_id=p_organization_id
      and company_id=p_company_id and document_type='sales_invoice' and active=true for update;
  if not found then raise exception 'SALES_DOCUMENT_SERIES_SELECTION_INVALID'; end if;
  if p_selection_kind='explicit' and (v_series.scope_kind <> p_scope_kind or v_series.branch_id is distinct from p_scope_branch_id)
    then raise exception 'SALES_DOCUMENT_SERIES_SELECTION_INVALID'; end if;
  if p_selection_kind='policy' and (
    (v_rule.policy='company_default' and (v_series.scope_kind <> 'company' or v_series.branch_id is not null))
    or (v_rule.policy='branch_default' and (v_series.scope_kind <> 'branch' or v_series.branch_id is distinct from p_scope_branch_id))
  ) then raise exception 'SALES_DOCUMENT_SERIES_SELECTION_INVALID'; end if;
  if v_series.next_number > v_series.maximum_number
    then raise exception 'SALES_DOCUMENT_SERIES_EXHAUSTED'; end if;
  v_display_number := coalesce(v_series.prefix,'') || lpad(v_series.next_number::text,8,'0');
  if exists(select 1 from public.shared_inventory_sales_invoices i where i.tenant_id=v_tenant
    and i.company_id=p_company_id and i.invoice_number=v_display_number and i.id<>v_invoice.id)
    then raise exception 'SALES_DOCUMENT_SERIES_NUMBER_CONFLICT'; end if;

  update public.shared_inventory_sales_invoices set invoice_number=v_display_number
    where tenant_id=v_tenant and company_id=p_company_id and id=v_invoice.id;
  if v_series.next_number = v_series.maximum_number then
    -- The final number may be issued; mark the series inactive instead of exceeding its bound.
    update public.shared_company_document_series set active=false,version=version+1,
      updated_by=p_actor_user_id,updated_at=clock_timestamp() where id=v_series.id;
  else
    update public.shared_company_document_series set next_number=next_number+1,version=version+1,
      updated_by=p_actor_user_id,updated_at=clock_timestamp() where id=v_series.id;
  end if;

  if p_company_branch_id is not null then
    v_result := public.confirm_native_sales_invoice_branch_secure(p_actor_user_id,p_organization_id,p_company_id,
      v_invoice.id,p_company_branch_id,p_allow_negative_stock,p_price_list_id,p_branch_id,p_device_id);
  elsif p_sales_register_id is not null then
    v_result := public.confirm_web_sales_invoice_secure(p_actor_user_id,p_organization_id,p_company_id,
      v_invoice.id,p_allow_negative_stock,p_price_list_id,p_branch_id,p_device_id,p_sales_register_id);
  else
    v_result := public.confirm_native_sales_invoice_secure(p_actor_user_id,p_organization_id,p_company_id,
      v_invoice.id,p_allow_negative_stock,p_price_list_id,p_branch_id,p_device_id);
  end if;
  if v_result->>'status' <> 'confirmed' then raise exception 'SALES_DOCUMENT_SERIES_RECONCILIATION_FAILED'; end if;
  begin
    insert into public.shared_sales_invoice_series_allocations(tenant_id,organization_id,company_id,invoice_id,
      actor_user_id,idempotency_key,intent,intent_sha256,series_id,number,display_number)
      values(v_tenant,p_organization_id,p_company_id,v_invoice.id,p_actor_user_id,btrim(p_idempotency_key),
        v_intent,v_hash,v_series.id,v_series.next_number,v_display_number);
  exception when unique_violation then raise exception 'SALES_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT'; end;
  return jsonb_build_object('invoiceId',v_invoice.id,'companyId',p_company_id,'status','confirmed',
    'seriesId',v_series.id,'displayNumber',v_display_number,'number',v_series.next_number,'replayed',false);
exception when unique_violation then
  raise exception 'SALES_DOCUMENT_SERIES_NUMBER_CONFLICT';
end;
$$;

revoke all on function public.confirm_native_sales_invoice_with_document_series_secure(uuid,uuid,text,text,text,text,uuid,text,uuid,boolean,text,text,text,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.confirm_native_sales_invoice_with_document_series_secure(uuid,uuid,text,text,text,text,uuid,text,uuid,boolean,text,text,text,uuid,text)
  to service_role;
