-- CXP-002/007-012 (corte 2): credit-side documents, credit applications with
-- compensating reversals, adjustments, installments (giros) and opening
-- balances. Balances are always derived from non-reversed applications; nothing
-- is deleted. Purchase source triggers stop treating a purchase's own
-- withholdings as foreign applications so a credit purchase can be unconfirmed
-- and corrected, and they reactivate those facts when it is confirmed again.

alter table public.shared_payables_documents drop constraint if exists shared_payables_documents_kind_check;
alter table public.shared_payables_documents add constraint shared_payables_documents_kind_check
  check (kind in ('invoice','debit_note','manual_document','credit_note','positive_adjustment','negative_adjustment','installment','opening_balance'));
alter table public.shared_payables_documents
  add column if not exists side text generated always as (case when kind in ('credit_note','negative_adjustment') then 'credit' else 'debit' end) stored,
  add column if not exists parent_document_id text,
  add column if not exists reason text,
  add column if not exists evidence text,
  add column if not exists created_by uuid references auth.users(id) on delete restrict;
alter table public.shared_payables_documents drop constraint if exists shared_payables_documents_parent_fk;
alter table public.shared_payables_documents add constraint shared_payables_documents_parent_fk
  foreign key (tenant_id,parent_document_id) references public.shared_payables_documents(tenant_id,id) on delete restrict;
create index if not exists shared_payables_documents_parent_idx on public.shared_payables_documents(tenant_id,parent_document_id) where parent_document_id is not null;

alter table public.shared_payables_applications
  add column if not exists credit_document_id text,
  add column if not exists actor_id uuid references auth.users(id) on delete restrict,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references auth.users(id) on delete restrict,
  add column if not exists reversal_reason text;
alter table public.shared_payables_applications drop constraint if exists shared_payables_applications_credit_fk;
alter table public.shared_payables_applications add constraint shared_payables_applications_credit_fk
  foreign key (tenant_id,credit_document_id) references public.shared_payables_documents(tenant_id,id) on delete restrict;
alter table public.shared_payables_applications drop constraint if exists shared_payables_applications_reversal_check;
alter table public.shared_payables_applications add constraint shared_payables_applications_reversal_check
  check (reversed_at is null or nullif(btrim(reversal_reason),'') is not null);
create index if not exists shared_payables_applications_document_idx on public.shared_payables_applications(tenant_id,document_id);
create index if not exists shared_payables_applications_credit_idx on public.shared_payables_applications(tenant_id,credit_document_id) where credit_document_id is not null;

alter table public.shared_payables_installment_plans
  add column if not exists status text not null default 'active',
  add column if not exists transferred_amount numeric(28,8),
  add column if not exists version integer not null default 1,
  add column if not exists undone_at timestamptz,
  add column if not exists undone_by uuid references auth.users(id) on delete restrict,
  add column if not exists undo_reason text;
alter table public.shared_payables_installment_plans drop constraint if exists shared_payables_installment_plans_status_check;
alter table public.shared_payables_installment_plans add constraint shared_payables_installment_plans_status_check
  check (status in ('active','undone') and version>0 and (status<>'undone' or nullif(btrim(undo_reason),'') is not null));
create index if not exists shared_payables_installment_plans_document_idx on public.shared_payables_installment_plans(tenant_id,document_id);

-- Open amount in the document's own currency: debt still owed for debit
-- documents, credit still available for credit documents.
create or replace function public.shared_payables_open_amount(p_tenant uuid,p_document text)
returns numeric language sql stable security definer set search_path=public as $$
  select case when d.side='credit'
    then d.principal-coalesce((select sum(a.amount) from public.shared_payables_applications a where a.tenant_id=d.tenant_id and a.credit_document_id=d.id and a.reversed_at is null),0)
    else d.principal-coalesce((select sum(a.amount) from public.shared_payables_applications a where a.tenant_id=d.tenant_id and a.document_id=d.id and a.reversed_at is null),0) end
  from public.shared_payables_documents d where d.tenant_id=p_tenant and d.id=p_document
$$;

-- Recomputes open/settled after its applications change and bumps the version
-- so stale expectedVersion commands fail. Voided documents are never reopened here.
create or replace function public.shared_payables_refresh_document(p_tenant uuid,p_document text)
returns integer language plpgsql security definer set search_path=public as $$
declare v_version integer;
begin
  update public.shared_payables_documents d
    set status=case when public.shared_payables_open_amount(d.tenant_id,d.id)<=0 then 'settled' else 'open' end,version=d.version+1,updated_at=now()
    where d.tenant_id=p_tenant and d.id=p_document and d.status in ('open','settled')
    returning d.version into v_version;
  return v_version;
end $$;

-- D7: payables facts reuse the company's accounting periods; no parallel closing exists.
create or replace function public.shared_payables_assert_open_period(p_tenant uuid,p_company text,p_date date)
returns void language plpgsql stable security definer set search_path=public as $$
begin
  if p_date is null then raise exception 'PAYABLES_INVALID'; end if;
  if exists(select 1 from public.shared_accounting_periods p where p.tenant_id=p_tenant and p.company_id=p_company and p.status='closed' and p_date between p.start_date and p.end_date) then
    raise exception 'PAYABLES_PERIOD_CLOSED';
  end if;
end $$;

-- Undoes the payable facts owned by one purchase document. Facts created by other
-- sources (payments, manual credit applications, installments, reservations)
-- still block, because removing them would rewrite someone else's history.
create or replace function public.shared_payables_release_purchase_source(p_tenant uuid,p_source text)
returns void language plpgsql security definer set search_path=public as $$
declare v_id text:='purchase:'||p_source; v_target text;
begin
  if exists(select 1 from public.shared_payables_applications a where a.tenant_id=p_tenant and a.reversed_at is null
      and (a.document_id=v_id or a.credit_document_id=v_id) and not (a.source_type='purchase_invoice' and a.source_id=p_source))
    or public.shared_payables_reserved_amount(p_tenant,v_id)>0 then
    raise exception 'PAYABLES_HAS_APPLICATIONS';
  end if;
  for v_target in
    update public.shared_payables_applications a set reversed_at=now(),reversal_reason='Documento de compra desconfirmado o eliminado'
    where a.tenant_id=p_tenant and a.source_type='purchase_invoice' and a.source_id=p_source and a.reversed_at is null
    returning a.document_id
  loop
    if v_target<>v_id then perform public.shared_payables_refresh_document(p_tenant,v_target); end if;
  end loop;
  update public.shared_payables_documents set status='voided',version=version+1,updated_at=now()
    where tenant_id=p_tenant and source_type='purchase_invoice' and source_id=p_source and status in ('open','settled');
end $$;

create or replace function public.shared_payables_guard_purchase_invoice_unconfirm()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.status='confirmada' and new.status<>'confirmada' then perform public.shared_payables_release_purchase_source(old.tenant_id,old.id); end if;
  return new;
end $$;

create or replace function public.shared_payables_guard_purchase_invoice_delete()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.shared_payables_release_purchase_source(old.tenant_id,old.id);
  return old;
