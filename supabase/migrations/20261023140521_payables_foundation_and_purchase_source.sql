-- CXP-001/002/007: portable supplier obligations and the first purchase source.
-- Existing purchase invoices keep NULL terms and are deliberately not migrated.

alter table public.shared_inventory_suppliers
  add column if not exists default_credit_days integer not null default 0,
  add column if not exists vat_withholding_rate numeric(5,2),
  add column if not exists income_tax_supplier_type text;
create unique index if not exists shared_inventory_suppliers_company_id_unique on public.shared_inventory_suppliers(tenant_id,company_id,id);
alter table public.shared_inventory_suppliers
  add constraint shared_inventory_suppliers_credit_days_check check (default_credit_days between 0 and 3650),
  add constraint shared_inventory_suppliers_vat_withholding_rate_check check (vat_withholding_rate is null or vat_withholding_rate in (75,100));

alter table public.shared_inventory_purchase_invoices
  add column if not exists payment_terms text,
  add column if not exists credit_days integer,
  add column if not exists due_date date,
  add column if not exists currency_code varchar(3),
  add column if not exists paid_at_registration boolean not null default false;
alter table public.shared_inventory_purchase_invoices
  add constraint shared_purchase_invoice_payment_terms_check check (payment_terms is null or payment_terms in ('contado','credito')),
  add constraint shared_purchase_invoice_credit_days_check check (credit_days is null or credit_days between 0 and 3650),
  add constraint shared_purchase_invoice_currency_check check (currency_code is null or currency_code ~ '^[A-Z]{3}$');

update public.shared_inventory_purchase_invoices f
set currency_code = case when exists (
  select 1 from public.shared_inventory_purchase_invoice_items i
  where i.tenant_id=f.tenant_id and i.invoice_id=f.id and upper(i.currency)='D'
) then 'USD' else 'VES' end
where f.currency_code is null;

