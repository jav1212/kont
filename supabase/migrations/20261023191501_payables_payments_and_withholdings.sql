-- CXP-003-006 and CXP-013-030 (cortes 3 y 4): company policy, supplier payments
-- atomically linked to Treasury, batch execution, payment-time withholdings with
-- shared correlatives, void/reverse, branch inheritance (D9) and the remaining
-- report filters. Amounts are exact numerics; nothing is deleted.

-- ─── Company policy (D8, decision 6 prerequisites) ───────────────────────────
create table if not exists public.shared_payables_policies (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  company_id text not null,
  separation_required boolean not null default false,
  negative_adjustment_threshold_ves numeric(28,8) check (negative_adjustment_threshold_ves is null or negative_adjustment_threshold_ves>0),
  vat_withholding_agent boolean not null default false,
  islr_withholding_agent boolean not null default false,
  version integer not null default 1 check (version>0),
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (tenant_id,company_id),
  foreign key (tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete restrict
);

-- ─── Document facts needed by payments, withholdings and branch reports ───────
alter table public.shared_payables_documents
  add column if not exists branch_id uuid,
  add column if not exists tax_base_ves numeric(28,8),
  add column if not exists vat_amount_ves numeric(28,8),
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists approved_by uuid references auth.users(id) on delete restrict,
  add column if not exists approved_at timestamptz;
alter table public.shared_payables_documents drop constraint if exists shared_payables_documents_approval_check;
alter table public.shared_payables_documents add constraint shared_payables_documents_approval_check check (approval_status in ('not_required','pending','approved','rejected'));
create index if not exists shared_payables_documents_branch_idx on public.shared_payables_documents(tenant_id,company_id,branch_id) where branch_id is not null;

-- Purchase-sourced documents inherit the purchase branch (D9) and its fiscal
-- amounts in VES, which are the base of a later payment-time VAT withholding.
create or replace function public.shared_payables_document_source_facts()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_purchase record;
begin
  if new.source_type='purchase_invoice' then
    select p.branch_id,abs(p.subtotal) subtotal,abs(p.vat_amount) vat_amount into v_purchase
      from public.shared_inventory_purchase_invoices p where p.tenant_id=new.tenant_id and p.id=new.source_id;
    if found then new.branch_id:=v_purchase.branch_id; new.tax_base_ves:=v_purchase.subtotal; new.vat_amount_ves:=v_purchase.vat_amount; end if;
  elsif new.parent_document_id is not null and tg_op='INSERT' then
    select d.branch_id into new.branch_id from public.shared_payables_documents d where d.tenant_id=new.tenant_id and d.id=new.parent_document_id;
  end if;
  -- A negative adjustment above the company threshold waits for a second actor (D8).
  if tg_op='INSERT' and new.kind='negative_adjustment' and exists(select 1 from public.shared_payables_policies p where p.tenant_id=new.tenant_id and p.company_id=new.company_id
      and p.negative_adjustment_threshold_ves is not null and new.principal*new.rate_value>p.negative_adjustment_threshold_ves) then
    new.approval_status:='pending';
  end if;
  return new;
end $$;
drop trigger if exists shared_payables_document_source_facts on public.shared_payables_documents;
create trigger shared_payables_document_source_facts before insert or update of source_id,status on public.shared_payables_documents
  for each row execute function public.shared_payables_document_source_facts();
update public.shared_payables_documents d set branch_id=p.branch_id,tax_base_ves=abs(p.subtotal),vat_amount_ves=abs(p.vat_amount)
  from public.shared_inventory_purchase_invoices p where d.source_type='purchase_invoice' and p.tenant_id=d.tenant_id and p.id=d.source_id;

-- A pending or rejected credit cannot be consumed.
create or replace function public.shared_payables_guard_credit_approval()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.credit_document_id is not null and exists(select 1 from public.shared_payables_documents d where d.tenant_id=new.tenant_id and d.id=new.credit_document_id and d.approval_status in ('pending','rejected')) then
    raise exception 'PAYABLES_APPROVAL_PENDING';
  end if;
  return new;
end $$;
drop trigger if exists shared_payables_guard_credit_approval on public.shared_payables_applications;
create trigger shared_payables_guard_credit_approval before insert on public.shared_payables_applications for each row execute function public.shared_payables_guard_credit_approval();

-- The company policy, not the client, decides whether the preparer may authorize (D8).
create or replace function public.shared_payables_guard_batch_separation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='authorized' and old.status<>'authorized' and new.authorized_by=old.prepared_by
    and exists(select 1 from public.shared_payables_policies p where p.tenant_id=new.tenant_id and p.company_id=new.company_id and p.separation_required) then
    raise exception 'PAYABLES_FORBIDDEN';
  end if;
  return new;
end $$;
drop trigger if exists shared_payables_guard_batch_separation on public.shared_payables_payment_batches;
create trigger shared_payables_guard_batch_separation before update of status on public.shared_payables_payment_batches for each row execute function public.shared_payables_guard_batch_separation();

-- ─── Payments ─────────────────────────────────────────────────────────────────
alter table public.shared_payables_payments
  add column if not exists rate_value numeric(28,8),
  add column if not exists rate_source text,
  add column if not exists rate_policy_version text,
  add column if not exists operational_amount_ves numeric(28,8),
  add column if not exists check_id text,
  add column if not exists check_number text,
  add column if not exists concept text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete restrict,
  add column if not exists reversal_date date,
  add column if not exists reversal_ledger_entry_id text,
  add column if not exists updated_at timestamptz not null default now();
alter table public.shared_payables_payments drop constraint if exists shared_payables_payments_closure_check;
alter table public.shared_payables_payments add constraint shared_payables_payments_closure_check
  check (status='posted' or (nullif(btrim(reason),'') is not null and voided_by is not null and voided_at is not null));
alter table public.shared_payables_payment_lines
  add column if not exists payment_amount numeric(28,8),
  add column if not exists debt_current_rate numeric(28,8),
  add column if not exists application_id text;
create index if not exists shared_payables_payment_lines_payment_idx on public.shared_payables_payment_lines(tenant_id,payment_id);
create index if not exists shared_payables_payment_lines_document_idx on public.shared_payables_payment_lines(tenant_id,document_id);

-- ─── Withholdings issued by payables (the payment is the first event) ─────────
create table if not exists public.shared_payables_withholdings (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  supplier_id text not null,
  document_id text not null,
  payment_id text,
  kind text not null check (kind in ('vat','islr')),
  taxable_base_ves numeric(28,8) not null check (taxable_base_ves>0),
  rate numeric(12,6) not null check (rate>0 and rate<=100),
  subtrahend_ves numeric(28,8) not null default 0 check (subtrahend_ves>=0),
  tax_unit_value numeric(28,8),
  concept_code text,
  amount_ves numeric(28,8) not null check (amount_ves>0),
  amount_debt numeric(28,8) not null check (amount_debt>0),
  receipt_number text not null,
  fiscal_period text not null,
  issued_at date not null,
  late boolean not null default false,
  status text not null default 'issued' check (status in ('issued','declared','voided')),
  declared_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  application_id text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  version integer not null default 1 check (version>0),
  primary key (tenant_id,id),
  unique (tenant_id,company_id,kind,receipt_number),
  foreign key (tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete restrict,
  foreign key (tenant_id,document_id) references public.shared_payables_documents(tenant_id,id) on delete restrict,
  foreign key (tenant_id,payment_id) references public.shared_payables_payments(tenant_id,id) on delete restrict,
  check (kind<>'islr' or nullif(btrim(concept_code),'') is not null),
  check (status<>'voided' or (voided_at is not null and nullif(btrim(void_reason),'') is not null))
);
create unique index if not exists shared_payables_withholdings_active_idx on public.shared_payables_withholdings(tenant_id,document_id,kind) where status<>'voided';
create index if not exists shared_payables_withholdings_period_idx on public.shared_payables_withholdings(tenant_id,company_id,kind,fiscal_period);

alter table public.shared_payables_policies enable row level security;
alter table public.shared_payables_withholdings enable row level security;
revoke all on public.shared_payables_policies,public.shared_payables_withholdings from public,anon,authenticated;
grant select on public.shared_payables_policies,public.shared_payables_withholdings to authenticated,service_role;
drop trigger if exists operational_audit_shared_payables_payments on public.shared_payables_payments;
create trigger operational_audit_shared_payables_payments after insert or update or delete on public.shared_payables_payments for each row execute function public.append_operational_audit_trigger('supplier_payment','direct');
drop trigger if exists operational_audit_shared_payables_withholdings on public.shared_payables_withholdings;
create trigger operational_audit_shared_payables_withholdings after insert or update or delete on public.shared_payables_withholdings for each row execute function public.append_operational_audit_trigger('payable_withholding','direct');
drop trigger if exists operational_audit_shared_payables_payment_batches on public.shared_payables_payment_batches;
create trigger operational_audit_shared_payables_payment_batches after insert or update or delete on public.shared_payables_payment_batches for each row execute function public.append_operational_audit_trigger('payment_batch','direct');

-- Next receipt number shared with purchase-registered withholdings: VAT is
-- AAAAMM + 8 digits per period, ISLR is AAAA + 8 digits per fiscal year.
create or replace function public.shared_payables_next_receipt(p_tenant uuid,p_company text,p_kind text,p_date date)
returns text language plpgsql security definer set search_path=public as $$
declare v_prefix text:=case when p_kind='vat' then to_char(p_date,'YYYYMM') else to_char(p_date,'YYYY') end; v_length integer:=case when p_kind='vat' then 14 else 12 end; v_next bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('payables-receipt:'||p_tenant::text||':'||p_company||':'||p_kind||':'||v_prefix,0));
  select greatest(
    coalesce((select max(substr(r,length(v_prefix)+1)::bigint) from (
      select case when p_kind='vat' then vat_retention_receipt_number else income_tax_receipt_number end r from public.shared_inventory_purchase_invoices
      where tenant_id=p_tenant and company_id=p_company) x where r ~ ('^'||v_prefix||'[0-9]{8}$') and length(r)=v_length),0),
    coalesce((select max(substr(receipt_number,length(v_prefix)+1)::bigint) from public.shared_payables_withholdings
      where tenant_id=p_tenant and company_id=p_company and kind=p_kind and receipt_number ~ ('^'||v_prefix||'[0-9]{8}$')),0))+1 into v_next;
  if v_next>99999999 then raise exception 'PAYABLES_INVALID'; end if;
  return v_prefix||lpad(v_next::text,8,'0');
end $$;

-- Applies one payment (lines, withholdings, treasury debit) for an authorized
-- caller. Used directly and by batch execution, always inside one transaction.
create or replace function public.shared_payables_post_payment(p_tenant uuid,p_org uuid,p_company text,p_actor uuid,p_command jsonb,p_batch text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_payment text:=p_command->>'paymentId'; v_money jsonb:=p_command->'money'; v_currency text:=p_command->'money'->>'currency';
  v_pay_rate numeric:=(p_command->'money'->'operationalValue'->>'rate')::numeric; v_date date:=(p_command->>'occurredAt')::date;
  v_supplier public.shared_inventory_suppliers%rowtype; v_policy public.shared_payables_policies%rowtype; v_document public.shared_payables_documents%rowtype;
  v_item jsonb; v_amount numeric; v_applied numeric; v_debt_rate numeric; v_total numeric:=0; v_reduction jsonb:='{}'::jsonb; v_reserved numeric;
  v_withholding_ves numeric; v_withholding_debt numeric; v_receipt text; v_treasury jsonb; v_versions jsonb:='{}'::jsonb; v_warnings jsonb:='[]'::jsonb; v_lines integer:=0; v_id text;
begin
  if coalesce(length(btrim(v_payment)),0)=0 or v_date is null or coalesce(v_currency,'') !~ '^[A-Z]{3}$' or coalesce(v_pay_rate,0)<=0
    or (v_currency='VES' and v_pay_rate<>1) or (v_money->>'amount')::numeric<=0 or (v_money->>'amount')::numeric<>round((v_money->>'amount')::numeric,2)
    or jsonb_typeof(p_command->'lines') is distinct from 'array' or jsonb_array_length(p_command->'lines') not between 1 and 100
    or (select count(distinct l->>'documentId') from jsonb_array_elements(p_command->'lines') l)<>jsonb_array_length(p_command->'lines') then
    raise exception 'PAYABLES_INVALID';
  end if;
  perform public.shared_payables_assert_open_period(p_tenant,p_company,v_date);
  select * into v_supplier from public.shared_inventory_suppliers where tenant_id=p_tenant and company_id=p_company and id=p_command->>'supplierId' and active;
  if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
  select * into v_policy from public.shared_payables_policies where tenant_id=p_tenant and company_id=p_company;
  -- Lock every affected document in id order to serialize concurrent payments without deadlocks.
  perform 1 from public.shared_payables_documents d where d.tenant_id=p_tenant and d.company_id=p_company
    and d.id in (select l->>'documentId' from jsonb_array_elements(p_command->'lines') l union select w->>'documentId' from jsonb_array_elements(coalesce(p_command->'withholdings','[]'::jsonb)) w)
    order by d.id for update;

  -- Withholdings first: they are applications that reduce what the payment may cover.
  for v_item in select w from jsonb_array_elements(coalesce(p_command->'withholdings','[]'::jsonb)) w loop
    select * into v_document from public.shared_payables_documents where tenant_id=p_tenant and company_id=p_company and id=v_item->>'documentId';
    if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
    if v_document.side<>'debit' or v_document.status<>'open' or v_document.supplier_id<>v_supplier.id or not exists(select 1 from jsonb_array_elements(p_command->'lines') l where l->>'documentId'=v_document.id) then raise exception 'PAYABLES_INVALID'; end if;
    if v_item->>'kind' not in ('vat','islr') or coalesce(length(btrim(v_item->>'id')),0)=0 then raise exception 'PAYABLES_INVALID'; end if;
    if (v_item->>'kind'='vat' and not coalesce(v_policy.vat_withholding_agent,false)) or (v_item->>'kind'='islr' and not coalesce(v_policy.islr_withholding_agent,false)) then raise exception 'PAYABLES_FORBIDDEN'; end if;
    if exists(select 1 from public.shared_payables_applications a where a.tenant_id=p_tenant and a.document_id=v_document.id and a.reversed_at is null and a.kind=case when v_item->>'kind'='vat' then 'withholding_vat' else 'withholding_islr' end)
      or exists(select 1 from public.shared_payables_withholdings w where w.tenant_id=p_tenant and w.document_id=v_document.id and w.kind=v_item->>'kind' and w.status<>'voided') then
      raise exception 'PAYABLES_WITHHOLDING_DUPLICATE';
    end if;
    v_debt_rate:=case when v_document.currency='VES' then 1 when v_document.currency=v_currency then v_pay_rate else (p_command->'rates'->v_document.currency->>'rate')::numeric end;
    if coalesce(v_debt_rate,0)<=0 then raise exception 'PAYABLES_INVALID'; end if;
    if v_item->>'kind'='vat' then
      if coalesce((v_item->>'rate')::numeric,0) not in (75,100) or coalesce((v_item->>'taxableBaseVes')::numeric,v_document.vat_amount_ves,0)<=0 then raise exception 'PAYABLES_INVALID'; end if;
      v_withholding_ves:=round(coalesce((v_item->>'taxableBaseVes')::numeric,v_document.vat_amount_ves)*(v_item->>'rate')::numeric/100,2);
    else
      if coalesce((v_item->>'taxableBaseVes')::numeric,0)<=0 or coalesce((v_item->>'rate')::numeric,0) not between 0.01 and 100 or coalesce((v_item->>'subtrahendVes')::numeric,0)<0 or coalesce(length(btrim(v_item->>'conceptCode')),0)=0 then raise exception 'PAYABLES_INVALID'; end if;
      v_withholding_ves:=round((v_item->>'taxableBaseVes')::numeric*(v_item->>'rate')::numeric/100,2)-coalesce((v_item->>'subtrahendVes')::numeric,0);
    end if;
    if v_withholding_ves<=0 then raise exception 'PAYABLES_INVALID'; end if;
    v_withholding_debt:=case when v_document.currency='VES' then v_withholding_ves else round(v_withholding_ves/v_debt_rate,2) end;
    if v_withholding_debt<=0 then raise exception 'PAYABLES_INVALID'; end if;
    v_receipt:=public.shared_payables_next_receipt(p_tenant,p_company,v_item->>'kind',v_date);
    insert into public.shared_payables_applications(tenant_id,id,organization_id,company_id,document_id,kind,amount,source_type,source_id,occurred_at,actor_id)
      values(p_tenant,(v_item->>'id')||':application',p_org,p_company,v_document.id,case when v_item->>'kind'='vat' then 'withholding_vat' else 'withholding_islr' end,v_withholding_debt,'payables_withholding',v_item->>'id',v_date,p_actor);
    insert into public.shared_payables_withholdings(tenant_id,id,organization_id,company_id,supplier_id,document_id,payment_id,kind,taxable_base_ves,rate,subtrahend_ves,tax_unit_value,concept_code,amount_ves,amount_debt,receipt_number,fiscal_period,issued_at,late,application_id,created_by)
      values(p_tenant,v_item->>'id',p_org,p_company,v_supplier.id,v_document.id,null,v_item->>'kind',coalesce((v_item->>'taxableBaseVes')::numeric,v_document.vat_amount_ves),(v_item->>'rate')::numeric,coalesce((v_item->>'subtrahendVes')::numeric,0),(v_item->>'taxUnitValue')::numeric,nullif(btrim(v_item->>'conceptCode'),''),
        v_withholding_ves,v_withholding_debt,v_receipt,case when v_item->>'kind'='vat' then to_char(v_date,'YYYY-MM') else to_char(v_date,'YYYY') end,v_date,
        -- A purchase registered earlier was already an abono en cuenta (decision 6): withholding now is late.
        v_document.source_type='purchase_invoice',(v_item->>'id')||':application',p_actor);
    if v_document.source_type='purchase_invoice' then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','LATE_WITHHOLDING','documentId',v_document.id,'kind',v_item->>'kind')); end if;
    v_reduction:=v_reduction||jsonb_build_object(v_document.id,coalesce((v_reduction->>v_document.id)::numeric,0)+v_withholding_debt);
  end loop;

  for v_item in select l from jsonb_array_elements(p_command->'lines') l loop
    select * into v_document from public.shared_payables_documents where tenant_id=p_tenant and company_id=p_company and id=v_item->>'documentId';
    if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
    if v_document.side<>'debit' or v_document.status<>'open' or v_document.supplier_id<>v_supplier.id then raise exception 'PAYABLES_INVALID'; end if;
    v_amount:=(v_item->>'amount')::numeric;
    if v_amount is null or v_amount<=0 or v_amount<>round(v_amount,2) or coalesce(length(btrim(v_item->>'lineId')),0)=0 then raise exception 'PAYABLES_INVALID'; end if;
    -- Decision 4: convert at the payment-date rates of both currencies; the debt
    -- snapshot only measures the realized VES difference.
    v_debt_rate:=case when v_document.currency='VES' then 1 when v_document.currency=v_currency then v_pay_rate else (p_command->'rates'->v_document.currency->>'rate')::numeric end;
    if coalesce(v_debt_rate,0)<=0 then raise exception 'PAYABLES_INVALID'; end if;
    v_applied:=case when v_document.currency=v_currency then v_amount else round(v_amount*v_pay_rate/v_debt_rate,2) end;
    if v_applied<=0 then raise exception 'PAYABLES_INVALID'; end if;
    v_reserved:=public.shared_payables_reserved_amount(p_tenant,v_document.id)-coalesce((select i.amount from public.shared_payables_payment_batch_items i where i.tenant_id=p_tenant and i.batch_id=p_batch and i.document_id=v_document.id),0);
    if v_applied+coalesce((v_reduction->>v_document.id)::numeric,0)>public.shared_payables_open_amount(p_tenant,v_document.id)-v_reserved then raise exception 'PAYABLES_EXCEEDS_BALANCE'; end if;
    v_total:=v_total+v_amount; v_lines:=v_lines+1;
    insert into public.shared_payables_applications(tenant_id,id,organization_id,company_id,document_id,kind,amount,source_type,source_id,occurred_at,actor_id)
      values(p_tenant,(v_item->>'lineId')||':application',p_org,p_company,v_document.id,'payment',v_applied,'supplier_payment',v_item->>'lineId',v_date,p_actor);
    v_versions:=v_versions||jsonb_build_object(v_document.id,0);
  end loop;
  -- D4: no advances or overpayments; the lines must consume the whole disbursement.
  if v_total<>(v_money->>'amount')::numeric then raise exception 'PAYABLES_INVALID'; end if;

  v_treasury:=treasury_private.post_source_disbursement(p_tenant,p_company,jsonb_build_object('sourceType','supplier_payment','sourceId',v_payment,'method',p_command->>'method','account',p_command->'account','money',v_money,
    'operationalDate',v_date,'reference',p_command->>'reference','checkbookId',p_command->>'checkbookId','concept',coalesce(nullif(btrim(p_command->>'concept'),''),'Pago a '||v_supplier.name),
    'beneficiary',jsonb_build_object('supplierId',v_supplier.id,'taxIdentifier',v_supplier.rif,'legalName',v_supplier.name)));
  insert into public.shared_payables_payments(tenant_id,id,organization_id,company_id,supplier_id,batch_id,method,amount,currency,account_kind,account_id,reference,occurred_at,status,ledger_entry_id,treasury_payment_id,created_by,rate_value,rate_source,rate_policy_version,operational_amount_ves,check_id,check_number,concept)
    values(p_tenant,v_payment,p_org,p_company,v_supplier.id,p_batch,p_command->>'method',(v_money->>'amount')::numeric,v_currency,p_command->'account'->>'kind',p_command->'account'->>'id',nullif(btrim(p_command->>'reference'),''),v_date,'posted',
      v_treasury->>'ledgerEntryId',v_payment,p_actor,v_pay_rate,v_money->'operationalValue'->>'source',v_money->'operationalValue'->>'policyVersion',(v_money->'operationalValue'->>'amount')::numeric,v_treasury->>'checkId',v_treasury->>'checkNumber',nullif(btrim(p_command->>'concept'),''));
  update public.shared_payables_withholdings set payment_id=v_payment where tenant_id=p_tenant and id in (select w->>'id' from jsonb_array_elements(coalesce(p_command->'withholdings','[]'::jsonb)) w);
  for v_item in select l from jsonb_array_elements(p_command->'lines') l loop
    select * into v_document from public.shared_payables_documents where tenant_id=p_tenant and id=v_item->>'documentId';
    v_debt_rate:=case when v_document.currency='VES' then 1 when v_document.currency=v_currency then v_pay_rate else (p_command->'rates'->v_document.currency->>'rate')::numeric end;
    select a.amount into v_applied from public.shared_payables_applications a where a.tenant_id=p_tenant and a.id=(v_item->>'lineId')||':application';
    insert into public.shared_payables_payment_lines(tenant_id,id,company_id,payment_id,document_id,applied_amount,debt_currency,debt_rate,payment_rate,exchange_difference_ves,payment_amount,debt_current_rate,application_id)
      values(p_tenant,v_item->>'lineId',p_company,v_payment,v_document.id,v_applied,v_document.currency,v_document.rate_value,v_pay_rate,
        -- Positive means more VES were paid than recorded for the debt (exchange loss).
        round(v_applied*(v_debt_rate-v_document.rate_value),2),(v_item->>'amount')::numeric,v_debt_rate,(v_item->>'lineId')||':application');
  end loop;
  for v_id in select jsonb_object_keys(v_versions) loop v_versions:=v_versions||jsonb_build_object(v_id,public.shared_payables_refresh_document(p_tenant,v_id)); end loop;
  return jsonb_build_object('commandId',v_payment,'affectedIds',jsonb_build_array(v_payment)||(select coalesce(jsonb_agg(k),'[]'::jsonb) from jsonb_object_keys(v_versions) k),'versions',v_versions||jsonb_build_object(v_payment,1),
    'ledgerEntryId',v_treasury->>'ledgerEntryId','checkNumber',v_treasury->>'checkNumber','warnings',v_warnings);
end $$;

-- Releases every fact of a payment. `void` keeps the original date (same open
-- period, not reconciled); `reverse` is a compensating fact on its own date.
create or replace function public.shared_payables_close_payment(p_tenant uuid,p_company text,p_actor uuid,p_payment text,p_mode text,p_date date,p_reason text,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_payment public.shared_payables_payments%rowtype; v_treasury jsonb; v_versions jsonb:='{}'::jsonb; v_id text;
begin
  if coalesce(length(btrim(p_reason)),0)=0 then raise exception 'PAYABLES_INVALID'; end if;
  select * into v_payment from public.shared_payables_payments where tenant_id=p_tenant and company_id=p_company and id=p_payment for update;
  if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
  if v_payment.version<>p_expected_version then raise exception 'PAYABLES_VERSION_CONFLICT'; end if;
  if v_payment.status<>'posted' then raise exception 'PAYABLES_INVALID'; end if;
  if p_mode='void' then
    perform public.shared_payables_assert_open_period(p_tenant,p_company,v_payment.occurred_at);
    if treasury_private.is_reconciled(p_tenant,v_payment.ledger_entry_id) then raise exception 'PAYABLES_TREASURY_RECONCILED'; end if;
  else
    if p_date is null or p_date<v_payment.occurred_at then raise exception 'PAYABLES_INVALID'; end if;
    perform public.shared_payables_assert_open_period(p_tenant,p_company,p_date);
  end if;
  -- A declared receipt belongs to a filed TXT/XML; it needs a withholding adjustment (RIVA-011), not a void.
  if exists(select 1 from public.shared_payables_withholdings w where w.tenant_id=p_tenant and w.payment_id=v_payment.id and w.status='declared') then raise exception 'PAYABLES_WITHHOLDING_DECLARED'; end if;
  perform 1 from public.shared_payables_documents d where d.tenant_id=p_tenant and d.id in (select l.document_id from public.shared_payables_payment_lines l where l.tenant_id=p_tenant and l.payment_id=v_payment.id) order by d.id for update;
  update public.shared_payables_applications a set reversed_at=now(),reversed_by=p_actor,reversal_reason=btrim(p_reason)
    where a.tenant_id=p_tenant and a.reversed_at is null and (a.id in (select l.application_id from public.shared_payables_payment_lines l where l.tenant_id=p_tenant and l.payment_id=v_payment.id)
      or a.id in (select w.application_id from public.shared_payables_withholdings w where w.tenant_id=p_tenant and w.payment_id=v_payment.id));
  update public.shared_payables_withholdings set status='voided',voided_at=now(),void_reason=btrim(p_reason),version=version+1 where tenant_id=p_tenant and payment_id=v_payment.id and status='issued';
  v_treasury:=treasury_private.reverse_source_disbursement(p_tenant,p_company,v_payment.ledger_entry_id,p_mode,case when p_mode='void' then v_payment.occurred_at else p_date end,btrim(p_reason));
  update public.shared_payables_payments set status=case when p_mode='void' then 'voided' else 'reversed' end,reason=btrim(p_reason),voided_at=now(),voided_by=p_actor,
    reversal_date=case when p_mode='void' then v_payment.occurred_at else p_date end,reversal_ledger_entry_id=v_treasury->>'reversalEntryId',version=version+1,updated_at=now()
    where tenant_id=p_tenant and id=v_payment.id;
  for v_id in select distinct l.document_id from public.shared_payables_payment_lines l where l.tenant_id=p_tenant and l.payment_id=v_payment.id loop
    v_versions:=v_versions||jsonb_build_object(v_id,public.shared_payables_refresh_document(p_tenant,v_id));
  end loop;
  return jsonb_build_object('commandId',v_payment.id,'affectedIds',jsonb_build_array(v_payment.id)||(select coalesce(jsonb_agg(k),'[]'::jsonb) from jsonb_object_keys(v_versions) k),'versions',v_versions||jsonb_build_object(v_payment.id,v_payment.version+1),'reversalEntryId',v_treasury->>'reversalEntryId');
end $$;

create or replace function public.shared_payables_payment_command(p_scope jsonb,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid; v_company text:=p_scope->>'companyId'; v_org uuid:=(p_scope->>'organizationId')::uuid; v_actor uuid:=(p_scope->>'actorId')::uuid;
  v_kind text:=p_command->>'kind'; v_key text:=p_command->>'idempotencyKey'; v_hash text:=md5(p_command::text); v_permission text;
  v_receipt public.shared_payables_command_receipts%rowtype; v_batch public.shared_payables_payment_batches%rowtype; v_document public.shared_payables_documents%rowtype;
  v_policy public.shared_payables_policies%rowtype; v_response jsonb; v_lines jsonb; v_count integer;
begin
  v_tenant:=public.assert_user_security_access(v_actor,v_org,v_company,'payables.read');
  v_permission:=case v_kind
    when 'execute_supplier_payment' then 'payables.post' when 'execute_payment_batch' then 'payables.post'
    when 'void_supplier_payment' then 'payables.void' when 'reverse_supplier_payment' then 'payables.reverse'
    when 'configure_policy' then 'payables.authorize' when 'decide_adjustment' then 'payables.authorize'
    when 'mark_withholdings_declared' then 'payables.authorize' else null end;
  if v_permission is null then raise exception 'PAYABLES_INVALID'; end if;
  perform public.assert_user_security_access(v_actor,v_org,v_company,v_permission);
  if v_key is null or length(btrim(v_key)) not between 1 and 200 then raise exception 'PAYABLES_INVALID'; end if;
  perform public.set_operational_audit_context(v_actor,v_org,v_company,null,null);
  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||v_company||':'||v_key,0));
  select * into v_receipt from public.shared_payables_command_receipts where tenant_id=v_tenant and company_id=v_company and idempotency_key=v_key for update;
  if found then
    if v_receipt.payload_hash<>v_hash then raise exception 'PAYABLES_IDEMPOTENCY_CONFLICT'; end if;
    return v_receipt.response||jsonb_build_object('replayed',true);
  end if;

  if v_kind='execute_supplier_payment' then
    v_response:=public.shared_payables_post_payment(v_tenant,v_org,v_company,v_actor,p_command,null);
  elsif v_kind='execute_payment_batch' then
    select * into v_batch from public.shared_payables_payment_batches where tenant_id=v_tenant and company_id=v_company and id=p_command->>'batchId' for update;
    if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
    if v_batch.version<>(p_command->>'expectedVersion')::integer then raise exception 'PAYABLES_VERSION_CONFLICT'; end if;
    if v_batch.status<>'authorized' or v_batch.currency<>p_command->'money'->>'currency' then raise exception 'PAYABLES_INVALID'; end if;
    -- A batch pays its reserved items in the batch currency, which equals each document's currency.
    select jsonb_agg(jsonb_build_object('lineId',v_batch.id||':'||i.document_id,'documentId',i.document_id,'amount',i.amount::text) order by i.document_id),count(*) into v_lines,v_count
      from public.shared_payables_payment_batch_items i where i.tenant_id=v_tenant and i.batch_id=v_batch.id;
    if v_count=0 then raise exception 'PAYABLES_INVALID'; end if;
    v_response:=public.shared_payables_post_payment(v_tenant,v_org,v_company,v_actor,
      p_command||jsonb_build_object('paymentId',coalesce(p_command->>'paymentId',v_batch.id||':payment'),'supplierId',v_batch.supplier_id,'lines',v_lines),v_batch.id);
    update public.shared_payables_payment_batches set status='executed',version=version+1,updated_at=now() where tenant_id=v_tenant and id=v_batch.id;
    v_response:=v_response||jsonb_build_object('versions',(v_response->'versions')||jsonb_build_object(v_batch.id,v_batch.version+1));
  elsif v_kind='void_supplier_payment' then
    v_response:=public.shared_payables_close_payment(v_tenant,v_company,v_actor,p_command->>'paymentId','void',null,p_command->>'reason',(p_command->>'expectedVersion')::integer);
  elsif v_kind='reverse_supplier_payment' then
    v_response:=public.shared_payables_close_payment(v_tenant,v_company,v_actor,p_command->>'paymentId','reverse',(p_command->>'reversalDate')::date,p_command->>'reason',(p_command->>'expectedVersion')::integer);
  elsif v_kind='configure_policy' then
    if p_command->'negativeAdjustmentThresholdVes' is not null and jsonb_typeof(p_command->'negativeAdjustmentThresholdVes')<>'null' and coalesce((p_command->>'negativeAdjustmentThresholdVes')::numeric,0)<=0 then raise exception 'PAYABLES_INVALID'; end if;
    select * into v_policy from public.shared_payables_policies where tenant_id=v_tenant and company_id=v_company for update;
    if found and v_policy.version<>(p_command->>'expectedVersion')::integer then raise exception 'PAYABLES_VERSION_CONFLICT'; end if;
    insert into public.shared_payables_policies(tenant_id,company_id,separation_required,negative_adjustment_threshold_ves,vat_withholding_agent,islr_withholding_agent,updated_by)
      values(v_tenant,v_company,coalesce((p_command->>'separationRequired')::boolean,false),nullif(p_command->>'negativeAdjustmentThresholdVes','')::numeric,coalesce((p_command->>'vatWithholdingAgent')::boolean,false),coalesce((p_command->>'islrWithholdingAgent')::boolean,false),v_actor)
      on conflict (tenant_id,company_id) do update set separation_required=excluded.separation_required,negative_adjustment_threshold_ves=excluded.negative_adjustment_threshold_ves,
        vat_withholding_agent=excluded.vat_withholding_agent,islr_withholding_agent=excluded.islr_withholding_agent,updated_by=v_actor,updated_at=now(),version=shared_payables_policies.version+1
      returning * into v_policy;
    v_response:=jsonb_build_object('commandId',v_company,'affectedIds',jsonb_build_array(v_company),'versions',jsonb_build_object('policy',v_policy.version));
  elsif v_kind='decide_adjustment' then
    select * into v_document from public.shared_payables_documents where tenant_id=v_tenant and company_id=v_company and id=p_command->>'documentId' for update;
    if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
    if v_document.approval_status<>'pending' or p_command->>'decision' not in ('approved','rejected') then raise exception 'PAYABLES_INVALID'; end if;
    if v_document.created_by=v_actor then raise exception 'PAYABLES_FORBIDDEN'; end if;
    update public.shared_payables_documents set approval_status=p_command->>'decision',approved_by=v_actor,approved_at=now(),
      status=case when p_command->>'decision'='rejected' then 'voided' else status end,version=version+1,updated_at=now()
      where tenant_id=v_tenant and id=v_document.id;
    v_response:=jsonb_build_object('commandId',v_document.id,'affectedIds',jsonb_build_array(v_document.id),'versions',jsonb_build_object(v_document.id,v_document.version+1));
  elsif v_kind='mark_withholdings_declared' then
    if p_command->>'withholdingKind' not in ('vat','islr') or coalesce(p_command->>'fiscalPeriod','') !~ '^[0-9]{4}(-[0-9]{2})?$' then raise exception 'PAYABLES_INVALID'; end if;
    with declared as (update public.shared_payables_withholdings set status='declared',declared_at=now(),version=version+1
      where tenant_id=v_tenant and company_id=v_company and kind=p_command->>'withholdingKind' and fiscal_period=p_command->>'fiscalPeriod' and status='issued' returning id)
    select count(*) into v_count from declared;
    v_response:=jsonb_build_object('commandId',(p_command->>'withholdingKind')||':'||(p_command->>'fiscalPeriod'),'affectedIds','[]'::jsonb,'versions','{}'::jsonb,'declared',v_count);
  end if;

  v_response:=v_response||jsonb_build_object('replayed',false);
  insert into public.shared_payables_command_receipts(tenant_id,company_id,idempotency_key,actor_id,permission_code,payload_hash,response)
    values(v_tenant,v_company,v_key,v_actor,v_permission,v_hash,v_response);
  return v_response;
end $$;

-- ─── Reports ──────────────────────────────────────────────────────────────────
create or replace function public.shared_payables_document_matches(p_document public.shared_payables_documents,p_query jsonb,p_as_of date)
returns boolean language sql stable security definer set search_path=public as $$
  select (p_query->>'supplierId' is null or p_document.supplier_id=p_query->>'supplierId')
    and (p_query->>'currency' is null or p_document.currency=p_query->>'currency')
    and (p_query->>'documentKind' is null or p_document.kind=p_query->>'documentKind')
    and (p_query->>'branchId' is null or p_document.branch_id::text=p_query->>'branchId')
    and (p_query->>'dueFrom' is null or p_document.due_at>=(p_query->>'dueFrom')::date)
    and (p_query->>'dueTo' is null or p_document.due_at<=(p_query->>'dueTo')::date)
    and (p_query->>'overdueMin' is null or (p_document.side='debit' and p_as_of-p_document.due_at>=(p_query->>'overdueMin')::integer))
    and (p_query->>'overdueMax' is null or (p_document.side='debit' and p_as_of-p_document.due_at<=(p_query->>'overdueMax')::integer))
$$;

create or replace function public.shared_payables_reporting_query(p_scope jsonb,p_query jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_tenant uuid; v_company text:=p_scope->>'companyId'; v_rows jsonb; v_total integer; v_extra jsonb:='{}'::jsonb;
  v_limit integer:=least(greatest(coalesce((p_query->>'limit')::integer,50),1),200); v_offset integer:=greatest(coalesce((p_query->>'offset')::integer,0),0);
  v_as_of date:=coalesce((p_query->>'asOf')::date,(now() at time zone 'America/Caracas')::date); v_document public.shared_payables_documents%rowtype;
  v_from date:=(p_query->>'from')::date; v_to date:=(p_query->>'to')::date;
begin
  v_tenant:=public.assert_user_security_read_access((p_scope->>'actorId')::uuid,(p_scope->>'organizationId')::uuid,v_company,'payables.read');
  if p_query->>'kind' in ('list_pending','list_settled','list_voided') then
    with docs as (select d.*,s.name supplier_name,public.shared_payables_open_amount(d.tenant_id,d.id) open_amount,
        (select max(a.occurred_at) from public.shared_payables_applications a where a.tenant_id=d.tenant_id and (a.document_id=d.id or a.credit_document_id=d.id) and a.reversed_at is null) settled_at
      from public.shared_payables_documents d left join public.shared_inventory_suppliers s on s.tenant_id=d.tenant_id and s.id=d.supplier_id
      where d.tenant_id=v_tenant and d.company_id=v_company and public.shared_payables_document_matches(d,p_query,v_as_of)
        and d.status=case p_query->>'kind' when 'list_pending' then 'open' when 'list_settled' then 'settled' else 'voided' end)
    select (select count(*) from docs),
      coalesce((select jsonb_agg(jsonb_build_object('documentId',x.id,'supplierId',x.supplier_id,'supplierName',x.supplier_name,'documentNumber',x.document_number,'concept',x.concept,'kind',x.kind,'side',x.side,'parentDocumentId',x.parent_document_id,'branchId',x.branch_id,'issuedAt',x.issued_at,'dueAt',x.due_at,'currency',x.currency,'principal',x.principal::text,'applied',(x.principal-x.open_amount)::text,'balance',greatest(x.open_amount,0)::text,'status',x.status,'approvalStatus',x.approval_status,'version',x.version,'settledAt',case when x.status='settled' then x.settled_at end,'voidedAt',case when x.status='voided' then x.updated_at::date end,'daysOverdue',case when x.side='debit' then greatest(v_as_of-x.due_at,0) else 0 end) order by x.due_at,x.id)
        from (select * from docs order by due_at,id offset v_offset limit v_limit) x),'[]'::jsonb),
      coalesce((select jsonb_agg(jsonb_build_object('currency',t.currency,'debt',t.debt::text,'credit',t.credit::text,'net',(t.debt-t.credit)::text) order by t.currency)
        from (select currency,sum(case when side='debit' then greatest(open_amount,0) else 0 end) debt,sum(case when side='credit' then greatest(open_amount,0) else 0 end) credit from docs group by currency) t),'[]'::jsonb)
    into v_total,v_rows,v_extra;
    return jsonb_build_object('rows',v_rows,'total',v_total,'asOf',v_as_of,'totals',v_extra);
  elsif p_query->>'kind' in ('supplier_balance','aging') then
    -- Balances as of a date: documents issued and applications occurred up to it, reversals effective on their date.
    with docs as (select d.*,s.name supplier_name,
        d.principal-coalesce((select sum(a.amount) from public.shared_payables_applications a where a.tenant_id=d.tenant_id and (case when d.side='credit' then a.credit_document_id else a.document_id end)=d.id
          and a.occurred_at<=v_as_of and (a.reversed_at is null or (a.reversed_at at time zone 'America/Caracas')::date>v_as_of)),0) open_amount
      from public.shared_payables_documents d left join public.shared_inventory_suppliers s on s.tenant_id=d.tenant_id and s.id=d.supplier_id
      where d.tenant_id=v_tenant and d.company_id=v_company and d.issued_at<=v_as_of and (d.status<>'voided' or (d.updated_at at time zone 'America/Caracas')::date>v_as_of)
        and public.shared_payables_document_matches(d,p_query,v_as_of)),
    grouped as (select supplier_id,max(supplier_name) supplier_name,currency,
        sum(case when side='debit' then open_amount else 0 end) debt,sum(case when side='credit' then open_amount else 0 end) credit,
        sum(case when side='debit' and v_as_of<=due_at then open_amount else 0 end) current_amount,
        sum(case when side='debit' and v_as_of-due_at between 1 and 30 then open_amount else 0 end) d1_30,
        sum(case when side='debit' and v_as_of-due_at between 31 and 60 then open_amount else 0 end) d31_60,
        sum(case when side='debit' and v_as_of-due_at between 61 and 90 then open_amount else 0 end) d61_90,
        sum(case when side='debit' and v_as_of-due_at>90 then open_amount else 0 end) d90
      from docs where open_amount>0 group by supplier_id,currency)
    select count(*),coalesce(jsonb_agg(jsonb_build_object('supplierId',g.supplier_id,'supplierName',coalesce(g.supplier_name,g.supplier_id),'currency',g.currency,'debt',g.debt::text,'credit',g.credit::text,'net',(g.debt-g.credit)::text,
        'current',g.current_amount::text,'overdue1to30',g.d1_30::text,'overdue31to60',g.d31_60::text,'overdue61to90',g.d61_90::text,'overdueOver90',g.d90::text,'overdue',(g.d1_30+g.d31_60+g.d61_90+g.d90)::text) order by g.supplier_name,g.currency),'[]'::jsonb)
    into v_total,v_rows from grouped g;
    if p_query->>'kind'='aging' then
      select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'current',sum_current::text,'overdue1to30',s1::text,'overdue31to60',s2::text,'overdue61to90',s3::text,'overdueOver90',s4::text,'credit',sc::text) order by currency),'[]'::jsonb) into v_extra
        from (select r->>'currency' currency,sum((r->>'current')::numeric) sum_current,sum((r->>'overdue1to30')::numeric) s1,sum((r->>'overdue31to60')::numeric) s2,sum((r->>'overdue61to90')::numeric) s3,sum((r->>'overdueOver90')::numeric) s4,sum((r->>'credit')::numeric) sc
          from jsonb_array_elements(v_rows) r group by r->>'currency') t;
    else
      select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'debt',d::text,'credit',c::text,'net',(d-c)::text) order by currency),'[]'::jsonb) into v_extra
        from (select r->>'currency' currency,sum((r->>'debt')::numeric) d,sum((r->>'credit')::numeric) c from jsonb_array_elements(v_rows) r group by r->>'currency') t;
    end if;
    return jsonb_build_object('rows',v_rows,'total',v_total,'asOf',v_as_of,'totals',v_extra);
  elsif p_query->>'kind'='supplier_statement' then
    if p_query->>'supplierId' is null then raise exception 'PAYABLES_INVALID'; end if;
    -- Every fact moves the supplier balance on its own date: debts +, credits −, payments and
    -- withholdings −, reversals and voids undo them on the day they happen. Credit
    -- applications and installment transfers move debt between documents and net to zero.
    with docs as (select d.* from public.shared_payables_documents d where d.tenant_id=v_tenant and d.company_id=v_company and d.supplier_id=p_query->>'supplierId'
        and (p_query->>'currency' is null or d.currency=p_query->>'currency') and (p_query->>'branchId' is null or d.branch_id::text=p_query->>'branchId')),
    movements as (
      select d.issued_at movement_date,d.created_at stamp,'document' movement_type,d.kind detail,d.id document_id,d.document_number,d.concept description,d.currency,case when d.side='debit' then d.principal else -d.principal end amount from docs d
      union all
      select (d.updated_at at time zone 'America/Caracas')::date,d.updated_at,'void',d.kind,d.id,d.document_number,'Anulación',d.currency,case when d.side='debit' then -d.principal else d.principal end from docs d where d.status='voided'
      union all
      select a.occurred_at,a.created_at,'application',a.kind,d.id,d.document_number,coalesce(a.source_type,''),d.currency,-a.amount from public.shared_payables_applications a join docs d on d.tenant_id=a.tenant_id and d.id=a.document_id
        where a.tenant_id=v_tenant and a.credit_document_id is null
      union all
      select (a.reversed_at at time zone 'America/Caracas')::date,a.reversed_at,'reversal',a.kind,d.id,d.document_number,coalesce(a.reversal_reason,''),d.currency,a.amount from public.shared_payables_applications a join docs d on d.tenant_id=a.tenant_id and d.id=a.document_id
        where a.tenant_id=v_tenant and a.credit_document_id is null and a.reversed_at is not null),
    ordered as (select m.*,sum(m.amount) over (partition by m.currency order by m.movement_date,m.stamp,m.document_id rows unbounded preceding) running from movements m)
    select count(*) filter (where (v_from is null or movement_date>=v_from) and (v_to is null or movement_date<=v_to)),
      coalesce(jsonb_agg(jsonb_build_object('date',o.movement_date,'movementType',o.movement_type,'detail',o.detail,'documentId',o.document_id,'documentNumber',o.document_number,'description',o.description,'currency',o.currency,'amount',o.amount::text,'balance',o.running::text) order by o.currency,o.movement_date,o.stamp,o.document_id)
        filter (where (v_from is null or o.movement_date>=v_from) and (v_to is null or o.movement_date<=v_to)),'[]'::jsonb),
      coalesce((select jsonb_agg(jsonb_build_object('currency',c.currency,'opening',c.opening::text,'closing',c.closing::text) order by c.currency) from (
        select currency,coalesce(sum(amount) filter (where v_from is not null and movement_date<v_from),0) opening,coalesce(sum(amount) filter (where v_to is null or movement_date<=v_to),0) closing from movements group by currency) c),'[]'::jsonb)
    into v_total,v_rows,v_extra from ordered o;
    return jsonb_build_object('rows',v_rows,'total',v_total,'totals',v_extra);
  elsif p_query->>'kind'='document_detail' then
    select * into v_document from public.shared_payables_documents d where d.tenant_id=v_tenant and d.company_id=v_company and d.id=p_query->>'documentId';
    if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
    return jsonb_build_object('total',1,'rows',jsonb_build_array(jsonb_build_object(
      'document',jsonb_build_object('id',v_document.id,'supplierId',v_document.supplier_id,'supplierName',(select s.name from public.shared_inventory_suppliers s where s.tenant_id=v_tenant and s.id=v_document.supplier_id),
        'sourceType',v_document.source_type,'sourceId',v_document.source_id,'kind',v_document.kind,'side',v_document.side,'parentDocumentId',v_document.parent_document_id,'branchId',v_document.branch_id,
        'documentNumber',v_document.document_number,'concept',v_document.concept,'reason',v_document.reason,'evidence',v_document.evidence,'issuedAt',v_document.issued_at,'dueAt',v_document.due_at,
        'currency',v_document.currency,'principal',v_document.principal::text,'rate',v_document.rate_value::text,'rateSource',v_document.rate_source,'rateEffectiveDate',v_document.rate_effective_date,
        'vatAmountVes',v_document.vat_amount_ves::text,'taxBaseVes',v_document.tax_base_ves::text,'approvalStatus',v_document.approval_status,'createdBy',v_document.created_by,'status',v_document.status,'version',v_document.version),
      'openAmount',greatest(public.shared_payables_open_amount(v_tenant,v_document.id),0)::text,
      'reserved',public.shared_payables_reserved_amount(v_tenant,v_document.id)::text,
      'applications',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'documentId',a.document_id,'creditDocumentId',a.credit_document_id,'amount',a.amount::text,'occurredAt',a.occurred_at,'sourceType',a.source_type,'sourceId',a.source_id,
          'paymentId',(select l.payment_id from public.shared_payables_payment_lines l where l.tenant_id=a.tenant_id and l.application_id=a.id),
          'reversedAt',a.reversed_at,'reversalReason',a.reversal_reason,'reversible',a.credit_document_id is not null and a.source_type='payables_command' and a.reversed_at is null) order by a.occurred_at,a.created_at,a.id)
        from public.shared_payables_applications a where a.tenant_id=v_tenant and (a.document_id=v_document.id or a.credit_document_id=v_document.id)),'[]'::jsonb),
      'withholdings',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'kind',w.kind,'receiptNumber',w.receipt_number,'amountVes',w.amount_ves::text,'status',w.status,'issuedAt',w.issued_at,'late',w.late) order by w.issued_at,w.id)
        from public.shared_payables_withholdings w where w.tenant_id=v_tenant and w.document_id=v_document.id),'[]'::jsonb),
      'dueDateChanges',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'previousDueAt',c.previous_due_at,'dueAt',c.due_at,'reason',c.reason,'changedAt',c.changed_at) order by c.changed_at,c.id)
        from public.shared_payables_due_date_changes c where c.tenant_id=v_tenant and c.document_id=v_document.id),'[]'::jsonb),
      'installmentPlans',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'status',p.status,'version',p.version,'transferredAmount',p.transferred_amount::text,'createdAt',p.created_at,'undoneAt',p.undone_at,'undoReason',p.undo_reason) order by p.created_at,p.id)
        from public.shared_payables_installment_plans p where p.tenant_id=v_tenant and p.document_id=v_document.id),'[]'::jsonb),
      'children',coalesce((select jsonb_agg(jsonb_build_object('documentId',c.id,'kind',c.kind,'side',c.side,'documentNumber',c.document_number,'dueAt',c.due_at,'principal',c.principal::text,'balance',greatest(public.shared_payables_open_amount(v_tenant,c.id),0)::text,'status',c.status,'sourceId',c.source_id) order by c.due_at,c.id)
        from public.shared_payables_documents c where c.tenant_id=v_tenant and c.parent_document_id=v_document.id),'[]'::jsonb),
      'counterparts',coalesce((select jsonb_agg(jsonb_build_object('documentId',c.id,'kind',c.kind,'documentNumber',c.document_number,'dueAt',c.due_at,'balance',c.open_amount::text,'version',c.version) order by c.due_at,c.id)
        from (select o.*,public.shared_payables_open_amount(o.tenant_id,o.id)-case when o.side='debit' then public.shared_payables_reserved_amount(o.tenant_id,o.id) else 0 end open_amount
          from public.shared_payables_documents o where o.tenant_id=v_tenant and o.company_id=v_company and o.supplier_id=v_document.supplier_id and o.currency=v_document.currency
          and o.status='open' and o.side<>v_document.side and o.id<>v_document.id and o.approval_status in ('not_required','approved')) c where c.open_amount>0),'[]'::jsonb)
    )));
  elsif p_query->>'kind'='payment_history' then
    with payments as (select p.* from public.shared_payables_payments p where p.tenant_id=v_tenant and p.company_id=v_company
      and (p_query->>'paymentId' is null or p.id=p_query->>'paymentId')
      and (p_query->>'supplierId' is null or p.supplier_id=p_query->>'supplierId') and (p_query->>'method' is null or p.method=p_query->>'method')
      and (p_query->>'accountId' is null or p.account_id=p_query->>'accountId') and (p_query->>'status' is null or p.status=p_query->>'status')
      and (p_query->>'createdBy' is null or p.created_by::text=p_query->>'createdBy')
      and (v_from is null or p.occurred_at>=v_from) and (v_to is null or p.occurred_at<=v_to))
    select (select count(*) from payments),coalesce(jsonb_agg(jsonb_build_object('id',x.id,'supplierId',x.supplier_id,'supplierName',(select s.name from public.shared_inventory_suppliers s where s.tenant_id=x.tenant_id and s.id=x.supplier_id),
        'batchId',x.batch_id,'method',x.method,'amount',x.amount::text,'currency',x.currency,'rate',x.rate_value::text,'operationalAmountVes',x.operational_amount_ves::text,'accountKind',x.account_kind,'accountId',x.account_id,
        'accountName',case when x.account_kind='cash_box' then (select b.name from public.shared_treasury_cash_boxes b where b.tenant_id=x.tenant_id and b.id=x.account_id) else (select a.holder_name||' · '||right(a.account_number,4) from public.shared_treasury_bank_accounts a where a.tenant_id=x.tenant_id and a.id=x.account_id) end,
        'reference',x.reference,'checkNumber',x.check_number,'concept',x.concept,'occurredAt',x.occurred_at,'status',x.status,'version',x.version,'createdBy',x.created_by,'reason',x.reason,'reversalDate',x.reversal_date,
        'ledgerEntryId',x.ledger_entry_id,'reconciled',treasury_private.is_reconciled(x.tenant_id,x.ledger_entry_id),
        'applications',coalesce((select jsonb_agg(jsonb_build_object('lineId',l.id,'documentId',l.document_id,'documentNumber',(select d.document_number from public.shared_payables_documents d where d.tenant_id=l.tenant_id and d.id=l.document_id),'paymentAmount',l.payment_amount::text,'appliedAmount',l.applied_amount::text,'currency',l.debt_currency,'debtRate',l.debt_rate::text,'paymentRate',l.payment_rate::text,'exchangeDifferenceVes',l.exchange_difference_ves::text) order by l.document_id) from public.shared_payables_payment_lines l where l.tenant_id=x.tenant_id and l.payment_id=x.id),'[]'::jsonb),
        'withholdings',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'kind',w.kind,'documentId',w.document_id,'receiptNumber',w.receipt_number,'amountVes',w.amount_ves::text,'status',w.status,'late',w.late) order by w.kind) from public.shared_payables_withholdings w where w.tenant_id=x.tenant_id and w.payment_id=x.id),'[]'::jsonb))
      order by x.occurred_at desc,x.id desc),'[]'::jsonb)
    into v_total,v_rows from (select * from payments order by occurred_at desc,id desc offset v_offset limit v_limit) x;
    return jsonb_build_object('rows',v_rows,'total',v_total);
  elsif p_query->>'kind'='payment_batches' then
    select count(*) into v_total from public.shared_payables_payment_batches b where b.tenant_id=v_tenant and b.company_id=v_company and (p_query->>'status' is null or b.status=p_query->>'status') and (p_query->>'supplierId' is null or b.supplier_id=p_query->>'supplierId');
    select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'supplierId',x.supplier_id,'supplierName',(select s.name from public.shared_inventory_suppliers s where s.tenant_id=x.tenant_id and s.id=x.supplier_id),'plannedDate',x.planned_date,'currency',x.currency,'status',x.status,'version',x.version,'preparedBy',x.prepared_by,'authorizedBy',x.authorized_by,'rejectionReason',x.rejection_reason,
        'items',x.items,'reserved',x.total::text,'paymentId',(select p.id from public.shared_payables_payments p where p.tenant_id=x.tenant_id and p.batch_id=x.id order by p.created_at desc limit 1)) order by x.planned_date,x.id),'[]'::jsonb)
    into v_rows from (select b.*,coalesce((select jsonb_agg(jsonb_build_object('documentId',i.document_id,'documentNumber',d.document_number,'dueAt',d.due_at,'amount',i.amount::text) order by i.document_id) from public.shared_payables_payment_batch_items i join public.shared_payables_documents d on d.tenant_id=i.tenant_id and d.id=i.document_id where i.tenant_id=b.tenant_id and i.batch_id=b.id),'[]'::jsonb) items,
        coalesce((select sum(i.amount) from public.shared_payables_payment_batch_items i where i.tenant_id=b.tenant_id and i.batch_id=b.id),0) total
      from public.shared_payables_payment_batches b where b.tenant_id=v_tenant and b.company_id=v_company and (p_query->>'status' is null or b.status=p_query->>'status') and (p_query->>'supplierId' is null or b.supplier_id=p_query->>'supplierId')
      order by b.planned_date,b.id offset v_offset limit v_limit)x;
    return jsonb_build_object('rows',v_rows,'total',v_total);
  elsif p_query->>'kind'='withholdings' then
    -- Unified view of both moments (decision 6): imported from purchases and issued at payment.
    with unified as (
      select 'purchase:'||a.id id,case when a.kind='withholding_vat' then 'vat' else 'islr' end kind,'purchase' origin,d.supplier_id,d.id document_id,d.document_number,
        case when a.kind='withholding_vat' then p.vat_retention_receipt_number else p.income_tax_receipt_number end receipt_number,
        case when a.kind='withholding_vat' then to_char(p.invoice_date,'YYYY-MM') else to_char(p.invoice_date,'YYYY') end fiscal_period,
        a.occurred_at issued_at,case when a.kind='withholding_vat' then abs(p.vat_retention_amount) else abs(p.income_tax_amount) end amount_ves,
        case when a.reversed_at is null then 'issued' else 'voided' end status,false late,null::text payment_id
      from public.shared_payables_applications a join public.shared_payables_documents d on d.tenant_id=a.tenant_id and d.id=a.document_id
        left join public.shared_inventory_purchase_invoices p on p.tenant_id=d.tenant_id and p.id=d.source_id
      where a.tenant_id=v_tenant and a.company_id=v_company and a.kind in ('withholding_vat','withholding_islr') and a.source_type='purchase_invoice'
      union all
      select w.id,w.kind,'payment',w.supplier_id,w.document_id,d.document_number,w.receipt_number,w.fiscal_period,w.issued_at,w.amount_ves,w.status,w.late,w.payment_id
      from public.shared_payables_withholdings w join public.shared_payables_documents d on d.tenant_id=w.tenant_id and d.id=w.document_id
      where w.tenant_id=v_tenant and w.company_id=v_company),
    filtered as (select u.*,s.name supplier_name,s.rif supplier_rif from unified u left join public.shared_inventory_suppliers s on s.tenant_id=v_tenant and s.id=u.supplier_id
      where (p_query->>'withholdingKind' is null or u.kind=p_query->>'withholdingKind') and (p_query->>'fiscalPeriod' is null or u.fiscal_period=p_query->>'fiscalPeriod')
        and (p_query->>'supplierId' is null or u.supplier_id=p_query->>'supplierId') and (p_query->>'status' is null or u.status=p_query->>'status')
        and (v_from is null or u.issued_at>=v_from) and (v_to is null or u.issued_at<=v_to))
    select (select count(*) from filtered),
      coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'kind',f.kind,'origin',f.origin,'supplierId',f.supplier_id,'supplierName',f.supplier_name,'supplierRif',f.supplier_rif,'documentId',f.document_id,'documentNumber',f.document_number,'receiptNumber',f.receipt_number,'fiscalPeriod',f.fiscal_period,'issuedAt',f.issued_at,'amountVes',f.amount_ves::text,'status',f.status,'late',f.late,'paymentId',f.payment_id) order by f.issued_at,f.receipt_number)
        from (select * from filtered order by issued_at,receipt_number offset v_offset limit v_limit) f),'[]'::jsonb),
      coalesce((select jsonb_agg(jsonb_build_object('kind',t.kind,'fiscalPeriod',t.fiscal_period,'amountVes',t.total::text) order by t.kind,t.fiscal_period) from (select kind,fiscal_period,sum(amount_ves) total from filtered where status<>'voided' group by kind,fiscal_period) t),'[]'::jsonb)
    into v_total,v_rows,v_extra;
    return jsonb_build_object('rows',v_rows,'total',v_total,'totals',v_extra);
  elsif p_query->>'kind'='suppliers' then
    select count(*),coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'rif',s.rif,'defaultCreditDays',s.default_credit_days,'vatWithholdingRate',s.vat_withholding_rate::text,'incomeTaxSupplierType',s.income_tax_supplier_type) order by s.name),'[]'::jsonb)
      into v_total,v_rows from public.shared_inventory_suppliers s where s.tenant_id=v_tenant and s.company_id=v_company and s.active;
    return jsonb_build_object('rows',v_rows,'total',v_total);
  elsif p_query->>'kind'='treasury_accounts' then
    select count(*),coalesce(jsonb_agg(a order by a->>'kind',a->>'name'),'[]'::jsonb) into v_total,v_rows from (
      select jsonb_build_object('kind','cash_box','id',b.id,'name',b.name,'currency',b.currency,'version',b.version,'checkbooks','[]'::jsonb) a from public.shared_treasury_cash_boxes b where b.tenant_id=v_tenant and b.company_id=v_company and b.status='active'
      union all
      select jsonb_build_object('kind','bank_account','id',a.id,'name',a.holder_name||' · '||right(a.account_number,4),'currency',a.currency,'version',a.version,
        'checkbooks',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nextNumber',c.next_number::text,'lastNumber',c.last_number::text) order by c.id) from public.shared_treasury_checkbooks c where c.tenant_id=a.tenant_id and c.bank_account_id=a.id and c.status='active' and c.next_number<=c.last_number),'[]'::jsonb))
      from public.shared_treasury_bank_accounts a where a.tenant_id=v_tenant and a.company_id=v_company and a.status='active') x;
    return jsonb_build_object('rows',v_rows,'total',v_total);
  elsif p_query->>'kind'='policy' then
    select coalesce(jsonb_agg(jsonb_build_object('separationRequired',p.separation_required,'negativeAdjustmentThresholdVes',p.negative_adjustment_threshold_ves::text,'vatWithholdingAgent',p.vat_withholding_agent,'islrWithholdingAgent',p.islr_withholding_agent,'version',p.version)),
      jsonb_build_array(jsonb_build_object('separationRequired',false,'negativeAdjustmentThresholdVes',null,'vatWithholdingAgent',false,'islrWithholdingAgent',false,'version',0)))
      into v_rows from public.shared_payables_policies p where p.tenant_id=v_tenant and p.company_id=v_company;
    return jsonb_build_object('rows',v_rows,'total',1);
  end if;
  raise exception 'PAYABLES_INVALID';
end $$;

revoke all on function public.shared_payables_document_source_facts(),public.shared_payables_guard_credit_approval(),public.shared_payables_guard_batch_separation(),
  public.shared_payables_next_receipt(uuid,text,text,date),public.shared_payables_post_payment(uuid,uuid,text,uuid,jsonb,text),public.shared_payables_close_payment(uuid,text,uuid,text,text,date,text,integer),
  public.shared_payables_document_matches(public.shared_payables_documents,jsonb,date),public.shared_payables_payment_command(jsonb,jsonb),public.shared_payables_reporting_query(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_payables_payment_command(jsonb,jsonb),public.shared_payables_reporting_query(jsonb,jsonb) to service_role;
