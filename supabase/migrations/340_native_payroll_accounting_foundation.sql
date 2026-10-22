-- ADM-035/ADM-036: immutable, idempotent accounting postings for confirmed payroll.
--
-- This is intentionally separate from the legacy Web accounting RPCs.  It uses
-- public.shared_* tables as the source of truth and only accepts values which
-- can be reproduced from the locked payroll snapshot and active rule set.

create table if not exists public.shared_native_payroll_accounting_posts (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id text not null,
  payroll_run_id text not null,
  source_version integer not null check (source_version = 1),
  source_confirmed_at timestamptz not null,
  operation_key text not null check (length(operation_key) between 1 and 240),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{32}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  plan jsonb not null,
  journal_entry_id text not null,
  reversal_operation_key text,
  reversal_fingerprint text,
  reversal_entry_id text,
  reversed_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, payroll_run_id, source_version),
  unique (tenant_id, company_id, operation_key),
  unique (tenant_id, company_id, reversal_operation_key),
  foreign key (tenant_id, company_id)
    references public.shared_companies(tenant_id, id) on delete restrict,
  foreign key (tenant_id, payroll_run_id)
    references public.shared_payroll_runs(tenant_id, id) on delete restrict,
  foreign key (tenant_id, journal_entry_id)
    references public.shared_accounting_entries(tenant_id, id) on delete restrict,
  foreign key (tenant_id, reversal_entry_id)
    references public.shared_accounting_entries(tenant_id, id) on delete restrict,
  check ((reversal_operation_key is null and reversal_fingerprint is null
          and reversal_entry_id is null and reversed_at is null)
      or (reversal_operation_key is not null and reversal_fingerprint is not null
          and reversal_entry_id is not null and reversed_at is not null))
);

create index if not exists shared_native_payroll_accounting_posts_company_idx
  on public.shared_native_payroll_accounting_posts(tenant_id, company_id, journal_entry_id);

alter table public.shared_native_payroll_accounting_posts enable row level security;
revoke all on table public.shared_native_payroll_accounting_posts
  from public, anon, authenticated, service_role;

-- A rule revision is derived from every business-relevant field.  The legacy
-- table has no version column, so updated_at alone would not safely describe a
-- rule set restored from an import.
create or replace function public.native_payroll_accounting_rules_json(
  p_tenant_id uuid,
  p_company_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rules jsonb;
  v_invalid boolean;
begin
  select exists (
    select 1
    from public.shared_accounting_integration_rules r
    left join public.shared_accounting_accounts debit
      on debit.tenant_id=r.tenant_id and debit.id=r.debit_account_id
    left join public.shared_accounting_accounts credit
      on credit.tenant_id=r.tenant_id and credit.id=r.credit_account_id
    where r.tenant_id=p_tenant_id and r.company_id=p_company_id
      and r.source='payroll' and r.is_active
      and (r.amount_field not in ('gross_earnings','employee_deductions','net_pay')
        or debit.id is null or credit.id is null
        or debit.company_id<>p_company_id or credit.company_id<>p_company_id
        or not debit.is_active or not credit.is_active
        or debit.is_group or credit.is_group or debit.id=credit.id)
  ) into v_invalid;
  if v_invalid then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_RULE_INVALID';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'version', md5(concat_ws('|',r.id,r.source,r.amount_field,
        r.debit_account_id,r.credit_account_id,r.description,r.is_active::text,
        to_char(r.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))),
      'amountField', r.amount_field,
      'debitAccountId', r.debit_account_id,
      'creditAccountId', r.credit_account_id
    ) order by r.id
  ), '[]'::jsonb)
  into v_rules
  from public.shared_accounting_integration_rules r
  join public.shared_accounting_accounts debit
    on debit.tenant_id=r.tenant_id and debit.id=r.debit_account_id
  join public.shared_accounting_accounts credit
    on credit.tenant_id=r.tenant_id and credit.id=r.credit_account_id
  where r.tenant_id=p_tenant_id and r.company_id=p_company_id
    and r.source='payroll' and r.is_active
    and r.amount_field in ('gross_earnings','employee_deductions','net_pay')
    and debit.company_id=p_company_id and credit.company_id=p_company_id
    and debit.is_active and credit.is_active and not debit.is_group and not credit.is_group;

  if jsonb_array_length(v_rules)=0 then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_NO_ACTIVE_RULES';
  end if;
  return v_rules;
end;
$$;

