-- CXP-031 (corte 5): supplier payments as an accounting-integration source.
-- Rules reuse shared_accounting_integration_rules and the versioned native rule
-- configuration; each posted payment produces one immutable journal and each
-- void/reverse produces a compensating journal. Nothing is posted while the
-- company has no active payables rules.

alter table public.shared_accounting_integration_rules drop constraint if exists shared_accounting_integration_rules_source_check;
alter table public.shared_accounting_integration_rules add constraint shared_accounting_integration_rules_source_check
  check (source in ('payroll','inventory_purchase','inventory_movement','payables_payment'));
alter table public.shared_accounting_entries drop constraint if exists shared_accounting_entries_source_check;
alter table public.shared_accounting_entries add constraint shared_accounting_entries_source_check
  check (source in ('manual','payroll','inventory','payables'));
alter table public.shared_native_accounting_rule_config_events drop constraint if exists shared_native_accounting_rule_config_events_source_check;
alter table public.shared_native_accounting_rule_config_events add constraint shared_native_accounting_rule_config_events_source_check
  check (source in ('payroll','inventory_purchase','payables_payment'));

create or replace function public.native_accounting_rule_configuration_json(
  p_tenant_id uuid,p_company_id text,p_source text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_rules jsonb; v_revision_rows jsonb; v_portable_source text;
begin
  if p_source not in ('payroll','inventory_purchase','payables_payment') then
    raise exception 'NATIVE_ACCOUNTING_RULE_CONFIGURATION_INVALID'; end if;
  v_portable_source:=case p_source when 'payroll' then 'payroll.run_confirmed'
    when 'payables_payment' then 'payables.payment_posted'
    else 'purchasing.invoice_confirmed' end;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'amountField',r.amount_field,
    'debitAccountId',r.debit_account_id,
    'creditAccountId',r.credit_account_id,
    'description',r.description,'isActive',r.is_active
  ) order by r.id),'[]'::jsonb),
  coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'amountField',r.amount_field,
    'debitAccountId',r.debit_account_id,
    'creditAccountId',r.credit_account_id,
    'description',r.description,'isActive',r.is_active,
    'updatedAt',to_char(r.updated_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  ) order by r.id),'[]'::jsonb)
  into v_rules,v_revision_rows
  from public.shared_accounting_integration_rules r
  where r.tenant_id=p_tenant_id and r.company_id=p_company_id
    and r.source=p_source;
  return jsonb_build_object('source',v_portable_source,
    'version',md5(v_revision_rows::text),'rules',v_rules);
end;
$$;

