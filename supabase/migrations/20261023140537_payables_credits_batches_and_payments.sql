-- Payables operational phase: immutable credits, installment documents, batches and supplier payments.
-- Treasury integration is represented by a required ledger link and must be supplied by treasury's private writer.

create table if not exists public.shared_payables_installment_plans (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  id text not null,
  company_id text not null,
  document_id text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(tenant_id,id),
  foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete restrict,
  foreign key(tenant_id,document_id) references public.shared_payables_documents(tenant_id,id) on delete restrict
);

alter table public.shared_payables_applications
  drop constraint if exists shared_payables_applications_kind_check;
alter table public.shared_payables_applications add constraint shared_payables_applications_kind_check
  check(kind in ('payment','credit_note','positive_adjustment','negative_adjustment','withholding_vat','withholding_islr','installment_transfer'));

create table if not exists public.shared_payables_payment_batches (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  supplier_id text not null,
  planned_date date not null,
  currency varchar(3) not null check(currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft' check(status in ('draft','submitted','authorized','rejected','executed')),
  prepared_by uuid not null references auth.users(id) on delete restrict,
  authorized_by uuid references auth.users(id) on delete restrict,
  rejection_reason text,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,id),
  foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete restrict,
  foreign key(tenant_id,company_id,supplier_id) references public.shared_inventory_suppliers(tenant_id,company_id,id) on delete restrict,
  check(status<>'rejected' or nullif(btrim(rejection_reason),'') is not null),
  check(status<>'authorized' or authorized_by is not null)
);

create table if not exists public.shared_payables_payment_batch_items (
  tenant_id uuid not null,
  id text not null,
  company_id text not null,
  batch_id text not null,
  document_id text not null,
  amount numeric(28,8) not null check(amount>0),
  created_at timestamptz not null default now(),
  primary key(tenant_id,id),
  unique(tenant_id,batch_id,document_id),
  foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete restrict,
  foreign key(tenant_id,batch_id) references public.shared_payables_payment_batches(tenant_id,id) on delete restrict,
  foreign key(tenant_id,document_id) references public.shared_payables_documents(tenant_id,id) on delete restrict
);
create index if not exists shared_payables_batch_items_document_idx on public.shared_payables_payment_batch_items(tenant_id,document_id);

create table if not exists public.shared_payables_payments (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  supplier_id text not null,
  batch_id text,
  method text not null check(method in ('cash','check','transfer')),
  amount numeric(28,8) not null check(amount>0),
  currency varchar(3) not null check(currency ~ '^[A-Z]{3}$'),
  account_kind text not null check(account_kind in ('cash_box','bank_account')),
  account_id text not null,
  reference text,
  occurred_at date not null,
  status text not null default 'posted' check(status in ('posted','voided','reversed')),
  ledger_entry_id text not null,
  treasury_payment_id text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  reason text,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  primary key(tenant_id,id),
  unique(tenant_id,company_id,treasury_payment_id),
  foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete restrict,
  foreign key(tenant_id,company_id,supplier_id) references public.shared_inventory_suppliers(tenant_id,company_id,id) on delete restrict,
  foreign key(tenant_id,batch_id) references public.shared_payables_payment_batches(tenant_id,id) on delete restrict,
  foreign key(tenant_id,ledger_entry_id) references public.shared_treasury_ledger_entries(tenant_id,id) on delete restrict,
  check(method<>'transfer' or nullif(btrim(reference),'') is not null)
);

create table if not exists public.shared_payables_payment_lines (
  tenant_id uuid not null,
  id text not null,
  company_id text not null,
  payment_id text not null,
  document_id text not null,
  applied_amount numeric(28,8) not null check(applied_amount>0),
  debt_currency varchar(3) not null check(debt_currency ~ '^[A-Z]{3}$'),
  debt_rate numeric(28,8) not null check(debt_rate>0),
  payment_rate numeric(28,8) not null check(payment_rate>0),
  exchange_difference_ves numeric(28,8) not null default 0,
  created_at timestamptz not null default now(),
  primary key(tenant_id,id),
  foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete restrict,
  foreign key(tenant_id,payment_id) references public.shared_payables_payments(tenant_id,id) on delete restrict,
  foreign key(tenant_id,document_id) references public.shared_payables_documents(tenant_id,id) on delete restrict
);