end $$;

create or replace function public.shared_payables_register_purchase_invoice()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_supplier public.shared_inventory_suppliers%rowtype; v_currency text; v_rate numeric; v_principal numeric; v_gross numeric; v_component_total numeric; v_dynamic_taxes numeric; v_reported_total numeric; v_due date; v_debt text; v_kind text; v_id text:='purchase:'||new.id; v_org uuid; v_parent public.shared_payables_documents%rowtype; v_apply numeric;
begin
  if new.status<>'confirmada' or old.status='confirmada' then return new; end if;
  v_debt:=coalesce(nullif(new.document_type,''),'factura');
  if new.payment_terms is null and v_debt not in ('nota_debito','nota_credito') then return new; end if;
  if new.payment_terms='contado' and new.paid_at_registration and v_debt='factura' then return new; end if;
  select * into v_supplier from public.shared_inventory_suppliers s where s.tenant_id=new.tenant_id and s.id=new.supplier_id and s.company_id=new.company_id;
  select c.organization_id into v_org from public.shared_companies c where c.tenant_id=new.tenant_id and c.id=new.company_id;
  v_currency:=coalesce(new.currency_code,'VES');
  v_rate:=case when v_currency='VES' then 1 else coalesce(
    (select nullif(r->>'vesPerUnit','')::numeric from jsonb_array_elements(coalesce(new.exchange_rates,'[]'::jsonb)) r where upper(r->>'currencyCode')=v_currency limit 1),
    new.dollar_rate,
    (select max(i.dollar_rate) from public.shared_inventory_purchase_invoice_items i where i.tenant_id=new.tenant_id and i.invoice_id=new.id)) end;
  if v_rate is null or v_rate<=0 then raise exception 'PAYABLES_INVALID_RATE'; end if;
  -- Rebuild the gross from independent components. Quick header-only invoices
  -- do not run the line recalculator, so their stored total may omit `taxes`.
  select coalesce(sum(abs(coalesce(nullif(t->>'monto','')::numeric,0))),0)
  into v_dynamic_taxes from jsonb_array_elements(coalesce(new.taxes,'[]'::jsonb)) t;
  v_component_total:=abs(new.subtotal)+abs(new.vat_amount);
  v_reported_total:=abs(new.total);
  if abs(v_reported_total-v_component_total)>0.02
     and abs(v_reported_total-(v_component_total+v_dynamic_taxes))>0.02 then
    raise exception 'PAYABLES_PURCHASE_TOTAL_MISMATCH';
  end if;
  -- Dynamic taxes are included by the current recalculator; add them here
  -- exactly once from their own stored source, then add separately stored IGTF.
  v_gross:=v_component_total+v_dynamic_taxes+abs(coalesce(new.financial_tax_amount,0));
  -- USD source amounts are translated to the gross VES total using the invoice rate.
  v_principal:=abs(case when v_currency='VES' then v_gross else round(v_gross/v_rate,2) end);
  if v_principal<=0 then raise exception 'PAYABLES_INVALID_PRINCIPAL'; end if;
  v_kind:=case v_debt when 'nota_debito' then 'debit_note' when 'nota_credito' then 'credit_note' else 'invoice' end;
  v_due:=case when v_kind='credit_note' then new.invoice_date else coalesce(new.due_date,(select d.due_at from public.shared_payables_documents d where d.tenant_id=new.tenant_id and d.source_type='purchase_invoice' and d.source_id=new.affected_invoice_id),new.invoice_date+coalesce(new.credit_days,v_supplier.default_credit_days,0)) end;
  insert into public.shared_payables_documents(tenant_id,id,organization_id,company_id,supplier_id,source_type,source_id,kind,document_number,concept,issued_at,due_at,currency,principal,rate_amount,rate_base_currency,rate_value,rate_source,rate_effective_date,rate_policy_version,rate_rounding,parent_document_id)
  values(new.tenant_id,v_id,v_org,new.company_id,new.supplier_id,'purchase_invoice',new.id,v_kind,new.invoice_number,coalesce(new.notes,''),new.invoice_date,v_due,v_currency,v_principal,v_gross,'VES',v_rate,case when v_currency='VES' then 'identity' else coalesce((select r->>'source' from jsonb_array_elements(coalesce(new.exchange_rates,'[]'::jsonb)) r where upper(r->>'currencyCode')=v_currency limit 1),'purchase_invoice_snapshot') end,coalesce((select nullif(r->>'effectiveDate','')::date from jsonb_array_elements(coalesce(new.exchange_rates,'[]'::jsonb)) r where upper(r->>'currencyCode')=v_currency limit 1),new.invoice_date),'legacy_purchase_v1','half_up',
    (select d.id from public.shared_payables_documents d where d.tenant_id=new.tenant_id and d.id='purchase:'||new.affected_invoice_id and v_kind in ('debit_note','credit_note')))
  on conflict(tenant_id,company_id,source_type,source_id) do update set status='open',document_number=excluded.document_number,concept=excluded.concept,issued_at=excluded.issued_at,due_at=excluded.due_at,currency=excluded.currency,principal=excluded.principal,rate_amount=excluded.rate_amount,rate_value=excluded.rate_value,rate_source=excluded.rate_source,rate_effective_date=excluded.rate_effective_date,rate_policy_version=excluded.rate_policy_version,version=shared_payables_documents.version+1,updated_at=now()
  where shared_payables_documents.status='voided' and not exists(select 1 from public.shared_payables_applications a where a.tenant_id=new.tenant_id and a.reversed_at is null and (a.document_id=shared_payables_documents.id or a.credit_document_id=shared_payables_documents.id));
  if v_kind<>'credit_note' then
    if coalesce(new.vat_retention_amount,0)+coalesce(new.income_tax_amount,0)>v_gross then raise exception 'PAYABLES_INVALID_RETENTION'; end if;
    if coalesce(new.vat_retention_amount,0)>0 then
      insert into public.shared_payables_applications(tenant_id,id,organization_id,company_id,document_id,kind,amount,source_type,source_id,occurred_at)
      values(new.tenant_id,'purchase-retention:'||new.id||':vat',v_org,new.company_id,v_id,'withholding_vat',case when v_currency='VES' then new.vat_retention_amount else round(new.vat_retention_amount/v_rate,2) end,'purchase_invoice',new.id,new.invoice_date)
      on conflict(tenant_id,source_type,source_id,kind) do update set amount=excluded.amount,occurred_at=excluded.occurred_at,reversed_at=null,reversed_by=null,reversal_reason=null
      where shared_payables_applications.reversed_at is not null;
    end if;
    if coalesce(new.income_tax_amount,0)>0 then
      insert into public.shared_payables_applications(tenant_id,id,organization_id,company_id,document_id,kind,amount,source_type,source_id,occurred_at)
      values(new.tenant_id,'purchase-retention:'||new.id||':islr',v_org,new.company_id,v_id,'withholding_islr',case when v_currency='VES' then new.income_tax_amount else round(new.income_tax_amount/v_rate,2) end,'purchase_invoice',new.id,new.invoice_date)
      on conflict(tenant_id,source_type,source_id,kind) do update set amount=excluded.amount,occurred_at=excluded.occurred_at,reversed_at=null,reversed_by=null,reversal_reason=null
      where shared_payables_applications.reversed_at is not null;
    end if;
  else
    -- A fiscal credit note is applied to the invoice it corrects up to that
    -- invoice's unreserved balance; any remainder stays available on the credit.
    select * into v_parent from public.shared_payables_documents d where d.tenant_id=new.tenant_id and d.id='purchase:'||coalesce(new.affected_invoice_id,'')
      and d.company_id=new.company_id and d.supplier_id=new.supplier_id and d.currency=v_currency and d.side='debit' and d.status='open' for update;
    if found then
      v_apply:=least(v_principal,public.shared_payables_open_amount(new.tenant_id,v_parent.id)-public.shared_payables_reserved_amount(new.tenant_id,v_parent.id));
      if v_apply>0 then
        insert into public.shared_payables_applications(tenant_id,id,organization_id,company_id,document_id,credit_document_id,kind,amount,source_type,source_id,occurred_at)
        values(new.tenant_id,'purchase-credit:'||new.id,v_org,new.company_id,v_parent.id,v_id,'credit_note',v_apply,'purchase_invoice',new.id,new.invoice_date)
        on conflict(tenant_id,source_type,source_id,kind) do update set document_id=excluded.document_id,credit_document_id=excluded.credit_document_id,amount=excluded.amount,occurred_at=excluded.occurred_at,reversed_at=null,reversed_by=null,reversal_reason=null
        where shared_payables_applications.reversed_at is not null;
        perform public.shared_payables_refresh_document(new.tenant_id,v_parent.id);
      end if;
    end if;
  end if;
  if exists(select 1 from public.shared_payables_applications a where a.tenant_id=new.tenant_id and a.reversed_at is null and (a.document_id=v_id or a.credit_document_id=v_id)) then
    perform public.shared_payables_refresh_document(new.tenant_id,v_id);
  end if;
  return new;