create table if not exists public.shared_payables_documents (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  supplier_id text not null,
  source_type text not null,
  source_id text not null,
  kind text not null check (kind in ('invoice','debit_note','manual_document')),
  document_number text not null default '',
  concept text not null default '',
  issued_at date not null,
  due_at date not null,
  currency varchar(3) not null check (currency ~ '^[A-Z]{3}$'),
  principal numeric(28,8) not null check (principal > 0),
  rate_amount numeric(28,8) not null check (rate_amount >= 0),
  rate_base_currency varchar(3) not null default 'VES' check (rate_base_currency='VES'),
  rate_value numeric(28,8) not null check (rate_value > 0),
  rate_source text not null,
  rate_effective_date date not null,
  rate_policy_version text not null,
  rate_rounding text not null default 'half_up' check (rate_rounding='half_up'),
  status text not null default 'open' check (status in ('open','settled','voided')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id,id),
  unique (tenant_id,company_id,source_type,source_id),
  foreign key (tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete restrict,
  foreign key (tenant_id,company_id,supplier_id) references public.shared_inventory_suppliers(tenant_id,company_id,id) on delete restrict,
  check (due_at >= issued_at)
);
create index if not exists shared_payables_documents_open_due_idx
  on public.shared_payables_documents(tenant_id,company_id,supplier_id,status,due_at,id);

create table if not exists public.shared_payables_due_date_changes (
  tenant_id uuid not null,
  id text not null,
  document_id text not null,
  previous_due_at date not null,
  due_at date not null,
  reason text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now(),
  primary key (tenant_id,id),
  foreign key (tenant_id,document_id) references public.shared_payables_documents(tenant_id,id) on delete restrict,
  check (length(btrim(reason))>0)
);

create table if not exists public.shared_payables_applications (
  tenant_id uuid not null,
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  document_id text not null,
  kind text not null check (kind in ('withholding_vat','withholding_islr','credit_note')),
  amount numeric(28,8) not null check (amount > 0),
  source_type text not null,
  source_id text not null,
  occurred_at date not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id,id),
  unique (tenant_id,source_type,source_id,kind),
  foreign key (tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete restrict,
  foreign key (tenant_id,document_id) references public.shared_payables_documents(tenant_id,id) on delete restrict
);

create table if not exists public.shared_payables_command_receipts (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  company_id text not null,
  idempotency_key text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  permission_code text not null,
  payload_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id,company_id,idempotency_key),
  foreign key (tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete restrict
);

alter table public.shared_payables_documents enable row level security;
alter table public.shared_payables_due_date_changes enable row level security;
alter table public.shared_payables_applications enable row level security;
alter table public.shared_payables_command_receipts enable row level security;
revoke all on public.shared_payables_documents,public.shared_payables_due_date_changes,public.shared_payables_applications,public.shared_payables_command_receipts from public,anon,authenticated;
grant select on public.shared_payables_documents,public.shared_payables_due_date_changes,public.shared_payables_applications to authenticated,service_role;

insert into public.access_control_permissions(code,resource,action,description) values
 ('payables.read','payables','read','Consultar cuentas por pagar'),
 ('payables.create','payables','create','Crear documentos de cuentas por pagar'),
 ('payables.adjust','payables','adjust','Ajustar cuentas por pagar'),
 ('payables.authorize','payables','authorize','Autorizar lotes de pago'),
 ('payables.post','payables','post','Registrar pagos a proveedores'),
 ('payables.void','payables','void','Anular pagos a proveedores'),
 ('payables.reverse','payables','reverse','Reversar pagos a proveedores')
on conflict (code) do nothing;
insert into public.organization_role_permissions(role_id,permission_code)
select r.id,p.code from public.organization_roles r
cross join (select unnest(array['payables.read','payables.create','payables.adjust','payables.authorize','payables.post','payables.void','payables.reverse']) code) p
where r.code in ('owner','admin') and r.status='active'
on conflict do nothing;

alter table public.module_catalog drop constraint if exists module_catalog_code_check;
alter table public.module_catalog add constraint module_catalog_code_check
  check (code in ('payroll','inventory','accounting','purchases','sales','tools','companies','documents','treasury','payables'));
insert into public.module_catalog(code,name,status,supported_platforms)
values ('payables','Cuentas por pagar','active',array['web','desktop','mobile']::text[])
on conflict (code) do update set name=excluded.name,status=excluded.status,supported_platforms=excluded.supported_platforms;
insert into public.module_capabilities(module_id,capability_code)
select id,unnest(array['payables.read','payables.create','payables.adjust','payables.authorize','payables.post','payables.void','payables.reverse'])
from public.module_catalog where code='payables'
on conflict do nothing;

alter table public.shared_operational_audit_trail drop constraint if exists shared_operational_audit_trail_entity_type_check;
alter table public.shared_operational_audit_trail add constraint shared_operational_audit_trail_entity_type_check
check (entity_type in ('invoice','payment_order','receivable_payment_reversal','customer','product','employee','payroll_receipt','accounting_entry','treasury_cash_box','treasury_bank','treasury_bank_account','treasury_beneficiary','treasury_ledger_entry','treasury_check','treasury_check_delivery','treasury_collection_allocation','treasury_deposit','treasury_statement','treasury_reconciliation','treasury_reconciliation_rule','treasury_reconciliation_run','treasury_payment','treasury_exchange_difference','treasury_tax_rule','treasury_tax_assessment','treasury_tax_exclusion','payable_document','payable_application','supplier_payment','payable_withholding','payment_batch'));

create or replace function public.shared_payables_execute_command(p_scope jsonb,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid; v_company text:=p_scope->>'companyId'; v_org uuid:=(p_scope->>'organizationId')::uuid;
  v_actor uuid:=(p_scope->>'actorId')::uuid; v_permission text; v_key text:=p_command->>'idempotencyKey';
  v_hash text:=md5(p_command::text); v_receipt public.shared_payables_command_receipts%rowtype;
  v_document public.shared_payables_documents%rowtype; v_response jsonb;
begin
  v_tenant:=public.assert_user_security_access(v_actor,v_org,v_company,'payables.read');
  if p_command->>'kind'='create_manual_document' then v_permission:='payables.create';
  elsif p_command->>'kind'='change_due_date' then v_permission:='payables.adjust';
  else raise exception 'PAYABLES_INVALID'; end if;
  perform public.assert_user_security_access(v_actor,v_org,v_company,v_permission);
  if v_key is null or length(btrim(v_key)) not between 1 and 200 then raise exception 'PAYABLES_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||v_company||':'||v_key,0));
  select * into v_receipt from public.shared_payables_command_receipts
    where tenant_id=v_tenant and company_id=v_company and idempotency_key=v_key for update;
  if found then
    if v_receipt.payload_hash<>v_hash then raise exception 'PAYABLES_IDEMPOTENCY_CONFLICT'; end if;
    return v_receipt.response || jsonb_build_object('replayed',true);
  end if;

  if p_command->>'kind'='create_manual_document' then
    if (p_command->>'issuedAt')::date is null or (p_command->>'dueAt')::date < (p_command->>'issuedAt')::date
      or coalesce((p_command->>'principal')::numeric,0)<=0 or p_command->>'currency' !~ '^[A-Z]{3}$'
      or coalesce(length(btrim(p_command->>'concept')),0)=0 then raise exception 'PAYABLES_INVALID'; end if;
    if not exists(select 1 from public.shared_inventory_suppliers where tenant_id=v_tenant and company_id=v_company and id=p_command->>'supplierId' and active) then raise exception 'PAYABLES_NOT_FOUND'; end if;
    insert into public.shared_payables_documents(tenant_id,id,organization_id,company_id,supplier_id,source_type,source_id,kind,document_number,concept,issued_at,due_at,currency,principal,rate_amount,rate_base_currency,rate_value,rate_source,rate_effective_date,rate_policy_version,rate_rounding)
    values(v_tenant,p_command->>'documentId',v_org,v_company,p_command->>'supplierId','manual',p_command->>'documentId','manual_document',coalesce(p_command->>'documentNumber',''),p_command->>'concept',(p_command->>'issuedAt')::date,(p_command->>'dueAt')::date,p_command->>'currency',(p_command->>'principal')::numeric,(p_command->'rateSnapshot'->>'amount')::numeric,'VES',(p_command->'rateSnapshot'->>'rate')::numeric,p_command->'rateSnapshot'->>'source',(p_command->'rateSnapshot'->>'effectiveDate')::date,p_command->'rateSnapshot'->>'policyVersion',p_command->'rateSnapshot'->>'rounding');
    v_response:=jsonb_build_object('commandId',p_command->>'documentId','replayed',false,'affectedIds',jsonb_build_array(p_command->>'documentId'),'versions',jsonb_build_object(p_command->>'documentId',1));
  else
    select * into v_document from public.shared_payables_documents where tenant_id=v_tenant and company_id=v_company and id=p_command->>'documentId' for update;
    if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
    if v_document.version<>(p_command->>'expectedVersion')::integer then raise exception 'PAYABLES_VERSION_CONFLICT'; end if;
    if v_document.status<>'open' then raise exception 'PAYABLES_INVALID'; end if;
    if (p_command->>'dueAt')::date<v_document.issued_at or coalesce(length(btrim(p_command->>'reason')),0)=0 then raise exception 'PAYABLES_INVALID'; end if;
    insert into public.shared_payables_due_date_changes(tenant_id,id,document_id,previous_due_at,due_at,reason,actor_id)
    values(v_tenant,p_command->>'changeId',v_document.id,v_document.due_at,(p_command->>'dueAt')::date,p_command->>'reason',v_actor);
    update public.shared_payables_documents set due_at=(p_command->>'dueAt')::date,version=version+1,updated_at=now() where tenant_id=v_tenant and id=v_document.id;
    v_response:=jsonb_build_object('commandId',p_command->>'changeId','replayed',false,'affectedIds',jsonb_build_array(v_document.id,p_command->>'changeId'),'versions',jsonb_build_object(v_document.id,v_document.version+1));
  end if;
  insert into public.shared_payables_command_receipts(tenant_id,company_id,idempotency_key,actor_id,permission_code,payload_hash,response)
  values(v_tenant,v_company,v_key,v_actor,v_permission,v_hash,v_response);
  return v_response;
end $$;

create or replace function public.shared_payables_query(p_scope jsonb,p_query jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_tenant uuid; v_rows jsonb; v_total integer; v_limit integer:=least(greatest(coalesce((p_query->>'limit')::integer,50),1),200); v_offset integer:=greatest(coalesce((p_query->>'offset')::integer,0),0);
begin
  v_tenant:=public.assert_user_security_access((p_scope->>'actorId')::uuid,(p_scope->>'organizationId')::uuid,p_scope->>'companyId','payables.read');
  if p_query->>'kind'<>'list_documents' then raise exception 'PAYABLES_INVALID'; end if;
  select count(*) into v_total from public.shared_payables_documents d where d.tenant_id=v_tenant and d.company_id=p_scope->>'companyId' and (p_query->>'status' is null or d.status=p_query->>'status') and (p_query->>'supplierId' is null or d.supplier_id=p_query->>'supplierId');
  select coalesce(jsonb_agg(jsonb_build_object(
    'document',jsonb_build_object('id',x.id,'supplierId',x.supplier_id,'sourceType',x.source_type,'sourceId',x.source_id,'kind',x.kind,'documentNumber',x.document_number,'concept',x.concept,'issuedAt',x.issued_at::text,'dueAt',x.due_at::text,'currency',x.currency,'principal',x.principal::text,'rateSnapshot',jsonb_build_object('amount',x.rate_amount::text,'baseCurrency',x.rate_base_currency,'rate',x.rate_value::text,'source',x.rate_source,'effectiveDate',x.rate_effective_date::text,'policyVersion',x.rate_policy_version,'rounding',x.rate_rounding),'status',x.status,'version',x.version),
    'balance',greatest(x.principal-coalesce(a.applied,0),0)::text) order by x.due_at,x.id),'[]'::jsonb)
  into v_rows from (select d.* from public.shared_payables_documents d where d.tenant_id=v_tenant and d.company_id=p_scope->>'companyId' and (p_query->>'status' is null or d.status=p_query->>'status') and (p_query->>'supplierId' is null or d.supplier_id=p_query->>'supplierId') order by d.due_at,d.id offset v_offset limit v_limit)x
  left join lateral(select sum(ap.amount) applied from public.shared_payables_applications ap where ap.tenant_id=x.tenant_id and ap.document_id=x.id)a on true;
  return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

create or replace function public.shared_payables_register_purchase_invoice()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_supplier public.shared_inventory_suppliers%rowtype; v_currency text; v_rate numeric; v_principal numeric; v_gross numeric; v_component_total numeric; v_dynamic_taxes numeric; v_reported_total numeric; v_due date; v_debt text; v_parent_id text;
begin
  if new.status<>'confirmada' or old.status='confirmada' then return new; end if;
  v_debt:=coalesce(nullif(new.document_type,''),'factura');
  if new.payment_terms is null and v_debt not in ('nota_debito','nota_credito') then return new; end if;
  if new.payment_terms='contado' and new.paid_at_registration and v_debt='factura' then return new; end if;
  select * into v_supplier from public.shared_inventory_suppliers s where s.tenant_id=new.tenant_id and s.id=new.supplier_id and s.company_id=new.company_id;
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
  v_due:=coalesce(new.due_date,(select d.due_at from public.shared_payables_documents d where d.tenant_id=new.tenant_id and d.source_type='purchase_invoice' and d.source_id=new.affected_invoice_id),new.invoice_date+coalesce(new.credit_days,v_supplier.default_credit_days,0));
  if v_debt='nota_credito' then
    v_parent_id:='purchase:'||coalesce(new.affected_invoice_id,'');
    if exists(select 1 from public.shared_payables_documents d where d.tenant_id=new.tenant_id and d.id=v_parent_id and d.company_id=new.company_id and d.supplier_id=new.supplier_id and d.currency=v_currency and d.status='open') then
      insert into public.shared_payables_applications(tenant_id,id,organization_id,company_id,document_id,kind,amount,source_type,source_id,occurred_at)
      values(new.tenant_id,'purchase-credit:'||new.id,(select c.organization_id from public.shared_companies c where c.tenant_id=new.tenant_id and c.id=new.company_id),new.company_id,v_parent_id,'credit_note',v_principal,'purchase_invoice',new.id,new.invoice_date);
      if (select coalesce(sum(a.amount),0) from public.shared_payables_applications a where a.tenant_id=new.tenant_id and a.document_id=v_parent_id)>(select d.principal from public.shared_payables_documents d where d.tenant_id=new.tenant_id and d.id=v_parent_id) then raise exception 'PAYABLES_EXCEEDS_BALANCE'; end if;
      update public.shared_payables_documents d set status=case when d.principal<=coalesce((select sum(a.amount) from public.shared_payables_applications a where a.tenant_id=d.tenant_id and a.document_id=d.id),0) then 'settled' else d.status end,version=d.version+1,updated_at=now() where d.tenant_id=new.tenant_id and d.id=v_parent_id;
    end if;
    return new;
  end if;
  insert into public.shared_payables_documents(tenant_id,id,organization_id,company_id,supplier_id,source_type,source_id,kind,document_number,concept,issued_at,due_at,currency,principal,rate_amount,rate_base_currency,rate_value,rate_source,rate_effective_date,rate_policy_version,rate_rounding)
  values(new.tenant_id,'purchase:'||new.id,(select c.organization_id from public.shared_companies c where c.tenant_id=new.tenant_id and c.id=new.company_id),new.company_id,new.supplier_id,'purchase_invoice',new.id,case when v_debt='nota_debito' then 'debit_note' else 'invoice' end,new.invoice_number,coalesce(new.notes,''),new.invoice_date,v_due,v_currency,v_principal,v_gross,'VES',v_rate,case when v_currency='VES' then 'identity' else coalesce((select r->>'source' from jsonb_array_elements(coalesce(new.exchange_rates,'[]'::jsonb)) r where upper(r->>'currencyCode')=v_currency limit 1),'purchase_invoice_snapshot') end,coalesce((select nullif(r->>'effectiveDate','')::date from jsonb_array_elements(coalesce(new.exchange_rates,'[]'::jsonb)) r where upper(r->>'currencyCode')=v_currency limit 1),new.invoice_date),'legacy_purchase_v1','half_up')
  on conflict(tenant_id,company_id,source_type,source_id) do update set status='open',document_number=excluded.document_number,concept=excluded.concept,issued_at=excluded.issued_at,due_at=excluded.due_at,currency=excluded.currency,principal=excluded.principal,rate_amount=excluded.rate_amount,rate_value=excluded.rate_value,rate_source=excluded.rate_source,rate_effective_date=excluded.rate_effective_date,rate_policy_version=excluded.rate_policy_version,version=shared_payables_documents.version+1,updated_at=now()
  where shared_payables_documents.status='voided' and not exists(select 1 from public.shared_payables_applications a where a.tenant_id=new.tenant_id and a.document_id=shared_payables_documents.id);
  if coalesce(new.vat_retention_amount,0)>0 then insert into public.shared_payables_applications(tenant_id,id,organization_id,company_id,document_id,kind,amount,source_type,source_id,occurred_at) values(new.tenant_id,'purchase-retention:'||new.id||':vat',(select c.organization_id from public.shared_companies c where c.tenant_id=new.tenant_id and c.id=new.company_id),new.company_id,'purchase:'||new.id,'withholding_vat',case when v_currency='VES' then new.vat_retention_amount else round(new.vat_retention_amount/v_rate,2) end,'purchase_invoice',new.id,new.invoice_date) on conflict(tenant_id,source_type,source_id,kind) do nothing; end if;
  if coalesce(new.income_tax_amount,0)>0 then insert into public.shared_payables_applications(tenant_id,id,organization_id,company_id,document_id,kind,amount,source_type,source_id,occurred_at) values(new.tenant_id,'purchase-retention:'||new.id||':islr',(select c.organization_id from public.shared_companies c where c.tenant_id=new.tenant_id and c.id=new.company_id),new.company_id,'purchase:'||new.id,'withholding_islr',case when v_currency='VES' then new.income_tax_amount else round(new.income_tax_amount/v_rate,2) end,'purchase_invoice',new.id,new.invoice_date) on conflict(tenant_id,source_type,source_id,kind) do nothing; end if;
  if coalesce(new.vat_retention_amount,0)+coalesce(new.income_tax_amount,0)>v_gross then raise exception 'PAYABLES_INVALID_RETENTION'; end if;
  update public.shared_payables_documents d set status='settled',version=version+1 where d.tenant_id=new.tenant_id and d.id='purchase:'||new.id and d.principal<=coalesce((select sum(a.amount) from public.shared_payables_applications a where a.tenant_id=d.tenant_id and a.document_id=d.id),0);
  return new;
end $$;

create or replace function public.shared_payables_guard_purchase_invoice_unconfirm()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.status='confirmada' and new.status<>'confirmada' then
    if exists(select 1 from public.shared_payables_applications a where a.tenant_id=old.tenant_id and a.document_id='purchase:'||old.id) then raise exception 'PAYABLES_HAS_APPLICATIONS'; end if;
    update public.shared_payables_documents set status='voided',version=version+1,updated_at=now() where tenant_id=old.tenant_id and source_type='purchase_invoice' and source_id=old.id and status='open';
  end if;
  return new;
end $$;

create or replace function public.shared_payables_guard_purchase_invoice_delete()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.shared_payables_applications a where a.tenant_id=old.tenant_id and a.document_id='purchase:'||old.id) then raise exception 'PAYABLES_HAS_APPLICATIONS'; end if;
  update public.shared_payables_documents set status='voided',version=version+1,updated_at=now()
  where tenant_id=old.tenant_id and source_type='purchase_invoice' and source_id=old.id and status='open';
  return old;
end $$;

drop trigger if exists shared_payables_purchase_invoice_confirmed on public.shared_inventory_purchase_invoices;
create trigger shared_payables_purchase_invoice_confirmed after update of status on public.shared_inventory_purchase_invoices for each row execute function public.shared_payables_register_purchase_invoice();
drop trigger if exists shared_payables_purchase_invoice_unconfirm_guard on public.shared_inventory_purchase_invoices;
create trigger shared_payables_purchase_invoice_unconfirm_guard before update of status on public.shared_inventory_purchase_invoices for each row execute function public.shared_payables_guard_purchase_invoice_unconfirm();
drop trigger if exists shared_payables_purchase_invoice_delete_guard on public.shared_inventory_purchase_invoices;
create trigger shared_payables_purchase_invoice_delete_guard before delete on public.shared_inventory_purchase_invoices for each row execute function public.shared_payables_guard_purchase_invoice_delete();
drop trigger if exists operational_audit_shared_payables_documents on public.shared_payables_documents;
create trigger operational_audit_shared_payables_documents after insert or update or delete on public.shared_payables_documents for each row execute function public.append_operational_audit_trigger('payable_document','direct');
drop trigger if exists operational_audit_shared_payables_applications on public.shared_payables_applications;
create trigger operational_audit_shared_payables_applications after insert or update or delete on public.shared_payables_applications for each row execute function public.append_operational_audit_trigger('payable_application','direct');

revoke all on function public.shared_payables_execute_command(jsonb,jsonb),public.shared_payables_query(jsonb,jsonb),public.shared_payables_register_purchase_invoice(),public.shared_payables_guard_purchase_invoice_unconfirm(),public.shared_payables_guard_purchase_invoice_delete() from public,anon,authenticated;
grant execute on function public.shared_payables_execute_command(jsonb,jsonb),public.shared_payables_query(jsonb,jsonb) to service_role;