-- These commands deliberately stop at authorization. Actual disbursement must be written by Treasury
-- in the same transaction as its ledger entry; no payable API can insert a treasury movement directly.
create or replace function public.shared_payables_batch_command(p_scope jsonb,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid; v_company text:=p_scope->>'companyId'; v_org uuid:=(p_scope->>'organizationId')::uuid;
  v_actor uuid:=(p_scope->>'actorId')::uuid; v_permission text; v_key text:=p_command->>'idempotencyKey';
  v_hash text:=md5(p_command::text); v_receipt public.shared_payables_command_receipts%rowtype;
  v_batch public.shared_payables_payment_batches%rowtype; v_document public.shared_payables_documents%rowtype;
  v_applied numeric; v_reserved numeric; v_response jsonb; v_status text;
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
      if not found or v_document.supplier_id<>v_batch.supplier_id or v_document.currency<>v_batch.currency or v_document.status<>'open' then raise exception 'PAYABLES_INVALID'; end if;
      select coalesce(sum(amount),0) into v_applied from public.shared_payables_applications where tenant_id=v_tenant and document_id=v_document.id;
      select public.shared_payables_reserved_amount(v_tenant,v_document.id) into v_reserved;
      v_reserved:=v_reserved-coalesce((select i.amount from public.shared_payables_payment_batch_items i where i.tenant_id=v_tenant and i.batch_id=v_batch.id and i.document_id=v_document.id),0);
      if coalesce((p_command->>'amount')::numeric,0)<=0 or (p_command->>'amount')::numeric>v_document.principal-v_applied-v_reserved then raise exception 'PAYABLES_EXCEEDS_BALANCE'; end if;
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

revoke all on function public.shared_payables_batch_command(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_payables_batch_command(jsonb,jsonb) to service_role;

-- Stable snapshot reports: documents, balances, supplier statement, aging, batches and payment history.
create or replace function public.shared_payables_reporting_query(p_scope jsonb,p_query jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_tenant uuid; v_rows jsonb; v_total integer; v_limit integer:=least(greatest(coalesce((p_query->>'limit')::integer,50),1),200);
  v_offset integer:=greatest(coalesce((p_query->>'offset')::integer,0),0); v_as_of date:=coalesce((p_query->>'asOf')::date,current_date);
begin
  v_tenant:=public.assert_user_security_access((p_scope->>'actorId')::uuid,(p_scope->>'organizationId')::uuid,p_scope->>'companyId','payables.read');
  if p_query->>'kind' in ('list_pending','list_settled','supplier_balance','aging','supplier_statement') then
    select count(*) into v_total from public.shared_payables_documents d
    where d.tenant_id=v_tenant and d.company_id=p_scope->>'companyId'
      and (p_query->>'supplierId' is null or d.supplier_id=p_query->>'supplierId')
      and ((p_query->>'kind'='list_pending' and d.status='open') or (p_query->>'kind'='list_settled' and d.status='settled') or p_query->>'kind' in ('supplier_balance','aging','supplier_statement'));
    select coalesce(jsonb_agg(jsonb_build_object('documentId',x.id,'supplierId',x.supplier_id,'documentNumber',x.document_number,'concept',x.concept,'kind',x.kind,'issuedAt',x.issued_at,'dueAt',x.due_at,'currency',x.currency,'principal',x.principal::text,'applied',x.applied::text,'balance',greatest(x.principal-x.applied,0)::text,'status',x.status,'daysOverdue',greatest(v_as_of-x.due_at,0)) order by x.due_at,x.id),'[]'::jsonb)
    into v_rows from (select d.*,coalesce(a.applied,0) applied from public.shared_payables_documents d
      left join lateral(select sum(ap.amount) applied from public.shared_payables_applications ap where ap.tenant_id=d.tenant_id and ap.document_id=d.id)a on true
      where d.tenant_id=v_tenant and d.company_id=p_scope->>'companyId'
        and (p_query->>'supplierId' is null or d.supplier_id=p_query->>'supplierId')
        and ((p_query->>'kind'='list_pending' and d.status='open') or (p_query->>'kind'='list_settled' and d.status='settled') or p_query->>'kind' in ('supplier_balance','aging','supplier_statement'))
      order by d.due_at,d.id offset v_offset limit v_limit)x;
    return jsonb_build_object('rows',v_rows,'total',v_total,'asOf',v_as_of);
  elsif p_query->>'kind'='payment_history' then
    select count(*) into v_total from public.shared_payables_payments p where p.tenant_id=v_tenant and p.company_id=p_scope->>'companyId'
      and (p_query->>'supplierId' is null or p.supplier_id=p_query->>'supplierId')
      and (p_query->>'from' is null or p.occurred_at>=(p_query->>'from')::date) and (p_query->>'to' is null or p.occurred_at<=(p_query->>'to')::date);
    select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'supplierId',x.supplier_id,'method',x.method,'amount',x.amount::text,'currency',x.currency,'accountKind',x.account_kind,'accountId',x.account_id,'reference',x.reference,'occurredAt',x.occurred_at,'status',x.status,'ledgerEntryId',x.ledger_entry_id,'treasuryPaymentId',x.treasury_payment_id,'applications',x.lines) order by x.occurred_at desc,x.id desc),'[]'::jsonb)
    into v_rows from (select p.*,coalesce((select jsonb_agg(jsonb_build_object('documentId',l.document_id,'amount',l.applied_amount::text,'currency',l.debt_currency,'exchangeDifferenceVes',l.exchange_difference_ves::text)) from public.shared_payables_payment_lines l where l.tenant_id=p.tenant_id and l.payment_id=p.id),'[]'::jsonb) lines
      from public.shared_payables_payments p where p.tenant_id=v_tenant and p.company_id=p_scope->>'companyId'
       and (p_query->>'supplierId' is null or p.supplier_id=p_query->>'supplierId')
       and (p_query->>'from' is null or p.occurred_at>=(p_query->>'from')::date) and (p_query->>'to' is null or p.occurred_at<=(p_query->>'to')::date)
      order by p.occurred_at desc,p.id desc offset v_offset limit v_limit)x;
    return jsonb_build_object('rows',v_rows,'total',v_total);
  elsif p_query->>'kind'='payment_batches' then
    select count(*) into v_total from public.shared_payables_payment_batches b where b.tenant_id=v_tenant and b.company_id=p_scope->>'companyId' and (p_query->>'status' is null or b.status=p_query->>'status');
    select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'supplierId',x.supplier_id,'plannedDate',x.planned_date,'currency',x.currency,'status',x.status,'version',x.version,'preparedBy',x.prepared_by,'authorizedBy',x.authorized_by,'items',x.items,'reserved',x.total::text) order by x.planned_date,x.id),'[]'::jsonb)
    into v_rows from (select b.*,coalesce((select jsonb_agg(jsonb_build_object('documentId',i.document_id,'amount',i.amount::text) order by i.document_id) from public.shared_payables_payment_batch_items i where i.tenant_id=b.tenant_id and i.batch_id=b.id),'[]'::jsonb) items,coalesce((select sum(i.amount) from public.shared_payables_payment_batch_items i where i.tenant_id=b.tenant_id and i.batch_id=b.id),0) total
      from public.shared_payables_payment_batches b where b.tenant_id=v_tenant and b.company_id=p_scope->>'companyId' and (p_query->>'status' is null or b.status=p_query->>'status') order by b.planned_date,b.id offset v_offset limit v_limit)x;
    return jsonb_build_object('rows',v_rows,'total',v_total);
  end if;
  raise exception 'PAYABLES_INVALID';