end $$;

create or replace function public.shared_payables_execute_command(p_scope jsonb,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid; v_company text:=p_scope->>'companyId'; v_org uuid:=(p_scope->>'organizationId')::uuid;
  v_actor uuid:=(p_scope->>'actorId')::uuid; v_kind text:=p_command->>'kind'; v_permission text; v_key text:=p_command->>'idempotencyKey';
  v_hash text:=md5(p_command::text); v_receipt public.shared_payables_command_receipts%rowtype;
  v_document public.shared_payables_documents%rowtype; v_credit public.shared_payables_documents%rowtype;
  v_application public.shared_payables_applications%rowtype; v_plan public.shared_payables_installment_plans%rowtype;
  v_response jsonb; v_versions jsonb:='{}'::jsonb; v_ids jsonb:='[]'::jsonb; v_item jsonb; v_index bigint; v_count integer;
  v_amount numeric; v_total numeric:=0; v_open numeric; v_doc_kind text; v_source_type text; v_source_id text;
  v_issued date; v_due date; v_parent text; v_today date:=(now() at time zone 'America/Caracas')::date;
begin
  v_tenant:=public.assert_user_security_access(v_actor,v_org,v_company,'payables.read');
  v_permission:=case v_kind
    when 'create_manual_document' then 'payables.create' when 'import_opening_document' then 'payables.create'
    when 'change_due_date' then 'payables.adjust' when 'create_adjustment' then 'payables.adjust'
    when 'apply_credit' then 'payables.adjust' when 'reverse_credit_application' then 'payables.adjust'
    when 'create_installment_plan' then 'payables.adjust' when 'undo_installment_plan' then 'payables.adjust' else null end;
  if v_permission is null then raise exception 'PAYABLES_INVALID'; end if;
  -- The permission is checked before a stored receipt can be replayed.
  perform public.assert_user_security_access(v_actor,v_org,v_company,v_permission);
  if v_key is null or length(btrim(v_key)) not between 1 and 200 then raise exception 'PAYABLES_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||v_company||':'||v_key,0));
  select * into v_receipt from public.shared_payables_command_receipts
    where tenant_id=v_tenant and company_id=v_company and idempotency_key=v_key for update;
  if found then
    if v_receipt.payload_hash<>v_hash then raise exception 'PAYABLES_IDEMPOTENCY_CONFLICT'; end if;
    return v_receipt.response || jsonb_build_object('replayed',true);
  end if;

  if v_kind in ('create_manual_document','import_opening_document','create_adjustment') then
    v_issued:=(p_command->>'issuedAt')::date;
    v_amount:=(p_command->>'principal')::numeric;
    if v_kind='create_adjustment' then
      if coalesce(p_command->>'direction','') not in ('positive','negative') or coalesce(length(btrim(p_command->>'reason')),0)=0 then raise exception 'PAYABLES_INVALID'; end if;
      v_doc_kind:=(p_command->>'direction')||'_adjustment'; v_source_type:='adjustment'; v_source_id:=p_command->>'documentId';
      v_due:=case when p_command->>'direction'='negative' then v_issued else (p_command->>'dueAt')::date end;
      v_parent:=nullif(p_command->>'parentDocumentId','');
    elsif v_kind='import_opening_document' then
      if coalesce(length(btrim(p_command->>'documentNumber')),0)=0 or coalesce(length(btrim(p_command->>'evidence')),0)=0 then raise exception 'PAYABLES_INVALID'; end if;
      v_doc_kind:='opening_balance'; v_source_type:='opening'; v_source_id:=(p_command->>'supplierId')||':'||btrim(p_command->>'documentNumber');
      v_due:=(p_command->>'dueAt')::date;
    else
      v_doc_kind:='manual_document'; v_source_type:='manual'; v_source_id:=p_command->>'documentId';
      v_due:=(p_command->>'dueAt')::date;
    end if;
    if coalesce(length(btrim(p_command->>'documentId')),0)=0 or v_issued is null or v_due is null or v_due<v_issued
      or v_amount is null or v_amount<=0 or v_amount<>round(v_amount,2)
      or coalesce(p_command->>'currency','') !~ '^[A-Z]{3}$' or coalesce(length(btrim(p_command->>'concept')),0)=0
      or coalesce((p_command->'rateSnapshot'->>'rate')::numeric,0)<=0
      or (p_command->>'currency'='VES' and (p_command->'rateSnapshot'->>'rate')::numeric<>1) then
      raise exception 'PAYABLES_INVALID';
    end if;
    -- Opening balances document history before go-live and carry no accounting effect.
    if v_kind<>'import_opening_document' then perform public.shared_payables_assert_open_period(v_tenant,v_company,v_issued); end if;
    if not exists(select 1 from public.shared_inventory_suppliers where tenant_id=v_tenant and company_id=v_company and id=p_command->>'supplierId' and active) then raise exception 'PAYABLES_NOT_FOUND'; end if;
    if v_parent is not null then
      select * into v_document from public.shared_payables_documents where tenant_id=v_tenant and company_id=v_company and id=v_parent;
      if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
      if v_document.supplier_id<>p_command->>'supplierId' then raise exception 'PAYABLES_INVALID'; end if;
      if v_document.currency<>p_command->>'currency' then raise exception 'PAYABLES_CURRENCY_MISMATCH'; end if;
    end if;
    begin
      insert into public.shared_payables_documents(tenant_id,id,organization_id,company_id,supplier_id,source_type,source_id,kind,document_number,concept,issued_at,due_at,currency,principal,rate_amount,rate_base_currency,rate_value,rate_source,rate_effective_date,rate_policy_version,rate_rounding,parent_document_id,reason,evidence,created_by)
      values(v_tenant,p_command->>'documentId',v_org,v_company,p_command->>'supplierId',v_source_type,v_source_id,v_doc_kind,btrim(coalesce(p_command->>'documentNumber','')),p_command->>'concept',v_issued,v_due,p_command->>'currency',v_amount,(p_command->'rateSnapshot'->>'amount')::numeric,'VES',(p_command->'rateSnapshot'->>'rate')::numeric,p_command->'rateSnapshot'->>'source',(p_command->'rateSnapshot'->>'effectiveDate')::date,p_command->'rateSnapshot'->>'policyVersion','half_up',v_parent,nullif(btrim(p_command->>'reason'),''),nullif(btrim(p_command->>'evidence'),''),v_actor);
    exception when unique_violation then raise exception 'PAYABLES_SOURCE_ALREADY_REGISTERED';
    end;
    v_response:=jsonb_build_object('commandId',p_command->>'documentId','affectedIds',jsonb_build_array(p_command->>'documentId'),'versions',jsonb_build_object(p_command->>'documentId',1));

  elsif v_kind='change_due_date' then
    select * into v_document from public.shared_payables_documents where tenant_id=v_tenant and company_id=v_company and id=p_command->>'documentId' for update;
    if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
    if v_document.version<>(p_command->>'expectedVersion')::integer then raise exception 'PAYABLES_VERSION_CONFLICT'; end if;
    if v_document.status<>'open' or v_document.side<>'debit' then raise exception 'PAYABLES_INVALID'; end if;
    if (p_command->>'dueAt')::date<v_document.issued_at or coalesce(length(btrim(p_command->>'reason')),0)=0 then raise exception 'PAYABLES_INVALID'; end if;
    insert into public.shared_payables_due_date_changes(tenant_id,id,document_id,previous_due_at,due_at,reason,actor_id)
    values(v_tenant,p_command->>'changeId',v_document.id,v_document.due_at,(p_command->>'dueAt')::date,p_command->>'reason',v_actor);
    update public.shared_payables_documents set due_at=(p_command->>'dueAt')::date,version=version+1,updated_at=now() where tenant_id=v_tenant and id=v_document.id;
    v_response:=jsonb_build_object('commandId',p_command->>'changeId','affectedIds',jsonb_build_array(v_document.id,p_command->>'changeId'),'versions',jsonb_build_object(v_document.id,v_document.version+1));

  elsif v_kind='apply_credit' then
    if jsonb_typeof(p_command->'allocations') is distinct from 'array' or jsonb_array_length(p_command->'allocations') not between 1 and 50
      or (select count(distinct a->>'documentId') from jsonb_array_elements(p_command->'allocations') a)<>jsonb_array_length(p_command->'allocations') then
      raise exception 'PAYABLES_INVALID';
    end if;
    -- Lock the credit and every target in id order so concurrent applications cannot deadlock or overspend.
    perform 1 from public.shared_payables_documents d where d.tenant_id=v_tenant and d.company_id=v_company
      and (d.id=p_command->>'creditDocumentId' or d.id in (select a->>'documentId' from jsonb_array_elements(p_command->'allocations') a))
      order by d.id for update;
    select * into v_credit from public.shared_payables_documents where tenant_id=v_tenant and company_id=v_company and id=p_command->>'creditDocumentId';
    if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
    if v_credit.side<>'credit' or v_credit.status<>'open' then raise exception 'PAYABLES_INVALID'; end if;
    v_issued:=(p_command->>'occurredAt')::date;
    if v_issued is null or v_issued<v_credit.issued_at then raise exception 'PAYABLES_INVALID'; end if;
    perform public.shared_payables_assert_open_period(v_tenant,v_company,v_issued);
    v_open:=public.shared_payables_open_amount(v_tenant,v_credit.id);
    for v_item in select a from jsonb_array_elements(p_command->'allocations') a loop
      select * into v_document from public.shared_payables_documents where tenant_id=v_tenant and company_id=v_company and id=v_item->>'documentId';
      if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
      if v_document.side<>'debit' or v_document.status<>'open' or v_document.supplier_id<>v_credit.supplier_id then raise exception 'PAYABLES_INVALID'; end if;
      if v_document.currency<>v_credit.currency then raise exception 'PAYABLES_CURRENCY_MISMATCH'; end if;
      v_amount:=(v_item->>'amount')::numeric;
      if v_amount is null or v_amount<=0 or v_amount<>round(v_amount,2) or coalesce(length(btrim(v_item->>'applicationId')),0)=0 then raise exception 'PAYABLES_INVALID'; end if;
      if v_amount>public.shared_payables_open_amount(v_tenant,v_document.id)-public.shared_payables_reserved_amount(v_tenant,v_document.id) then raise exception 'PAYABLES_EXCEEDS_BALANCE'; end if;
      v_total:=v_total+v_amount;
      begin
        insert into public.shared_payables_applications(tenant_id,id,organization_id,company_id,document_id,credit_document_id,kind,amount,source_type,source_id,occurred_at,actor_id)
        values(v_tenant,v_item->>'applicationId',v_org,v_company,v_document.id,v_credit.id,case when v_credit.kind='credit_note' then 'credit_note' else 'negative_adjustment' end,v_amount,'payables_command',v_item->>'applicationId',v_issued,v_actor);
      exception when unique_violation then raise exception 'PAYABLES_INVALID';
      end;
      v_versions:=v_versions||jsonb_build_object(v_document.id,public.shared_payables_refresh_document(v_tenant,v_document.id));
      v_ids:=v_ids||jsonb_build_array(v_item->>'applicationId');
    end loop;
    if v_total>v_open then raise exception 'PAYABLES_EXCEEDS_BALANCE'; end if;
    v_versions:=v_versions||jsonb_build_object(v_credit.id,public.shared_payables_refresh_document(v_tenant,v_credit.id));
    v_response:=jsonb_build_object('commandId',v_credit.id,'affectedIds',v_ids,'versions',v_versions);

  elsif v_kind='reverse_credit_application' then
    if coalesce(length(btrim(p_command->>'reason')),0)=0 then raise exception 'PAYABLES_INVALID'; end if;
    select * into v_application from public.shared_payables_applications where tenant_id=v_tenant and company_id=v_company and id=p_command->>'applicationId';
    if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
    -- Fiscal credit-note applications follow their purchase document; only manual applications are reversible here.
    if v_application.credit_document_id is null or v_application.source_type<>'payables_command' then raise exception 'PAYABLES_INVALID'; end if;
    perform 1 from public.shared_payables_documents d where d.tenant_id=v_tenant and d.id in (v_application.document_id,v_application.credit_document_id) order by d.id for update;
    select * into v_application from public.shared_payables_applications where tenant_id=v_tenant and id=v_application.id for update;
    if v_application.reversed_at is not null then raise exception 'PAYABLES_INVALID'; end if;
    perform public.shared_payables_assert_open_period(v_tenant,v_company,v_today);
    update public.shared_payables_applications set reversed_at=now(),reversed_by=v_actor,reversal_reason=btrim(p_command->>'reason') where tenant_id=v_tenant and id=v_application.id;
    v_versions:=jsonb_build_object(v_application.document_id,public.shared_payables_refresh_document(v_tenant,v_application.document_id))
      ||jsonb_build_object(v_application.credit_document_id,public.shared_payables_refresh_document(v_tenant,v_application.credit_document_id));
    v_response:=jsonb_build_object('commandId',v_application.id,'affectedIds',jsonb_build_array(v_application.id,v_application.document_id,v_application.credit_document_id),'versions',v_versions);

  elsif v_kind='create_installment_plan' then
    select * into v_document from public.shared_payables_documents where tenant_id=v_tenant and company_id=v_company and id=p_command->>'documentId' for update;
    if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
    if v_document.version<>(p_command->>'expectedVersion')::integer then raise exception 'PAYABLES_VERSION_CONFLICT'; end if;
    if v_document.side<>'debit' or v_document.status<>'open' or v_document.kind='installment' or coalesce(length(btrim(p_command->>'planId')),0)=0
      or jsonb_typeof(p_command->'installments') is distinct from 'array' then raise exception 'PAYABLES_INVALID'; end if;
    -- A balance reserved by a payment batch cannot move to new documents.
    if public.shared_payables_reserved_amount(v_tenant,v_document.id)>0 then raise exception 'PAYABLES_HAS_APPLICATIONS'; end if;
    v_count:=jsonb_array_length(p_command->'installments');
    if v_count not between 2 and 60 then raise exception 'PAYABLES_INVALID'; end if;
    perform public.shared_payables_assert_open_period(v_tenant,v_company,v_today);
    v_open:=public.shared_payables_open_amount(v_tenant,v_document.id);
    insert into public.shared_payables_installment_plans(tenant_id,id,company_id,document_id,created_by,status,transferred_amount)
      values(v_tenant,p_command->>'planId',v_company,v_document.id,v_actor,'active',v_open);
    insert into public.shared_payables_applications(tenant_id,id,organization_id,company_id,document_id,kind,amount,source_type,source_id,occurred_at,actor_id)
      values(v_tenant,(p_command->>'planId')||':transfer',v_org,v_company,v_document.id,'installment_transfer',v_open,'installment_plan',p_command->>'planId',v_today,v_actor);
    for v_item,v_index in select a,n from jsonb_array_elements(p_command->'installments') with ordinality as x(a,n) loop
      v_amount:=(v_item->>'amount')::numeric; v_due:=(v_item->>'dueAt')::date;
      if v_amount is null or v_amount<=0 or v_amount<>round(v_amount,2) or v_due is null or v_due<v_document.issued_at or coalesce(length(btrim(v_item->>'documentId')),0)=0 then raise exception 'PAYABLES_INVALID'; end if;
      v_total:=v_total+v_amount;
      begin
        insert into public.shared_payables_documents(tenant_id,id,organization_id,company_id,supplier_id,source_type,source_id,kind,document_number,concept,issued_at,due_at,currency,principal,rate_amount,rate_base_currency,rate_value,rate_source,rate_effective_date,rate_policy_version,rate_rounding,parent_document_id,created_by)
        values(v_tenant,v_item->>'documentId',v_org,v_company,v_document.supplier_id,'installment_plan',(p_command->>'planId')||':'||v_index,'installment',
          concat_ws(' ',nullif(v_document.document_number,''),'G'||v_index||'/'||v_count),v_document.concept,v_document.issued_at,v_due,v_document.currency,v_amount,round(v_amount*v_document.rate_value,2),'VES',v_document.rate_value,v_document.rate_source,v_document.rate_effective_date,v_document.rate_policy_version,v_document.rate_rounding,v_document.id,v_actor);
      exception when unique_violation then raise exception 'PAYABLES_INVALID';
      end;
      v_ids:=v_ids||jsonb_build_array(v_item->>'documentId');
      v_versions:=v_versions||jsonb_build_object(v_item->>'documentId',1);
    end loop;
    if v_total<>v_open then raise exception 'PAYABLES_EXCEEDS_BALANCE'; end if;
    v_versions:=v_versions||jsonb_build_object(v_document.id,public.shared_payables_refresh_document(v_tenant,v_document.id),p_command->>'planId',1);
    v_response:=jsonb_build_object('commandId',p_command->>'planId','affectedIds',jsonb_build_array(p_command->>'planId',v_document.id)||v_ids,'versions',v_versions);

  elsif v_kind='undo_installment_plan' then
    if coalesce(length(btrim(p_command->>'reason')),0)=0 then raise exception 'PAYABLES_INVALID'; end if;
    select * into v_plan from public.shared_payables_installment_plans where tenant_id=v_tenant and company_id=v_company and id=p_command->>'planId' for update;
    if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
    if v_plan.version<>(p_command->>'expectedVersion')::integer then raise exception 'PAYABLES_VERSION_CONFLICT'; end if;
    if v_plan.status<>'active' then raise exception 'PAYABLES_INVALID'; end if;
    perform 1 from public.shared_payables_documents d where d.tenant_id=v_tenant
      and (d.id=v_plan.document_id or (d.source_type='installment_plan' and d.parent_document_id=v_plan.document_id and left(d.source_id,length(v_plan.id)+1)=v_plan.id||':'))
      order by d.id for update;
    if exists(select 1 from public.shared_payables_documents d where d.tenant_id=v_tenant and d.source_type='installment_plan' and left(d.source_id,length(v_plan.id)+1)=v_plan.id||':'
        and (d.status<>'open' or public.shared_payables_reserved_amount(v_tenant,d.id)>0
          or exists(select 1 from public.shared_payables_applications a where a.tenant_id=v_tenant and a.document_id=d.id and a.reversed_at is null))) then
      raise exception 'PAYABLES_HAS_APPLICATIONS';
    end if;
    perform public.shared_payables_assert_open_period(v_tenant,v_company,v_today);
    with voided as (
      update public.shared_payables_documents d set status='voided',version=d.version+1,updated_at=now()
      where d.tenant_id=v_tenant and d.source_type='installment_plan' and left(d.source_id,length(v_plan.id)+1)=v_plan.id||':'
      returning d.id,d.version)
    select coalesce(jsonb_object_agg(id,version),'{}'::jsonb),coalesce(jsonb_agg(id),'[]'::jsonb) into v_versions,v_ids from voided;
    update public.shared_payables_applications set reversed_at=now(),reversed_by=v_actor,reversal_reason=btrim(p_command->>'reason')
      where tenant_id=v_tenant and source_type='installment_plan' and source_id=v_plan.id and kind='installment_transfer' and reversed_at is null;
    update public.shared_payables_installment_plans set status='undone',undone_at=now(),undone_by=v_actor,undo_reason=btrim(p_command->>'reason'),version=version+1
      where tenant_id=v_tenant and id=v_plan.id;
    v_versions:=v_versions||jsonb_build_object(v_plan.document_id,public.shared_payables_refresh_document(v_tenant,v_plan.document_id),v_plan.id,v_plan.version+1);
    v_response:=jsonb_build_object('commandId',v_plan.id,'affectedIds',jsonb_build_array(v_plan.id,v_plan.document_id)||v_ids,'versions',v_versions);
  end if;

  v_response:=v_response||jsonb_build_object('replayed',false);
  insert into public.shared_payables_command_receipts(tenant_id,company_id,idempotency_key,actor_id,permission_code,payload_hash,response)
  values(v_tenant,v_company,v_key,v_actor,v_permission,v_hash,v_response);
  return v_response;
end $$;

-- Batch commands only reserve debit balances; credits are applied, not paid.
create or replace function public.shared_payables_batch_command(p_scope jsonb,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid; v_company text:=p_scope->>'companyId'; v_org uuid:=(p_scope->>'organizationId')::uuid;
  v_actor uuid:=(p_scope->>'actorId')::uuid; v_permission text; v_key text:=p_command->>'idempotencyKey';
  v_hash text:=md5(p_command::text); v_receipt public.shared_payables_command_receipts%rowtype;
  v_batch public.shared_payables_payment_batches%rowtype; v_document public.shared_payables_documents%rowtype;
  v_reserved numeric; v_response jsonb; v_status text;
begin
  v_tenant:=public.assert_user_security_access(v_actor,v_org,v_company,'payables.read');
  v_permission:=case p_command->>'kind' when 'create_payment_batch' then 'payables.create'
    when 'set_payment_batch_item' then 'payables.create' when 'submit_payment_batch' then 'payables.create'
    when 'authorize_payment_batch' then 'payables.authorize' else null end;
  if v_permission is null then raise exception 'PAYABLES_INVALID'; end if;
  perform public.assert_user_security_access(v_actor,v_org,v_company,v_permission);
  if coalesce(length(btrim(v_key)),0)=0 then raise exception 'PAYABLES_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||v_company||':'||v_key,0));
  select * into v_receipt from public.shared_payables_command_receipts where tenant_id=v_tenant and company_id=v_company and idempotency_key=v_key for update;
  if found then
    if v_receipt.payload_hash<>v_hash then raise exception 'PAYABLES_IDEMPOTENCY_CONFLICT'; end if;
    return v_receipt.response||jsonb_build_object('replayed',true);
  end if;
  if p_command->>'kind'='create_payment_batch' then
    if p_command->>'currency' !~ '^[A-Z]{3}$' or not exists(select 1 from public.shared_inventory_suppliers s where s.tenant_id=v_tenant and s.company_id=v_company and s.id=p_command->>'supplierId' and s.active) then raise exception 'PAYABLES_INVALID'; end if;
    insert into public.shared_payables_payment_batches(tenant_id,id,organization_id,company_id,supplier_id,planned_date,currency,prepared_by)
      values(v_tenant,p_command->>'batchId',v_org,v_company,p_command->>'supplierId',(p_command->>'plannedDate')::date,p_command->>'currency',v_actor);
    v_response:=jsonb_build_object('commandId',p_command->>'batchId','affectedIds',jsonb_build_array(p_command->>'batchId'));
  else
    select * into v_batch from public.shared_payables_payment_batches where tenant_id=v_tenant and company_id=v_company and id=p_command->>'batchId' for update;
    if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
    if v_batch.version<>(p_command->>'expectedVersion')::integer then raise exception 'PAYABLES_VERSION_CONFLICT'; end if;
    if p_command->>'kind'='set_payment_batch_item' then
      if v_batch.status<>'draft' then raise exception 'PAYABLES_INVALID'; end if;
      select * into v_document from public.shared_payables_documents where tenant_id=v_tenant and company_id=v_company and id=p_command->>'documentId' for update;
      if not found or v_document.side<>'debit' or v_document.supplier_id<>v_batch.supplier_id or v_document.currency<>v_batch.currency or v_document.status<>'open' then raise exception 'PAYABLES_INVALID'; end if;
      select public.shared_payables_reserved_amount(v_tenant,v_document.id) into v_reserved;
      v_reserved:=v_reserved-coalesce((select i.amount from public.shared_payables_payment_batch_items i where i.tenant_id=v_tenant and i.batch_id=v_batch.id and i.document_id=v_document.id),0);
      if coalesce((p_command->>'amount')::numeric,0)<=0 or (p_command->>'amount')::numeric>public.shared_payables_open_amount(v_tenant,v_document.id)-v_reserved then raise exception 'PAYABLES_EXCEEDS_BALANCE'; end if;
      insert into public.shared_payables_payment_batch_items(tenant_id,id,company_id,batch_id,document_id,amount)
       values(v_tenant,p_command->>'itemId',v_company,v_batch.id,v_document.id,(p_command->>'amount')::numeric)
       on conflict(tenant_id,batch_id,document_id) do update set amount=excluded.amount;
      v_status:=v_batch.status;
    elsif p_command->>'kind'='submit_payment_batch' then
      if v_batch.status<>'draft' or not exists(select 1 from public.shared_payables_payment_batch_items where tenant_id=v_tenant and batch_id=v_batch.id) then raise exception 'PAYABLES_INVALID'; end if;
      update public.shared_payables_payment_batches set status='submitted',version=version+1,updated_at=now() where tenant_id=v_tenant and id=v_batch.id returning * into v_batch;
      v_status:=v_batch.status;
    else
      if v_batch.status<>'submitted' or p_command->>'decision' not in ('authorized','rejected') then raise exception 'PAYABLES_INVALID'; end if;
      if p_command->>'decision'='authorized' and coalesce((p_command->>'separationRequired')::boolean,false) and v_batch.prepared_by=v_actor then raise exception 'PAYABLES_FORBIDDEN'; end if;
      if p_command->>'decision'='rejected' and coalesce(length(btrim(p_command->>'reason')),0)=0 then raise exception 'PAYABLES_INVALID'; end if;
      update public.shared_payables_payment_batches set status=p_command->>'decision',authorized_by=v_actor,rejection_reason=case when p_command->>'decision'='rejected' then p_command->>'reason' end,version=version+1,updated_at=now() where tenant_id=v_tenant and id=v_batch.id returning * into v_batch;
      v_status:=v_batch.status;
    end if;
    v_response:=jsonb_build_object('commandId',coalesce(p_command->>'itemId',v_batch.id),'affectedIds',jsonb_build_array(v_batch.id),'status',v_status,'version',v_batch.version);
  end if;
  v_response:=v_response||jsonb_build_object('replayed',false);
  insert into public.shared_payables_command_receipts(tenant_id,company_id,idempotency_key,actor_id,permission_code,payload_hash,response)
    values(v_tenant,v_company,v_key,v_actor,v_permission,v_hash,v_response);
  return v_response;
end $$;

create or replace function public.shared_payables_query(p_scope jsonb,p_query jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_tenant uuid; v_rows jsonb; v_total integer; v_limit integer:=least(greatest(coalesce((p_query->>'limit')::integer,50),1),200); v_offset integer:=greatest(coalesce((p_query->>'offset')::integer,0),0);
begin
  v_tenant:=public.assert_user_security_read_access((p_scope->>'actorId')::uuid,(p_scope->>'organizationId')::uuid,p_scope->>'companyId','payables.read');
  if p_query->>'kind'<>'list_documents' then raise exception 'PAYABLES_INVALID'; end if;
  select count(*) into v_total from public.shared_payables_documents d where d.tenant_id=v_tenant and d.company_id=p_scope->>'companyId' and (p_query->>'status' is null or d.status=p_query->>'status') and (p_query->>'supplierId' is null or d.supplier_id=p_query->>'supplierId');
  select coalesce(jsonb_agg(jsonb_build_object(
    'document',jsonb_build_object('id',x.id,'supplierId',x.supplier_id,'sourceType',x.source_type,'sourceId',x.source_id,'kind',x.kind,'side',x.side,'parentDocumentId',x.parent_document_id,'documentNumber',x.document_number,'concept',x.concept,'issuedAt',x.issued_at::text,'dueAt',x.due_at::text,'currency',x.currency,'principal',x.principal::text,'rateSnapshot',jsonb_build_object('amount',x.rate_amount::text,'baseCurrency',x.rate_base_currency,'rate',x.rate_value::text,'source',x.rate_source,'effectiveDate',x.rate_effective_date::text,'policyVersion',x.rate_policy_version,'rounding',x.rate_rounding),'status',x.status,'version',x.version),
    'balance',greatest(public.shared_payables_open_amount(x.tenant_id,x.id),0)::text) order by x.due_at,x.id),'[]'::jsonb)
  into v_rows from (select d.* from public.shared_payables_documents d where d.tenant_id=v_tenant and d.company_id=p_scope->>'companyId' and (p_query->>'status' is null or d.status=p_query->>'status') and (p_query->>'supplierId' is null or d.supplier_id=p_query->>'supplierId') order by d.due_at,d.id offset v_offset limit v_limit)x;
  return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

create or replace function public.shared_payables_reporting_query(p_scope jsonb,p_query jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_tenant uuid; v_company text:=p_scope->>'companyId'; v_rows jsonb; v_total integer; v_limit integer:=least(greatest(coalesce((p_query->>'limit')::integer,50),1),200);
  v_offset integer:=greatest(coalesce((p_query->>'offset')::integer,0),0); v_as_of date:=coalesce((p_query->>'asOf')::date,current_date);
  v_document public.shared_payables_documents%rowtype;
begin
  v_tenant:=public.assert_user_security_read_access((p_scope->>'actorId')::uuid,(p_scope->>'organizationId')::uuid,v_company,'payables.read');
  if p_query->>'kind' in ('list_pending','list_settled','list_voided','supplier_balance','aging','supplier_statement') then
    select count(*) into v_total from public.shared_payables_documents d
    where d.tenant_id=v_tenant and d.company_id=v_company
      and (p_query->>'supplierId' is null or d.supplier_id=p_query->>'supplierId')
      and ((p_query->>'kind'='list_pending' and d.status='open') or (p_query->>'kind'='list_settled' and d.status='settled') or (p_query->>'kind'='list_voided' and d.status='voided') or p_query->>'kind' in ('supplier_balance','aging','supplier_statement'));
    select coalesce(jsonb_agg(jsonb_build_object('documentId',x.id,'supplierId',x.supplier_id,'supplierName',x.supplier_name,'documentNumber',x.document_number,'concept',x.concept,'kind',x.kind,'side',x.side,'parentDocumentId',x.parent_document_id,'issuedAt',x.issued_at,'dueAt',x.due_at,'currency',x.currency,'principal',x.principal::text,'applied',(x.principal-x.open_amount)::text,'balance',greatest(x.open_amount,0)::text,'status',x.status,'version',x.version,'daysOverdue',case when x.side='debit' then greatest(v_as_of-x.due_at,0) else 0 end) order by x.due_at,x.id),'[]'::jsonb)
    into v_rows from (select d.*,s.name supplier_name,public.shared_payables_open_amount(d.tenant_id,d.id) open_amount from public.shared_payables_documents d
      left join public.shared_inventory_suppliers s on s.tenant_id=d.tenant_id and s.id=d.supplier_id
      where d.tenant_id=v_tenant and d.company_id=v_company
        and (p_query->>'supplierId' is null or d.supplier_id=p_query->>'supplierId')
        and ((p_query->>'kind'='list_pending' and d.status='open') or (p_query->>'kind'='list_settled' and d.status='settled') or (p_query->>'kind'='list_voided' and d.status='voided') or p_query->>'kind' in ('supplier_balance','aging','supplier_statement'))
      order by d.due_at,d.id offset v_offset limit v_limit)x;
    return jsonb_build_object('rows',v_rows,'total',v_total,'asOf',v_as_of);
  elsif p_query->>'kind'='document_detail' then
    select * into v_document from public.shared_payables_documents d where d.tenant_id=v_tenant and d.company_id=v_company and d.id=p_query->>'documentId';
    if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
    return jsonb_build_object('total',1,'rows',jsonb_build_array(jsonb_build_object(
      'document',jsonb_build_object('id',v_document.id,'supplierId',v_document.supplier_id,'supplierName',(select s.name from public.shared_inventory_suppliers s where s.tenant_id=v_tenant and s.id=v_document.supplier_id),
        'sourceType',v_document.source_type,'sourceId',v_document.source_id,'kind',v_document.kind,'side',v_document.side,'parentDocumentId',v_document.parent_document_id,
        'documentNumber',v_document.document_number,'concept',v_document.concept,'reason',v_document.reason,'evidence',v_document.evidence,'issuedAt',v_document.issued_at,'dueAt',v_document.due_at,
        'currency',v_document.currency,'principal',v_document.principal::text,'rate',v_document.rate_value::text,'rateSource',v_document.rate_source,'rateEffectiveDate',v_document.rate_effective_date,
        'status',v_document.status,'version',v_document.version),
      'openAmount',greatest(public.shared_payables_open_amount(v_tenant,v_document.id),0)::text,
      'reserved',public.shared_payables_reserved_amount(v_tenant,v_document.id)::text,
      'applications',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'documentId',a.document_id,'creditDocumentId',a.credit_document_id,'amount',a.amount::text,'occurredAt',a.occurred_at,'sourceType',a.source_type,'sourceId',a.source_id,'reversedAt',a.reversed_at,'reversalReason',a.reversal_reason,'reversible',a.credit_document_id is not null and a.source_type='payables_command' and a.reversed_at is null) order by a.occurred_at,a.created_at,a.id)
        from public.shared_payables_applications a where a.tenant_id=v_tenant and (a.document_id=v_document.id or a.credit_document_id=v_document.id)),'[]'::jsonb),
      'dueDateChanges',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'previousDueAt',c.previous_due_at,'dueAt',c.due_at,'reason',c.reason,'changedAt',c.changed_at) order by c.changed_at,c.id)
        from public.shared_payables_due_date_changes c where c.tenant_id=v_tenant and c.document_id=v_document.id),'[]'::jsonb),
      'installmentPlans',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'status',p.status,'version',p.version,'transferredAmount',p.transferred_amount::text,'createdAt',p.created_at,'undoneAt',p.undone_at,'undoReason',p.undo_reason) order by p.created_at,p.id)
        from public.shared_payables_installment_plans p where p.tenant_id=v_tenant and p.document_id=v_document.id),'[]'::jsonb),
      'children',coalesce((select jsonb_agg(jsonb_build_object('documentId',c.id,'kind',c.kind,'side',c.side,'documentNumber',c.document_number,'dueAt',c.due_at,'principal',c.principal::text,'balance',greatest(public.shared_payables_open_amount(v_tenant,c.id),0)::text,'status',c.status,'sourceId',c.source_id) order by c.due_at,c.id)
        from public.shared_payables_documents c where c.tenant_id=v_tenant and c.parent_document_id=v_document.id),'[]'::jsonb),
      -- Counterparts a user may apply against this document: open credits for a debt, open debts for a credit.
      'counterparts',coalesce((select jsonb_agg(jsonb_build_object('documentId',c.id,'kind',c.kind,'documentNumber',c.document_number,'dueAt',c.due_at,'balance',c.open_amount::text,'version',c.version) order by c.due_at,c.id)
        from (select o.*,public.shared_payables_open_amount(o.tenant_id,o.id)-case when o.side='debit' then public.shared_payables_reserved_amount(o.tenant_id,o.id) else 0 end open_amount
          from public.shared_payables_documents o where o.tenant_id=v_tenant and o.company_id=v_company and o.supplier_id=v_document.supplier_id and o.currency=v_document.currency
          and o.status='open' and o.side<>v_document.side and o.id<>v_document.id) c where c.open_amount>0),'[]'::jsonb)
    )));
  elsif p_query->>'kind'='payment_history' then
    select count(*) into v_total from public.shared_payables_payments p where p.tenant_id=v_tenant and p.company_id=v_company
      and (p_query->>'supplierId' is null or p.supplier_id=p_query->>'supplierId')
      and (p_query->>'from' is null or p.occurred_at>=(p_query->>'from')::date) and (p_query->>'to' is null or p.occurred_at<=(p_query->>'to')::date);
    select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'supplierId',x.supplier_id,'method',x.method,'amount',x.amount::text,'currency',x.currency,'accountKind',x.account_kind,'accountId',x.account_id,'reference',x.reference,'occurredAt',x.occurred_at,'status',x.status,'ledgerEntryId',x.ledger_entry_id,'treasuryPaymentId',x.treasury_payment_id,'applications',x.lines) order by x.occurred_at desc,x.id desc),'[]'::jsonb)
    into v_rows from (select p.*,coalesce((select jsonb_agg(jsonb_build_object('documentId',l.document_id,'amount',l.applied_amount::text,'currency',l.debt_currency,'exchangeDifferenceVes',l.exchange_difference_ves::text)) from public.shared_payables_payment_lines l where l.tenant_id=p.tenant_id and l.payment_id=p.id),'[]'::jsonb) lines
      from public.shared_payables_payments p where p.tenant_id=v_tenant and p.company_id=v_company
       and (p_query->>'supplierId' is null or p.supplier_id=p_query->>'supplierId')
       and (p_query->>'from' is null or p.occurred_at>=(p_query->>'from')::date) and (p_query->>'to' is null or p.occurred_at<=(p_query->>'to')::date)
      order by p.occurred_at desc,p.id desc offset v_offset limit v_limit)x;
    return jsonb_build_object('rows',v_rows,'total',v_total);
  elsif p_query->>'kind'='payment_batches' then
    select count(*) into v_total from public.shared_payables_payment_batches b where b.tenant_id=v_tenant and b.company_id=v_company and (p_query->>'status' is null or b.status=p_query->>'status');
    select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'supplierId',x.supplier_id,'plannedDate',x.planned_date,'currency',x.currency,'status',x.status,'version',x.version,'preparedBy',x.prepared_by,'authorizedBy',x.authorized_by,'items',x.items,'reserved',x.total::text) order by x.planned_date,x.id),'[]'::jsonb)
    into v_rows from (select b.*,coalesce((select jsonb_agg(jsonb_build_object('documentId',i.document_id,'amount',i.amount::text) order by i.document_id) from public.shared_payables_payment_batch_items i where i.tenant_id=b.tenant_id and i.batch_id=b.id),'[]'::jsonb) items,coalesce((select sum(i.amount) from public.shared_payables_payment_batch_items i where i.tenant_id=b.tenant_id and i.batch_id=b.id),0) total
      from public.shared_payables_payment_batches b where b.tenant_id=v_tenant and b.company_id=v_company and (p_query->>'status' is null or b.status=p_query->>'status') order by b.planned_date,b.id offset v_offset limit v_limit)x;
    return jsonb_build_object('rows',v_rows,'total',v_total);
  end if;
  raise exception 'PAYABLES_INVALID';
