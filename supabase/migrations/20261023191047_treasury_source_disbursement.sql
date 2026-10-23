-- Treasury-owned private writer for disbursements initiated by another context
-- (ADR 0046, decision 5). Payables calls these functions inside its own
-- transaction, so a supplier payment and its treasury debit commit or fail
-- together while Treasury stays the only writer of its tables. The schema is not
-- exposed to API roles; only SECURITY DEFINER functions owned by the database
-- owner can call into it.

create schema if not exists treasury_private;
revoke all on schema treasury_private from public,anon,authenticated;

-- Debits a cash box (cash), a bank account (transfer) or issues the next check of
-- a checkbook (single debit at issue, ADR 0043). Availability, currency and IDB
-- rules are the same ones the Treasury command boundary enforces.
create or replace function treasury_private.post_source_disbursement(p_tenant uuid,p_company text,p_request jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_account jsonb:=p_request->'account'; v_money jsonb:=p_request->'money'; v_method text:=p_request->>'method';
  v_source text:=p_request->>'sourceId'; v_source_type text:=coalesce(p_request->>'sourceType','supplier_payment');
  v_ledger text; v_date date:=(p_request->>'operationalDate')::date; v_concept text:=coalesce(nullif(btrim(p_request->>'concept'),''),'Pago a proveedor');
  v_version integer; v_allow boolean; v_balance numeric; v_checkbook public.shared_treasury_checkbooks%rowtype;
  v_beneficiary public.shared_treasury_beneficiaries%rowtype; v_beneficiary_id text; v_check text;
begin
  if v_method is null or v_method not in ('cash','transfer','check') or v_account is null
    or (v_method='cash' and v_account->>'kind'<>'cash_box') or (v_method<>'cash' and v_account->>'kind'<>'bank_account')
    or not public.treasury_money_valid(v_money) or v_date is null or coalesce(length(btrim(v_source)),0)=0 then
    raise exception 'TREASURY_INVALID';
  end if;
  if v_method='transfer' and coalesce(length(btrim(p_request->>'reference')),0)=0 then raise exception 'TREASURY_INVALID'; end if;
  v_ledger:=v_source||':disbursement';
  if v_account->>'kind'='cash_box' then
    select version into v_version from public.shared_treasury_cash_boxes where tenant_id=p_tenant and company_id=p_company and id=v_account->>'id' and currency=v_money->>'currency' and status='active' for update;
    v_allow:=false;
  else
    select version,allow_overdraft into v_version,v_allow from public.shared_treasury_bank_accounts where tenant_id=p_tenant and company_id=p_company and id=v_account->>'id' and currency=v_money->>'currency' and status='active' for update;
  end if;
  if v_version is null then raise exception 'TREASURY_NOT_FOUND'; end if;
  select coalesce(sum(case when direction='credit' then amount else -amount end),0) into v_balance from public.shared_treasury_ledger_entries
    where tenant_id=p_tenant and company_id=p_company and account_kind=v_account->>'kind' and account_id=v_account->>'id' and currency=v_money->>'currency' and status in ('posted','reversed');
  if v_balance<(v_money->>'amount')::numeric and not coalesce(v_allow,false) then raise exception 'TREASURY_INSUFFICIENT_FUNDS'; end if;
  if v_method='check' then
    select * into v_checkbook from public.shared_treasury_checkbooks where tenant_id=p_tenant and company_id=p_company and id=p_request->>'checkbookId' and bank_account_id=v_account->>'id' and status='active' for update;
    if not found or v_checkbook.next_number>v_checkbook.last_number then raise exception 'TREASURY_NOT_FOUND'; end if;
    -- The supplier becomes a Treasury beneficiary identified by its tax id.
    select * into v_beneficiary from public.shared_treasury_beneficiaries where tenant_id=p_tenant and company_id=p_company and tax_identifier=nullif(btrim(p_request->'beneficiary'->>'taxIdentifier'),'');
    if found then
      if v_beneficiary.status<>'active' then raise exception 'TREASURY_CONFLICT'; end if;
      v_beneficiary_id:=v_beneficiary.id;
    else
      v_beneficiary_id:='supplier:'||(p_request->'beneficiary'->>'supplierId');
      insert into public.shared_treasury_beneficiaries(tenant_id,id,company_id,legal_name,tax_identifier)
        values(p_tenant,v_beneficiary_id,p_company,coalesce(nullif(btrim(p_request->'beneficiary'->>'legalName'),''),'Proveedor'),nullif(btrim(p_request->'beneficiary'->>'taxIdentifier'),''))
        on conflict (tenant_id,id) do nothing;
    end if;
    v_check:=v_source||':check';
    perform public.treasury_insert_ledger(p_tenant,p_company,p_request,v_ledger,v_account,'debit',v_money,v_date,v_date,v_concept,'check_issue',jsonb_build_object('type',v_source_type,'id',v_source,'lineId','disbursement'));
    insert into public.shared_treasury_checks(tenant_id,id,company_id,checkbook_id,bank_account_id,number,beneficiary_id,beneficiary_snapshot,amount,currency,issue_date,concept,ledger_entry_id)
      values(p_tenant,v_check,p_company,v_checkbook.id,v_account->>'id',v_checkbook.next_number,v_beneficiary_id,coalesce(nullif(btrim(p_request->'beneficiary'->>'legalName'),''),'Proveedor'),(v_money->>'amount')::numeric,v_money->>'currency',v_date,v_concept,v_ledger);
    update public.shared_treasury_checkbooks set next_number=next_number+1,version=version+1,status=case when next_number=last_number then 'closed' else status end
      where tenant_id=p_tenant and id=v_checkbook.id;
  else
    perform public.treasury_insert_ledger(p_tenant,p_company,p_request,v_ledger,v_account,'debit',v_money,v_date,v_date,
      case when v_method='transfer' then v_concept||' · Ref. '||btrim(p_request->>'reference') else v_concept end,
      case when v_method='transfer' then 'bank_debit' else 'supplier_payment' end,jsonb_build_object('type',v_source_type,'id',v_source,'lineId','disbursement'));
  end if;
  if v_account->>'kind'='cash_box' then update public.shared_treasury_cash_boxes set version=version+1,updated_at=now() where tenant_id=p_tenant and id=v_account->>'id';
  else update public.shared_treasury_bank_accounts set version=version+1,updated_at=now() where tenant_id=p_tenant and id=v_account->>'id'; end if;
  return jsonb_build_object('ledgerEntryId',v_ledger,'checkId',v_check,'checkNumber',case when v_check is null then null else v_checkbook.next_number::text end);
end $$;

create or replace function treasury_private.reverse_entry(p_tenant uuid,p_company text,p_entry public.shared_treasury_ledger_entries,p_date date,p_reason text)
returns text language plpgsql security definer set search_path=public as $$
declare v_id text:=p_entry.id||':reversal';
begin
  perform public.treasury_insert_ledger(p_tenant,p_company,'{}'::jsonb,v_id,jsonb_build_object('kind',p_entry.account_kind,'id',p_entry.account_id),
    case when p_entry.direction='credit' then 'debit' else 'credit' end,
    jsonb_build_object('amount',p_entry.amount::text,'currency',p_entry.currency,'operationalValue',jsonb_build_object('baseCurrency','VES','amount',p_entry.operational_amount::text,'rate',p_entry.operational_rate::text,'source',p_entry.operational_source,'asOf',p_entry.operational_as_of,'policyVersion',p_entry.operational_policy_version,'rounding',p_entry.operational_rounding)),
    p_date,p_date,p_reason,'reversal',null,p_entry.id);
  update public.shared_treasury_ledger_entries set status='reversed',version=version+1 where tenant_id=p_tenant and id=p_entry.id;
  if p_entry.account_kind='cash_box' then update public.shared_treasury_cash_boxes set version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_entry.account_id;
  else update public.shared_treasury_bank_accounts set version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_entry.account_id; end if;
  return v_id;
end $$;

-- `void` cancels an unreconciled disbursement as if the bank never processed it
-- (its IDB is reversed too); `reverse` compensates a processed one on its own
-- date (for example a returned check) and keeps the tax. Either way the check
-- is voided and its number is never reused.
create or replace function treasury_private.reverse_source_disbursement(p_tenant uuid,p_company text,p_ledger_entry text,p_mode text,p_date date,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_entry public.shared_treasury_ledger_entries%rowtype; v_tax public.shared_treasury_ledger_entries%rowtype; v_check public.shared_treasury_checks%rowtype; v_reversal text; v_tax_reversal text;
begin
  if p_mode not in ('void','reverse') or p_date is null or coalesce(length(btrim(p_reason)),0)=0 then raise exception 'TREASURY_INVALID'; end if;
  select * into v_entry from public.shared_treasury_ledger_entries where tenant_id=p_tenant and company_id=p_company and id=p_ledger_entry for update;
  if not found then raise exception 'TREASURY_NOT_FOUND'; end if;
  if v_entry.status<>'posted' or exists(select 1 from public.shared_treasury_ledger_entries r where r.tenant_id=p_tenant and r.reversal_of_id=v_entry.id) then raise exception 'TREASURY_CONFLICT'; end if;
  if p_mode='void' and exists(select 1 from public.shared_treasury_reconciliation_matches m where m.tenant_id=p_tenant and m.ledger_entry_id=v_entry.id and m.status='active') then raise exception 'TREASURY_RECONCILED'; end if;
  select * into v_check from public.shared_treasury_checks where tenant_id=p_tenant and ledger_entry_id=v_entry.id for update;
  if found then
    if p_mode='void' and v_check.status='cleared' then raise exception 'TREASURY_RECONCILED'; end if;
    update public.shared_treasury_checks set status='voided',version=version+1 where tenant_id=p_tenant and id=v_check.id;
  end if;
  v_reversal:=treasury_private.reverse_entry(p_tenant,p_company,v_entry,p_date,p_reason);
  if p_mode='void' then
    select * into v_tax from public.shared_treasury_ledger_entries where tenant_id=p_tenant and company_id=p_company and movement_type='bank_debit_tax' and source_id=v_entry.id and status='posted' for update;
    if found then v_tax_reversal:=treasury_private.reverse_entry(p_tenant,p_company,v_tax,p_date,p_reason); end if;
  end if;
  return jsonb_build_object('reversalEntryId',v_reversal,'taxReversalEntryId',v_tax_reversal,'checkId',v_check.id);
end $$;

-- Read used by payables before voiding: a reconciled debit can only be reversed.
create or replace function treasury_private.is_reconciled(p_tenant uuid,p_ledger_entry text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.shared_treasury_reconciliation_matches m where m.tenant_id=p_tenant and m.ledger_entry_id=p_ledger_entry and m.status='active')
    or exists(select 1 from public.shared_treasury_checks c where c.tenant_id=p_tenant and c.ledger_entry_id=p_ledger_entry and c.status='cleared')
$$;

revoke all on all functions in schema treasury_private from public,anon,authenticated;