-- Returns only rule fields the planner may consume.  It has no write effect.
create or replace function public.get_native_payroll_accounting_rule_set(
  p_actor_id uuid,
  p_organization_id uuid,
  p_company_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_rules jsonb;
begin
  if p_actor_id is null or p_organization_id is null
    or p_company_id is null or length(trim(p_company_id)) not between 1 and 128 then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_RULE_SET_INVALID';
  end if;
  v_tenant := public.assert_user_security_access(
    p_actor_id,p_organization_id,trim(p_company_id),'accounting.read');
  if not exists (
    select 1 from public.shared_companies c
    where c.tenant_id=v_tenant and c.organization_id=p_organization_id
      and c.id=trim(p_company_id) and c.status='active'
  ) then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_RULE_SET_ACCESS_DENIED';
  end if;
  v_rules := public.native_payroll_accounting_rules_json(v_tenant,trim(p_company_id));
  return jsonb_build_object(
    'source','payroll.run_confirmed',
    'version',md5(v_rules::text),
    'rules',v_rules
  );
end;
$$;

-- Prevent legacy direct table access from silently changing an immutable
-- accounting fact.  Corrections are possible after the explicit reversal RPC.
create or replace function public.prevent_native_payroll_accounting_source_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_run_id text;
  v_old_tenant_id uuid;
  v_new_run_id text;
  v_new_tenant_id uuid;
begin
  if tg_op<>'INSERT' then
    v_old_tenant_id:=old.tenant_id;
    v_old_run_id:=case when tg_table_name='shared_payroll_runs' then old.id else old.run_id end;
  end if;
  if tg_op<>'DELETE' then
    v_new_tenant_id:=new.tenant_id;
    v_new_run_id:=case when tg_table_name='shared_payroll_runs' then new.id else new.run_id end;
  end if;
  if exists (
    select 1 from public.shared_native_payroll_accounting_posts p
    where ((p.tenant_id=v_old_tenant_id and p.payroll_run_id=v_old_run_id)
      or (p.tenant_id=v_new_tenant_id and p.payroll_run_id=v_new_run_id))
      and p.reversed_at is null
  ) then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_SOURCE_REQUIRES_REVERSAL';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create or replace function public.prevent_native_payroll_accounting_journal_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_entry_id text;
  v_old_tenant_id uuid;
  v_new_entry_id text;
  v_new_tenant_id uuid;
begin
  if tg_op<>'INSERT' then
    v_old_tenant_id:=old.tenant_id;
    v_old_entry_id:=case when tg_table_name='shared_accounting_entries' then old.id else old.entry_id end;
  end if;
  if tg_op<>'DELETE' then
    v_new_tenant_id:=new.tenant_id;
    v_new_entry_id:=case when tg_table_name='shared_accounting_entries' then new.id else new.entry_id end;
  end if;
  if exists (
    select 1 from public.shared_native_payroll_accounting_posts p
    where (p.tenant_id=v_old_tenant_id
      and (p.journal_entry_id=v_old_entry_id or p.reversal_entry_id=v_old_entry_id))
      or (p.tenant_id=v_new_tenant_id
      and (p.journal_entry_id=v_new_entry_id or p.reversal_entry_id=v_new_entry_id))
  ) then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_JOURNAL_IMMUTABLE';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists prevent_native_payroll_accounting_run_mutation
  on public.shared_payroll_runs;
create trigger prevent_native_payroll_accounting_run_mutation
before update or delete on public.shared_payroll_runs
for each row execute function public.prevent_native_payroll_accounting_source_mutation();

drop trigger if exists prevent_native_payroll_accounting_receipt_mutation
  on public.shared_payroll_receipts;
create trigger prevent_native_payroll_accounting_receipt_mutation
before insert or update or delete on public.shared_payroll_receipts
for each row execute function public.prevent_native_payroll_accounting_source_mutation();

drop trigger if exists prevent_native_payroll_accounting_entry_mutation
  on public.shared_accounting_entries;
create trigger prevent_native_payroll_accounting_entry_mutation
before update or delete on public.shared_accounting_entries
for each row execute function public.prevent_native_payroll_accounting_journal_mutation();

drop trigger if exists prevent_native_payroll_accounting_line_mutation
  on public.shared_accounting_entry_lines;
create trigger prevent_native_payroll_accounting_line_mutation
before insert or update or delete on public.shared_accounting_entry_lines
for each row execute function public.prevent_native_payroll_accounting_journal_mutation();


revoke all on function public.native_payroll_accounting_rules_json(uuid,text), public.get_native_payroll_accounting_rule_set(uuid,uuid,text), public.prevent_native_payroll_accounting_source_mutation(), public.prevent_native_payroll_accounting_journal_mutation() from public, anon, authenticated, service_role;
grant execute on function public.get_native_payroll_accounting_rule_set(uuid,uuid,text) to service_role;