end $$;

-- Internal helpers accept any tenant id; only the command/query RPCs may call them.
revoke all on function public.shared_payables_open_amount(uuid,text),public.shared_payables_refresh_document(uuid,text),public.shared_payables_assert_open_period(uuid,text,date),public.shared_payables_release_purchase_source(uuid,text) from public,anon,authenticated;
grant execute on function public.shared_payables_open_amount(uuid,text),public.shared_payables_assert_open_period(uuid,text,date) to service_role;
revoke all on function public.shared_payables_execute_command(jsonb,jsonb),public.shared_payables_batch_command(jsonb,jsonb),public.shared_payables_query(jsonb,jsonb),public.shared_payables_reporting_query(jsonb,jsonb),public.shared_payables_register_purchase_invoice(),public.shared_payables_guard_purchase_invoice_unconfirm(),public.shared_payables_guard_purchase_invoice_delete() from public,anon,authenticated;
grant execute on function public.shared_payables_execute_command(jsonb,jsonb),public.shared_payables_batch_command(jsonb,jsonb),public.shared_payables_query(jsonb,jsonb),public.shared_payables_reporting_query(jsonb,jsonb) to service_role;
alter table public.shared_payables_installment_plans enable row level security;
grant select on public.shared_payables_installment_plans to authenticated,service_role;
