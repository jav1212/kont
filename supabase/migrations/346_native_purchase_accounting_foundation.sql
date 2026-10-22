-- ADM-035: private, versioned link between a purchase source and immutable journals.
create table public.shared_native_purchase_accounting_posts (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id text not null,
  purchase_invoice_id text not null,
  source_version bigint not null check (source_version between 1 and 9007199254740991),
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
  primary key (tenant_id,purchase_invoice_id,source_version),
  unique (tenant_id,company_id,operation_key),
  unique (tenant_id,company_id,reversal_operation_key),
  foreign key (tenant_id,company_id)
    references public.shared_companies(tenant_id,id) on delete restrict,
  foreign key (tenant_id,purchase_invoice_id)
    references public.shared_inventory_purchase_invoices(tenant_id,id) on delete restrict,
  foreign key (tenant_id,journal_entry_id)
    references public.shared_accounting_entries(tenant_id,id) on delete restrict,
  foreign key (tenant_id,reversal_entry_id)
    references public.shared_accounting_entries(tenant_id,id) on delete restrict,
  check ((reversal_operation_key is null and reversal_fingerprint is null
          and reversal_entry_id is null and reversed_at is null)
      or (reversal_operation_key is not null and reversal_fingerprint is not null
          and reversal_entry_id is not null and reversed_at is not null))
);
create unique index shared_native_purchase_accounting_posts_active_idx
  on public.shared_native_purchase_accounting_posts(tenant_id,purchase_invoice_id)
  where reversed_at is null;
create index shared_native_purchase_accounting_posts_company_entry_idx
  on public.shared_native_purchase_accounting_posts(tenant_id,company_id,journal_entry_id);
create index shared_native_purchase_accounting_posts_organization_idx
  on public.shared_native_purchase_accounting_posts(organization_id);
create index shared_native_purchase_accounting_posts_entry_idx
  on public.shared_native_purchase_accounting_posts(tenant_id,journal_entry_id);
create index shared_native_purchase_accounting_posts_reversal_entry_idx
  on public.shared_native_purchase_accounting_posts(tenant_id,reversal_entry_id)
  where reversal_entry_id is not null;
alter table public.shared_native_purchase_accounting_posts enable row level security;
revoke all on public.shared_native_purchase_accounting_posts
  from public,anon,authenticated,service_role;

-- Existing inventory_purchase rules are reused; they must reference active
-- leaf accounts in the same company and the one recognized cost field.
create function public.native_purchase_accounting_rules_json(
  p_tenant_id uuid,p_company_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_rules jsonb; v_invalid boolean;
begin
  select exists (
    select 1 from public.shared_accounting_integration_rules r
    left join public.shared_accounting_accounts debit
      on debit.tenant_id=r.tenant_id and debit.id=r.debit_account_id
    left join public.shared_accounting_accounts credit
      on credit.tenant_id=r.tenant_id and credit.id=r.credit_account_id
    where r.tenant_id=p_tenant_id and r.company_id=p_company_id
      and r.source='inventory_purchase' and r.is_active
      and (r.amount_field<>'recognized_inventory_cost'
        or debit.id is null or credit.id is null
        or debit.company_id<>p_company_id or credit.company_id<>p_company_id
        or not debit.is_active or not credit.is_active
        or debit.is_group or credit.is_group or debit.id=credit.id)
  ) into v_invalid;
  if v_invalid then raise exception 'NATIVE_PURCHASE_ACCOUNTING_RULE_INVALID'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'version',md5(concat_ws('|',r.id,r.source,r.amount_field,
      r.debit_account_id,r.credit_account_id,r.description,r.is_active::text,
      to_char(r.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))),
    'amountField',r.amount_field,
    'debitAccountId',r.debit_account_id,
    'creditAccountId',r.credit_account_id
  ) order by r.id),'[]'::jsonb) into v_rules
  from public.shared_accounting_integration_rules r
  join public.shared_accounting_accounts debit
    on debit.tenant_id=r.tenant_id and debit.id=r.debit_account_id
  join public.shared_accounting_accounts credit
    on credit.tenant_id=r.tenant_id and credit.id=r.credit_account_id
  where r.tenant_id=p_tenant_id and r.company_id=p_company_id
    and r.source='inventory_purchase' and r.is_active
    and r.amount_field='recognized_inventory_cost'
    and debit.company_id=p_company_id and credit.company_id=p_company_id
    and debit.is_active and credit.is_active and not debit.is_group and not credit.is_group;
  if jsonb_array_length(v_rules)=0 then
    raise exception 'NATIVE_PURCHASE_ACCOUNTING_NO_ACTIVE_RULES';
  end if;
  return v_rules;
end;
$$;