end $$;
revoke all on function public.shared_payables_reporting_query(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_payables_reporting_query(jsonb,jsonb) to service_role;

alter table public.shared_payables_documents enable row level security;
alter table public.shared_payables_installment_plans enable row level security;
alter table public.shared_payables_payment_batches enable row level security;
alter table public.shared_payables_payment_batch_items enable row level security;
alter table public.shared_payables_payments enable row level security;
alter table public.shared_payables_payment_lines enable row level security;
revoke all on public.shared_payables_installment_plans,public.shared_payables_payment_batches,public.shared_payables_payment_batch_items,public.shared_payables_payments,public.shared_payables_payment_lines from public,anon,authenticated;
grant select on public.shared_payables_payment_batches,public.shared_payables_payment_batch_items,public.shared_payables_payments,public.shared_payables_payment_lines to authenticated,service_role;

-- Reservation accounting is derived from active draft/submitted/authorized batch lines and locked per document.
create or replace function public.shared_payables_reserved_amount(p_tenant uuid,p_document text)
returns numeric language sql stable security definer set search_path=public as $$
  select coalesce(sum(i.amount),0) from public.shared_payables_payment_batch_items i
  join public.shared_payables_payment_batches b on b.tenant_id=i.tenant_id and b.id=i.batch_id
  where i.tenant_id=p_tenant and i.document_id=p_document and b.status in ('draft','submitted','authorized')
$$;

create index if not exists shared_payables_payments_supplier_date_idx on public.shared_payables_payments(tenant_id,company_id,supplier_id,occurred_at,id);

