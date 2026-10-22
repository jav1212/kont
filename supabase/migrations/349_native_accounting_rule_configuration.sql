-- ADM-035/036: service-only, optimistic configuration of the native mapping
-- sources. No existing rule or business row is migrated or rewritten here.
create table public.shared_native_accounting_rule_config_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id text not null,
  source text not null check (source in ('payroll','inventory_purchase')),
  previous_version text not null,
  resulting_version text not null,
  previous_rules jsonb not null,
  resulting_rules jsonb not null,
  changed_by uuid not null,
  changed_at timestamptz not null default clock_timestamp(),
  foreign key (tenant_id,company_id)
    references public.shared_companies(tenant_id,id) on delete restrict
);
create index shared_native_accounting_rule_config_events_company_idx
  on public.shared_native_accounting_rule_config_events(tenant_id,company_id,changed_at desc);
create index shared_native_accounting_rule_config_events_org_idx
  on public.shared_native_accounting_rule_config_events(organization_id);
alter table public.shared_native_accounting_rule_config_events enable row level security;
revoke all on public.shared_native_accounting_rule_config_events
  from public,anon,authenticated,service_role;

create function public.native_accounting_rule_configuration_json(
  p_tenant_id uuid,p_company_id text,p_source text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_rules jsonb; v_revision_rows jsonb; v_portable_source text;
begin
  if p_source not in ('payroll','inventory_purchase') then
    raise exception 'NATIVE_ACCOUNTING_RULE_CONFIGURATION_INVALID'; end if;
  v_portable_source:=case p_source when 'payroll' then 'payroll.run_confirmed'
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

create function public.get_native_accounting_rule_configuration(
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

create function public.replace_native_accounting_rule_configuration(
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

revoke all on function public.native_accounting_rule_configuration_json(uuid,text,text),
  public.get_native_accounting_rule_configuration(uuid,uuid,text,text),
  public.replace_native_accounting_rule_configuration(uuid,uuid,text,text,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.get_native_accounting_rule_configuration(uuid,uuid,text,text),
  public.replace_native_accounting_rule_configuration(uuid,uuid,text,text,text,jsonb)
  to service_role;