create function public.get_native_purchase_accounting_rule_set(
  p_actor_id uuid,p_organization_id uuid,p_company_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_rules jsonb;
begin
  if p_actor_id is null or p_organization_id is null or p_company_id is null
    or length(trim(p_company_id)) not between 1 and 128 then
    raise exception 'NATIVE_PURCHASE_ACCOUNTING_RULE_SET_INVALID';
  end if;
  v_tenant:=public.assert_user_security_access(
    p_actor_id,p_organization_id,trim(p_company_id),'accounting.read');
  if not exists (select 1 from public.shared_companies c
    where c.tenant_id=v_tenant and c.organization_id=p_organization_id
      and c.id=trim(p_company_id) and c.status='active') then
    raise exception 'NATIVE_PURCHASE_ACCOUNTING_ACCESS_DENIED';
  end if;
  v_rules:=public.native_purchase_accounting_rules_json(v_tenant,trim(p_company_id));
  return jsonb_build_object('source','purchasing.invoice_confirmed',
    'version',md5(v_rules::text),'rules',v_rules);
end;
$$;

-- Source revisions are serialized with snapshots by the invoice row lock.
-- The AFTER child trigger invokes this function inside the mutating statement,
-- so a rejected change is rolled back along with the child write.
create or replace function public.bump_native_purchase_accounting_source_revision(
  p_tenant_id uuid,p_invoice_id text
) returns void language plpgsql security definer set search_path=public as $$
declare v_status text;
begin
  if p_invoice_id is null then return; end if;
  select i.status into v_status from public.shared_inventory_purchase_invoices i
  where i.tenant_id=p_tenant_id and i.id=p_invoice_id for update;
  if not found or v_status<>'confirmada' then return; end if;
  if exists (select 1 from public.shared_native_purchase_accounting_posts p
    where p.tenant_id=p_tenant_id and p.purchase_invoice_id=p_invoice_id
      and p.reversed_at is null) then
    raise exception 'NATIVE_PURCHASE_ACCOUNTING_SOURCE_REQUIRES_REVERSAL';
  end if;
  insert into public.shared_purchase_accounting_source_revisions
    (tenant_id,invoice_id,version) values (p_tenant_id,p_invoice_id,2)
  on conflict (tenant_id,invoice_id) do update
    set version=public.shared_purchase_accounting_source_revisions.version+1,
        updated_at=now();
end;
$$;

create function public.prevent_native_purchase_accounting_source_mutation()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_old_tenant uuid; v_new_tenant uuid; v_old_id text; v_new_id text;
begin
  if tg_table_name='shared_inventory_purchase_invoices' then
    if tg_op<>'INSERT' then
      v_old_tenant:=old.tenant_id; v_old_id:=old.id;
    end if;
    if tg_op<>'DELETE' then
      v_new_tenant:=new.tenant_id; v_new_id:=new.id;
    end if;
  elsif tg_table_name='shared_inventory_purchase_invoice_items' then
    if tg_op<>'INSERT' then
      v_old_tenant:=old.tenant_id; v_old_id:=old.invoice_id;
    end if;
    if tg_op<>'DELETE' then
      v_new_tenant:=new.tenant_id; v_new_id:=new.invoice_id;
    end if;
  else
    if tg_op<>'INSERT' then
      v_old_tenant:=old.tenant_id; v_old_id:=old.purchase_invoice_id;
    end if;
    if tg_op<>'DELETE' then
      v_new_tenant:=new.tenant_id; v_new_id:=new.purchase_invoice_id;
    end if;
  end if;
  if exists (select 1 from public.shared_native_purchase_accounting_posts p
    where p.reversed_at is null and
      ((p.tenant_id=v_old_tenant and p.purchase_invoice_id=v_old_id)
        or (p.tenant_id=v_new_tenant and p.purchase_invoice_id=v_new_id))) then
    raise exception 'NATIVE_PURCHASE_ACCOUNTING_SOURCE_REQUIRES_REVERSAL';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger prevent_native_purchase_invoice_accounting_mutation
before update or delete on public.shared_inventory_purchase_invoices
for each row execute function public.prevent_native_purchase_accounting_source_mutation();
create trigger prevent_native_purchase_item_accounting_mutation
before insert or update or delete on public.shared_inventory_purchase_invoice_items
for each row execute function public.prevent_native_purchase_accounting_source_mutation();
create trigger prevent_native_purchase_movement_accounting_mutation
before insert or update or delete on public.shared_inventory_movements
for each row execute function public.prevent_native_purchase_accounting_source_mutation();

create function public.prevent_native_purchase_accounting_journal_mutation()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_old_tenant uuid; v_new_tenant uuid; v_old_id text; v_new_id text;
begin
  if tg_table_name='shared_accounting_entries' then
    if tg_op<>'INSERT' then v_old_tenant:=old.tenant_id; v_old_id:=old.id; end if;
    if tg_op<>'DELETE' then v_new_tenant:=new.tenant_id; v_new_id:=new.id; end if;
  else
    if tg_op<>'INSERT' then v_old_tenant:=old.tenant_id; v_old_id:=old.entry_id; end if;
    if tg_op<>'DELETE' then v_new_tenant:=new.tenant_id; v_new_id:=new.entry_id; end if;
  end if;
  if exists (select 1 from public.shared_native_purchase_accounting_posts p
    where (p.tenant_id=v_old_tenant and
      (p.journal_entry_id=v_old_id or p.reversal_entry_id=v_old_id))
      or (p.tenant_id=v_new_tenant and
      (p.journal_entry_id=v_new_id or p.reversal_entry_id=v_new_id))) then
    raise exception 'NATIVE_PURCHASE_ACCOUNTING_JOURNAL_IMMUTABLE';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger prevent_native_purchase_accounting_entry_mutation
before update or delete on public.shared_accounting_entries
for each row execute function public.prevent_native_purchase_accounting_journal_mutation();
create trigger prevent_native_purchase_accounting_line_mutation
before insert or update or delete on public.shared_accounting_entry_lines
for each row execute function public.prevent_native_purchase_accounting_journal_mutation();

revoke all on function public.native_purchase_accounting_rules_json(uuid,text),
  public.get_native_purchase_accounting_rule_set(uuid,uuid,text),
  public.prevent_native_purchase_accounting_source_mutation(),
  public.prevent_native_purchase_accounting_journal_mutation()
  from public,anon,authenticated,service_role;
grant execute on function public.get_native_purchase_accounting_rule_set(uuid,uuid,text)
  to service_role;
