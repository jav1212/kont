-- Keep native sales numbering, fiscal finalization, and IVA recognition in the
-- same Postgres transaction. Existing Web confirmation RPCs remain untouched.
begin;

create table public.shared_sales_series_tax_issuance_commands (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 8 and 128),
  request_snapshot jsonb not null check (jsonb_typeof(request_snapshot) = 'object'),
  result_snapshot jsonb,
  created_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, actor_user_id, idempotency_key)
);

alter table public.shared_sales_series_tax_issuance_commands enable row level security;
revoke all on public.shared_sales_series_tax_issuance_commands from public, anon, authenticated, service_role;

create or replace function public.confirm_native_sales_invoice_with_document_series_and_tax_fact_secure(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text, p_invoice_id text,
  p_idempotency_key text, p_scope_kind text, p_scope_branch_id uuid,
  p_selection_kind text, p_series_id uuid, p_allow_negative_stock boolean default false,
  p_price_list_id text default null, p_branch_id text default null, p_device_id text default null,
  p_company_branch_id uuid default null, p_sales_register_id text default null,
  p_tenant_id uuid default null, p_source_updated_at timestamptz default null,
  p_fiscal_document_snapshot jsonb default null, p_issue_date date default null,
  p_issued_at timestamptz default null, p_fact_snapshot jsonb default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_invoice public.shared_inventory_sales_invoices%rowtype;
  v_command public.shared_sales_series_tax_issuance_commands%rowtype;
  v_issuance jsonb;
  v_document jsonb;
  v_fact_result jsonb;
  v_result jsonb;
  v_request jsonb;
  v_final_snapshot jsonb;
  v_tax_total numeric;
begin
  v_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'sales.confirm');
  if v_tenant is distinct from p_tenant_id or p_actor_user_id is null
    or p_source_updated_at is null or p_fiscal_document_snapshot is null
    or jsonb_typeof(p_fiscal_document_snapshot)<>'object' or p_issue_date is null or p_issued_at is null
    or p_fact_snapshot is null or jsonb_typeof(p_fact_snapshot)<>'object'
    or p_fiscal_document_snapshot->>'status'<>'draft'
    or p_fiscal_document_snapshot->>'direction'<>'issued'
    or p_fiscal_document_snapshot->>'type'<>'invoice'
    or p_fiscal_document_snapshot->>'companyId' is distinct from p_company_id
    or p_fact_snapshot->>'direction'<>'sale'
    or p_fact_snapshot->'scope'->>'tenantId' is distinct from v_tenant::text
    or p_fact_snapshot->'scope'->>'organizationId' is distinct from p_organization_id::text
    or p_fact_snapshot->'scope'->>'companyId' is distinct from p_company_id
    or p_fact_snapshot->'source'->>'kind'<>'fiscal_document'
    or p_fact_snapshot->'source'->>'id' is distinct from p_fiscal_document_snapshot->>'id'
  then raise exception 'SALES_FISCAL_PREPARATION_INVALID'; end if;

  v_request := jsonb_build_object(
    'invoiceId',p_invoice_id,'sourceUpdatedAt',p_source_updated_at,'scopeKind',p_scope_kind,
    'scopeBranchId',p_scope_branch_id,'selectionKind',p_selection_kind,'seriesId',p_series_id,
    'allowNegativeStock',p_allow_negative_stock,'priceListId',p_price_list_id,'branchId',p_branch_id,
    'deviceId',p_device_id,'companyBranchId',p_company_branch_id,'salesRegisterId',p_sales_register_id,
    'fiscalDocument',p_fiscal_document_snapshot,'issueDate',p_issue_date,'issuedAt',p_issued_at,
    'fact',p_fact_snapshot);
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_actor_user_id::text||':'||btrim(p_idempotency_key),0));
  select * into v_command from public.shared_sales_series_tax_issuance_commands
    where organization_id=p_organization_id and actor_user_id=p_actor_user_id and idempotency_key=btrim(p_idempotency_key) for update;
  if found then
    if v_command.tenant_id is distinct from v_tenant or v_command.request_snapshot is distinct from v_request then
      raise exception 'SALES_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT';
    end if;
    v_result := v_command.result_snapshot;
    v_result := jsonb_set(v_result,'{replayed}','true'::jsonb,true);
    v_result := jsonb_set(v_result,'{issuance,replayed}','true'::jsonb,true);
    return v_result;
  end if;

  select * into v_invoice from public.shared_inventory_sales_invoices
    where tenant_id=v_tenant and company_id=p_company_id and id=p_invoice_id for update;
  if not found then raise exception 'SALES_NOT_FOUND'; end if;
  if v_invoice.status<>'draft' or v_invoice.updated_at is distinct from p_source_updated_at
    or v_invoice.invoice_date is distinct from p_issue_date then
    raise exception 'SALES_CONCURRENCY_CONFLICT';
  end if;
  if p_fiscal_document_snapshot->'documentCurrency'->>'code' is distinct from v_invoice.currency_code then
    raise exception 'SALES_FISCAL_PREPARATION_INVALID';
  end if;
  if coalesce((p_fiscal_document_snapshot->'totals'->'payableAmount'->>'minorAmount')::numeric, -1)
       <> round(v_invoice.total * 100)
     or coalesce((p_fiscal_document_snapshot->'totals'->'netAmount'->>'minorAmount')::numeric, -1)
       <> round(v_invoice.subtotal * 100)
  then raise exception 'SALES_FISCAL_PREPARATION_INVALID'; end if;
  select coalesce(sum((item->'amount'->>'minorAmount')::numeric),0) into v_tax_total
    from jsonb_array_elements(coalesce(p_fiscal_document_snapshot->'taxDeterminations','[]'::jsonb)) item
    where upper(item->>'taxCode')='IVA';
  if v_tax_total <> round(v_invoice.vat_amount * 100) then raise exception 'SALES_FISCAL_PREPARATION_INVALID'; end if;

  insert into public.shared_sales_series_tax_issuance_commands(tenant_id,organization_id,actor_user_id,idempotency_key,request_snapshot)
    values(v_tenant,p_organization_id,p_actor_user_id,btrim(p_idempotency_key),v_request);

  v_issuance := public.confirm_native_sales_invoice_with_document_series_secure(
    p_actor_user_id,p_organization_id,p_company_id,p_invoice_id,p_idempotency_key,
    p_scope_kind,p_scope_branch_id,p_selection_kind,p_series_id,p_allow_negative_stock,
    p_price_list_id,p_branch_id,p_device_id,p_company_branch_id,p_sales_register_id);
  v_final_snapshot := jsonb_set(p_fiscal_document_snapshot,'{number}',to_jsonb(v_issuance->>'displayNumber'),true);
  v_final_snapshot := jsonb_set(v_final_snapshot,'{status}','"issued"'::jsonb,true);
  v_final_snapshot := jsonb_set(v_final_snapshot,'{issuedAt}',to_jsonb(p_issued_at),true);
  v_final_snapshot := jsonb_set(v_final_snapshot,'{issueDate}',to_jsonb(p_issue_date::text),true);

  insert into public.shared_fiscal_documents(tenant_id,id,organization_id,company_id,source_kind,source_id,
    idempotency_key,document_status,document_snapshot,created_by,created_at,updated_at)
  values(v_tenant,p_fiscal_document_snapshot->>'id',p_organization_id,p_company_id,
    'legacy_sales_invoice',p_invoice_id,'prepare_legacy_sales_invoice:'||p_invoice_id,
    'issued',v_final_snapshot,p_actor_user_id,p_issued_at,p_issued_at)
  on conflict (tenant_id,company_id,source_kind,source_id) do update set
    document_status='issued',document_snapshot=excluded.document_snapshot,updated_at=excluded.updated_at
  where public.shared_fiscal_documents.document_status='draft'
    and public.shared_fiscal_documents.id=excluded.id
    and public.shared_fiscal_documents.document_snapshot=p_fiscal_document_snapshot;
  if not found then raise exception 'FISCAL_DOCUMENT_SOURCE_CONFLICT'; end if;

  insert into public.shared_fiscal_document_events(tenant_id,document_id,event_type,idempotency_key,payload,occurred_at)
  values(v_tenant,p_fiscal_document_snapshot->>'id','fiscal_document.native_series_issued',btrim(p_idempotency_key),
    jsonb_build_object('invoiceId',p_invoice_id,'seriesId',v_issuance->>'seriesId','number',v_issuance->>'displayNumber','actorId',p_actor_user_id),p_issued_at)
  on conflict (tenant_id,document_id,event_type,idempotency_key) do nothing;

  v_fact_result := public.shared_tax_reporting_fact_append(v_tenant,p_organization_id,p_company_id,
    p_fact_snapshot->>'id',p_fact_snapshot,p_actor_user_id,p_fact_snapshot->>'id');
  v_result := jsonb_build_object('issuance',v_issuance,'fiscalDocument',v_final_snapshot,
    'taxFact',v_fact_result->'fact_snapshot','replayed',false);
  update public.shared_sales_series_tax_issuance_commands set result_snapshot=v_result
    where organization_id=p_organization_id and actor_user_id=p_actor_user_id and idempotency_key=btrim(p_idempotency_key);
  return v_result;
end;
$$;

revoke all on function public.confirm_native_sales_invoice_with_document_series_and_tax_fact_secure(uuid,uuid,text,text,text,text,uuid,text,uuid,boolean,text,text,text,uuid,text,uuid,timestamptz,jsonb,date,timestamptz,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.confirm_native_sales_invoice_with_document_series_and_tax_fact_secure(uuid,uuid,text,text,text,text,uuid,text,uuid,boolean,text,text,text,uuid,text,uuid,timestamptz,jsonb,date,timestamptz,jsonb) to service_role;
commit;