create or replace function public.get_native_accounting_rule_configuration(
  p_actor_id uuid,p_organization_id uuid,p_company_id text,p_source text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_db_source text;
begin
  if p_actor_id is null or p_organization_id is null or p_company_id is null
    or length(trim(p_company_id)) not between 1 and 128 then
    raise exception 'NATIVE_ACCOUNTING_RULE_CONFIGURATION_INVALID'; end if;
  v_db_source:=case p_source
    when 'payroll.run_confirmed' then 'payroll'
    when 'purchasing.invoice_confirmed' then 'inventory_purchase'
    when 'payables.payment_posted' then 'payables_payment'
    else null end;
  if v_db_source is null then
    raise exception 'NATIVE_ACCOUNTING_RULE_CONFIGURATION_INVALID'; end if;
  v_tenant:=public.assert_user_security_access(
    p_actor_id,p_organization_id,trim(p_company_id),'accounting.read');
  if not exists(select 1 from public.shared_companies c
    where c.tenant_id=v_tenant and c.organization_id=p_organization_id
      and c.id=trim(p_company_id) and c.status='active') then
    raise exception 'NATIVE_ACCOUNTING_RULE_CONFIGURATION_ACCESS_DENIED'; end if;
  return public.native_accounting_rule_configuration_json(
    v_tenant,trim(p_company_id),v_db_source);
end;
$$;

create or replace function public.replace_native_accounting_rule_configuration(
  p_actor_id uuid,p_organization_id uuid,p_company_id text,p_source text,
  p_expected_version text,p_rules jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid; v_company text:=trim(p_company_id); v_db_source text;
  v_before jsonb; v_after jsonb; v_rule jsonb;
  v_ids text[]:='{}'; v_id text; v_debit text; v_credit text;
  v_description text; v_amount_field text; v_active boolean;
begin
  if p_actor_id is null or p_organization_id is null or p_company_id is null
    or length(v_company) not between 1 and 128
    or p_expected_version is null or p_expected_version !~ '^[0-9a-f]{32}$'
    or p_rules is null or jsonb_typeof(p_rules) is distinct from 'array'
    or jsonb_array_length(p_rules)>32
  then raise exception 'NATIVE_ACCOUNTING_RULE_CONFIGURATION_INVALID'; end if;
  v_db_source:=case p_source
    when 'payroll.run_confirmed' then 'payroll'
    when 'purchasing.invoice_confirmed' then 'inventory_purchase'
    when 'payables.payment_posted' then 'payables_payment'
    else null end;
  if v_db_source is null then
    raise exception 'NATIVE_ACCOUNTING_RULE_CONFIGURATION_INVALID'; end if;
  v_tenant:=public.assert_user_security_access(
    p_actor_id,p_organization_id,v_company,'accounting.update');
  if public.assert_user_security_access(
    p_actor_id,p_organization_id,v_company,'accounting.read') is distinct from v_tenant
  then raise exception 'NATIVE_ACCOUNTING_RULE_CONFIGURATION_ACCESS_DENIED'; end if;
  perform 1 from public.shared_companies c
  where c.tenant_id=v_tenant and c.organization_id=p_organization_id
    and c.id=v_company and c.status='active' for update;
  if not found then raise exception 'NATIVE_ACCOUNTING_RULE_CONFIGURATION_ACCESS_DENIED'; end if;
  -- Matches the posting lock order and blocks FK-backed concurrent inserts.
  perform 1 from public.shared_accounting_integration_rules r
  where r.tenant_id=v_tenant and r.company_id=v_company
    and r.source=v_db_source for update;
  perform 1 from public.shared_accounting_accounts a
  where a.tenant_id=v_tenant and a.company_id=v_company for share;
  v_before:=public.native_accounting_rule_configuration_json(
    v_tenant,v_company,v_db_source);
  if v_before->>'version' is distinct from p_expected_version then
    raise exception 'NATIVE_ACCOUNTING_RULE_CONFIGURATION_STALE'; end if;

  for v_rule in select value from jsonb_array_elements(p_rules) loop
    if jsonb_typeof(v_rule)<>'object' or exists(
      select 1 from jsonb_object_keys(v_rule) key where key not in (
        'id','amountField','debitAccountId','creditAccountId','description','isActive'))
    then raise exception 'NATIVE_ACCOUNTING_RULE_CONFIGURATION_INVALID'; end if;
    v_id:=trim(v_rule->>'id');
    v_debit:=trim(v_rule->>'debitAccountId');
    v_credit:=trim(v_rule->>'creditAccountId');
    v_description:=trim(v_rule->>'description');
    v_amount_field:=v_rule->>'amountField';
    if jsonb_typeof(v_rule->'isActive')<>'boolean' then
      raise exception 'NATIVE_ACCOUNTING_RULE_CONFIGURATION_INVALID'; end if;
    v_active:=(v_rule->>'isActive')::boolean;
    if coalesce(length(v_id),0) not between 1 and 128
      or coalesce(length(v_debit),0) not between 1 and 128
      or coalesce(length(v_credit),0) not between 1 and 128
      or v_debit=v_credit or v_description is null
      or length(v_description)>500
      or v_id=any(v_ids)
      or (v_db_source='payroll' and coalesce(v_amount_field,'') not in (
        'gross_earnings','employee_deductions','net_pay'))
      or (v_db_source='inventory_purchase'
        and v_amount_field is distinct from 'recognized_inventory_cost')
      or (v_db_source='payables_payment' and coalesce(v_amount_field,'') not in (
        'payment_amount','withholding_vat','withholding_islr','exchange_loss','exchange_gain'))
    then raise exception 'NATIVE_ACCOUNTING_RULE_CONFIGURATION_INVALID'; end if;
    if exists(select 1 from public.shared_accounting_integration_rules r
      where r.tenant_id=v_tenant and r.id=v_id
        and (r.source<>v_db_source or r.company_id<>v_company))
      or not exists(select 1 from public.shared_accounting_accounts a
        where a.tenant_id=v_tenant and a.company_id=v_company
          and a.id=v_debit and a.is_active and not a.is_group)
      or not exists(select 1 from public.shared_accounting_accounts a
        where a.tenant_id=v_tenant and a.company_id=v_company
          and a.id=v_credit and a.is_active and not a.is_group)
    then raise exception 'NATIVE_ACCOUNTING_RULE_CONFIGURATION_ACCOUNT_INVALID'; end if;
    v_ids:=array_append(v_ids,v_id);
  end loop;
  delete from public.shared_accounting_integration_rules r
  where r.tenant_id=v_tenant and r.company_id=v_company
    and r.source=v_db_source and not (r.id=any(v_ids));
  for v_rule in select value from jsonb_array_elements(p_rules) loop
    v_id:=trim(v_rule->>'id');
    insert into public.shared_accounting_integration_rules(
      tenant_id,id,company_id,source,debit_account_id,credit_account_id,
      amount_field,description,is_active,updated_at
    ) values(v_tenant,v_id,v_company,v_db_source,
      trim(v_rule->>'debitAccountId'),trim(v_rule->>'creditAccountId'),
      v_rule->>'amountField',trim(v_rule->>'description'),
      (v_rule->>'isActive')::boolean,clock_timestamp())
    on conflict (tenant_id,id) do update set
      debit_account_id=excluded.debit_account_id,
      credit_account_id=excluded.credit_account_id,
      amount_field=excluded.amount_field,
      description=excluded.description,is_active=excluded.is_active,
      updated_at=excluded.updated_at;
  end loop;
  v_after:=public.native_accounting_rule_configuration_json(
    v_tenant,v_company,v_db_source);
  insert into public.shared_native_accounting_rule_config_events(
    tenant_id,organization_id,company_id,source,previous_version,
    resulting_version,previous_rules,resulting_rules,changed_by
  ) values(v_tenant,p_organization_id,v_company,v_db_source,
    v_before->>'version',v_after->>'version',v_before->'rules',
    v_after->'rules',p_actor_id);
  return v_after;
end;
$$;

create table if not exists public.shared_payables_accounting_posts (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  payment_id text not null,
  journal_entry_id text not null,
  plan jsonb not null,
  fingerprint text not null,
  reversal_entry_id text,
  reversed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (tenant_id,journal_entry_id),
  foreign key (tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete restrict,
  foreign key (tenant_id,payment_id) references public.shared_payables_payments(tenant_id,id) on delete restrict,
  foreign key (tenant_id,journal_entry_id) references public.shared_accounting_entries(tenant_id,id) on delete restrict,
  foreign key (tenant_id,reversal_entry_id) references public.shared_accounting_entries(tenant_id,id) on delete restrict,
  check ((reversal_entry_id is null)=(reversed_at is null))
);
create unique index if not exists shared_payables_accounting_posts_active_idx on public.shared_payables_accounting_posts(tenant_id,payment_id) where reversed_at is null;
alter table public.shared_payables_accounting_posts enable row level security;
revoke all on public.shared_payables_accounting_posts from public,anon,authenticated;

-- Expected balanced lines for one payment from its persisted facts and the active
-- rules. Amounts are VES: the disbursement's operational value, withholdings and
-- realized exchange differences (decision 4).
create or replace function public.shared_payables_accounting_plan(p_tenant uuid,p_company text,p_payment text)
returns jsonb language sql stable security definer set search_path=public as $$
  with p as (select * from public.shared_payables_payments where tenant_id=p_tenant and company_id=p_company and id=p_payment),
  amounts as (select 'payment_amount' field,(select operational_amount_ves from p) amount
    union all select 'withholding_vat',coalesce((select sum(w.amount_ves) from public.shared_payables_withholdings w where w.tenant_id=p_tenant and w.payment_id=p_payment and w.kind='vat'),0)
    union all select 'withholding_islr',coalesce((select sum(w.amount_ves) from public.shared_payables_withholdings w where w.tenant_id=p_tenant and w.payment_id=p_payment and w.kind='islr'),0)
    union all select 'exchange_loss',coalesce((select sum(l.exchange_difference_ves) from public.shared_payables_payment_lines l where l.tenant_id=p_tenant and l.payment_id=p_payment and l.exchange_difference_ves>0),0)
    union all select 'exchange_gain',coalesce((select -sum(l.exchange_difference_ves) from public.shared_payables_payment_lines l where l.tenant_id=p_tenant and l.payment_id=p_payment and l.exchange_difference_ves<0),0))
  select coalesce(jsonb_agg(line order by line->>'ruleId',line->>'side' desc),'[]'::jsonb) from (
    select jsonb_build_object('ruleId',r.id,'side','debit','accountId',r.debit_account_id,'amount',round(a.amount,2)::text,'description',r.description) line
      from public.shared_accounting_integration_rules r join amounts a on a.field=r.amount_field
      where r.tenant_id=p_tenant and r.company_id=p_company and r.source='payables_payment' and r.is_active and round(a.amount,2)>0
    union all
    select jsonb_build_object('ruleId',r.id,'side','credit','accountId',r.credit_account_id,'amount',round(a.amount,2)::text,'description',r.description)
      from public.shared_accounting_integration_rules r join amounts a on a.field=r.amount_field
      where r.tenant_id=p_tenant and r.company_id=p_company and r.source='payables_payment' and r.is_active and round(a.amount,2)>0) x
$$;

create or replace function public.shared_payables_insert_journal(p_tenant uuid,p_company text,p_entry text,p_date date,p_description text,p_lines jsonb,p_reverse boolean,p_payment text)
returns void language plpgsql security definer set search_path=public as $$
declare v_period public.shared_accounting_periods%rowtype; v_number integer; v_line jsonb;
begin
  select * into v_period from public.shared_accounting_periods p where p.tenant_id=p_tenant and p.company_id=p_company and p.status='open'
    and p_date between p.start_date and p.end_date order by p.start_date,p.id limit 1 for update;
  if not found then raise exception 'PAYABLES_PERIOD_CLOSED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||p_company||':'||v_period.id,0));
  select coalesce(max(e.entry_number),0)+1 into v_number from public.shared_accounting_entries e where e.tenant_id=p_tenant and e.company_id=p_company and e.period_id=v_period.id;
  insert into public.shared_accounting_entries(tenant_id,id,company_id,period_id,entry_number,entry_date,description,status,source,source_ref,posted_at,created_at,updated_at)
    values(p_tenant,p_entry,p_company,v_period.id,v_number,p_date,p_description,'posted','payables',p_payment,clock_timestamp(),clock_timestamp(),clock_timestamp());
  for v_line in select value from jsonb_array_elements(p_lines) loop
    insert into public.shared_accounting_entry_lines(tenant_id,id,entry_id,account_id,type,amount,description)
      values(p_tenant,p_entry||':'||(v_line->>'ruleId')||':'||(v_line->>'side'),p_entry,v_line->>'accountId',
        case when p_reverse then case when v_line->>'side'='debit' then 'credit' else 'debit' end else v_line->>'side' end,(v_line->>'amount')::numeric,v_line->>'description');
  end loop;
end $$;

create or replace function public.shared_payables_accounting_command(p_scope jsonb,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid; v_company text:=p_scope->>'companyId'; v_org uuid:=(p_scope->>'organizationId')::uuid; v_actor uuid:=(p_scope->>'actorId')::uuid;
  v_payment public.shared_payables_payments%rowtype; v_post public.shared_payables_accounting_posts%rowtype; v_lines jsonb; v_entry text; v_debits numeric; v_credits numeric;
begin
  v_tenant:=public.assert_user_security_access(v_actor,v_org,v_company,'payables.read');
  if public.assert_user_security_access(v_actor,v_org,v_company,'accounting.post') is distinct from v_tenant then raise exception 'PAYABLES_FORBIDDEN'; end if;
  if p_command->>'kind' not in ('post_payment_accounting','reverse_payment_accounting') then raise exception 'PAYABLES_INVALID'; end if;
  select * into v_payment from public.shared_payables_payments where tenant_id=v_tenant and company_id=v_company and id=p_command->>'paymentId' for update;
  if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
  select * into v_post from public.shared_payables_accounting_posts where tenant_id=v_tenant and payment_id=v_payment.id and reversed_at is null for update;
  if p_command->>'kind'='post_payment_accounting' then
    -- Idempotent: an active journal for the payment is returned as is.
    if found then return jsonb_build_object('commandId',v_payment.id,'affectedIds',jsonb_build_array(v_post.journal_entry_id),'versions','{}'::jsonb,'journalEntryId',v_post.journal_entry_id,'replayed',true); end if;
    if v_payment.status<>'posted' then raise exception 'PAYABLES_INVALID'; end if;
    v_lines:=public.shared_payables_accounting_plan(v_tenant,v_company,v_payment.id);
    if jsonb_array_length(v_lines)=0 then raise exception 'PAYABLES_ACCOUNTING_RULES_MISSING'; end if;
    select sum((l->>'amount')::numeric) filter (where l->>'side'='debit'),sum((l->>'amount')::numeric) filter (where l->>'side'='credit') into v_debits,v_credits from jsonb_array_elements(v_lines) l;
    if v_debits<>v_credits then raise exception 'PAYABLES_INVALID'; end if;
    v_entry:='payables-payment-'||md5(v_tenant::text||':'||v_payment.id||':'||(select count(*) from public.shared_payables_accounting_posts x where x.tenant_id=v_tenant and x.payment_id=v_payment.id));
    perform public.shared_payables_insert_journal(v_tenant,v_company,v_entry,v_payment.occurred_at,'Pago a proveedor '||v_payment.id,v_lines,false,v_payment.id);
    insert into public.shared_payables_accounting_posts(tenant_id,organization_id,company_id,payment_id,journal_entry_id,plan,fingerprint,created_by)
      values(v_tenant,v_org,v_company,v_payment.id,v_entry,v_lines,md5(v_lines::text),v_actor);
    insert into public.shared_accounting_integration_log(tenant_id,id,company_id,source,source_ref,entry_id,status,error_message,created_at)
      values(v_tenant,v_entry,v_company,'payables_payment',v_payment.id,v_entry,'success',null,clock_timestamp());
    return jsonb_build_object('commandId',v_payment.id,'affectedIds',jsonb_build_array(v_entry),'versions','{}'::jsonb,'journalEntryId',v_entry,'replayed',false);
  end if;
  -- A void or reverse of the payment is mirrored by a compensating journal on its own date.
  if not found then raise exception 'PAYABLES_NOT_FOUND'; end if;
  if v_payment.status='posted' then raise exception 'PAYABLES_INVALID'; end if;
  v_entry:=v_post.journal_entry_id||':reversal';
  perform public.shared_payables_insert_journal(v_tenant,v_company,v_entry,v_payment.reversal_date,'Reverso de pago a proveedor '||v_payment.id,v_post.plan,true,v_payment.id);
  update public.shared_payables_accounting_posts set reversal_entry_id=v_entry,reversed_at=now() where tenant_id=v_tenant and journal_entry_id=v_post.journal_entry_id;
  insert into public.shared_accounting_integration_log(tenant_id,id,company_id,source,source_ref,entry_id,status,error_message,created_at)
    values(v_tenant,v_entry,v_company,'payables_payment',v_payment.id,v_entry,'success',null,clock_timestamp());
  return jsonb_build_object('commandId',v_payment.id,'affectedIds',jsonb_build_array(v_entry),'versions','{}'::jsonb,'journalEntryId',v_entry,'replayed',false);
end $$;

-- CXP-031 query: per payment, whether its journal exists and still matches the
-- facts. `rulesActive=false` tells clients to keep the view hidden.
create or replace function public.shared_payables_accounting_reconciliation(p_scope jsonb,p_query jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_tenant uuid; v_company text:=p_scope->>'companyId'; v_rows jsonb; v_total integer; v_active boolean;
  v_limit integer:=least(greatest(coalesce((p_query->>'limit')::integer,50),1),200); v_offset integer:=greatest(coalesce((p_query->>'offset')::integer,0),0);
begin
  v_tenant:=public.assert_user_security_read_access((p_scope->>'actorId')::uuid,(p_scope->>'organizationId')::uuid,v_company,'payables.read');
  select exists(select 1 from public.shared_accounting_integration_rules r where r.tenant_id=v_tenant and r.company_id=v_company and r.source='payables_payment' and r.is_active) into v_active;
  with rows as (
    select p.*,post.journal_entry_id,post.reversal_entry_id,post.plan,
      (select e.entry_number from public.shared_accounting_entries e where e.tenant_id=p.tenant_id and e.id=post.journal_entry_id) entry_number,
      (select coalesce(sum(l.amount),0) from public.shared_accounting_entry_lines l where l.tenant_id=p.tenant_id and l.entry_id=post.journal_entry_id and l.type='debit') journal_debits,
      public.shared_payables_accounting_plan(p.tenant_id,p.company_id,p.id) expected
    from public.shared_payables_payments p
    left join lateral (select * from public.shared_payables_accounting_posts x where x.tenant_id=p.tenant_id and x.payment_id=p.id order by x.created_at desc limit 1) post on true
    where p.tenant_id=v_tenant and p.company_id=v_company
      and (p_query->>'from' is null or p.occurred_at>=(p_query->>'from')::date) and (p_query->>'to' is null or p.occurred_at<=(p_query->>'to')::date)),
  classified as (select r.*,case
      when r.journal_entry_id is null then 'sin_asiento'
      when r.status<>'posted' and r.reversal_entry_id is null then 'diferencia'
      when r.status='posted' and r.plan is distinct from r.expected then 'diferencia'
      else 'contabilizado' end state from rows r)
  select (select count(*) from classified),coalesce(jsonb_agg(jsonb_build_object('paymentId',c.id,'occurredAt',c.occurred_at,'status',c.status,'amount',c.amount::text,'currency',c.currency,'operationalAmountVes',c.operational_amount_ves::text,
      'state',c.state,'journalEntryId',c.journal_entry_id,'entryNumber',c.entry_number,'reversalEntryId',c.reversal_entry_id,'journalDebits',c.journal_debits::text,
      'expectedDebits',(select coalesce(sum((l->>'amount')::numeric),0) from jsonb_array_elements(c.expected) l where l->>'side'='debit')::text) order by c.occurred_at desc,c.id desc),'[]'::jsonb)
    into v_total,v_rows from (select * from classified order by occurred_at desc,id desc offset v_offset limit v_limit) c;
  return jsonb_build_object('rows',v_rows,'total',v_total,'rulesActive',v_active);
end $$;

revoke all on function public.shared_payables_accounting_plan(uuid,text,text),public.shared_payables_insert_journal(uuid,text,text,date,text,jsonb,boolean,text),
  public.shared_payables_accounting_command(jsonb,jsonb),public.shared_payables_accounting_reconciliation(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_payables_accounting_command(jsonb,jsonb),public.shared_payables_accounting_reconciliation(jsonb,jsonb) to service_role;
revoke all on function public.native_accounting_rule_configuration_json(uuid,text,text),
  public.get_native_accounting_rule_configuration(uuid,uuid,text,text),
  public.replace_native_accounting_rule_configuration(uuid,uuid,text,text,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.get_native_accounting_rule_configuration(uuid,uuid,text,text),
  public.replace_native_accounting_rule_configuration(uuid,uuid,text,text,text,jsonb)
  to service_role;
