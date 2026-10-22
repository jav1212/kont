-- ADM-035/036: all temporary rules and audit events roll back.
begin;
do $smoke$
declare
  f record; a text; b text; initial jsonb; purchase jsonb; payroll jsonb;
  replaced jsonb; emptied jsonb; rule jsonb;
begin
  select o.id organization_id,mem.user_id actor_id,c.tenant_id,
    c.id company_id into f
  from public.organizations o
  join public.organization_memberships mem
    on mem.organization_id=o.id and mem.status='active'
  join public.organization_roles role
    on role.id=mem.role_id and role.organization_id=o.id and role.status='active'
  join public.shared_companies c
    on c.organization_id=o.id and c.status='active'
  where o.status='active'
    and exists(select 1 from public.organization_role_permissions p
      where p.role_id=role.id and p.permission_code='accounting.read')
    and exists(select 1 from public.organization_role_permissions p
      where p.role_id=role.id and p.permission_code='accounting.update')
    and (select count(*) from public.shared_accounting_accounts x
      where x.tenant_id=c.tenant_id and x.company_id=c.id
        and x.is_active and not x.is_group)>=2
  order by c.id limit 1;
  if not found then raise exception 'Accounting rule fixture unavailable'; end if;
  select x.id into a from public.shared_accounting_accounts x
  where x.tenant_id=f.tenant_id and x.company_id=f.company_id
    and x.is_active and not x.is_group order by x.id limit 1;
  select x.id into b from public.shared_accounting_accounts x
  where x.tenant_id=f.tenant_id and x.company_id=f.company_id
    and x.is_active and not x.is_group and x.id<>a order by x.id limit 1;
  initial:=public.get_native_accounting_rule_configuration(
    f.actor_id,f.organization_id,f.company_id,
    'purchasing.invoice_confirmed');
  if initial->>'source'<>'purchasing.invoice_confirmed'
    or initial->>'version'<>md5('[]')
    or initial->'rules'<>'[]'::jsonb then
    raise exception 'Empty purchase configuration mismatch'; end if;
  begin
    perform public.get_native_accounting_rule_configuration(
      gen_random_uuid(),f.organization_id,f.company_id,
      'purchasing.invoice_confirmed');
    raise exception 'Expected actor denial';
  exception when others then
    if sqlerrm not like '%ORGANIZATIONAL_USER_ACCESS_DENIED%' then raise; end if;
  end;
  rule:=jsonb_build_object('id','native-config-smoke-purchase',
    'amountField','recognized_inventory_cost','debitAccountId',a,
    'creditAccountId',b,'description','Temporary purchase mapping',
    'isActive',true);
  begin
    perform public.replace_native_accounting_rule_configuration(
      f.actor_id,f.organization_id,f.company_id,
      'purchasing.invoice_confirmed','00000000000000000000000000000000',
      jsonb_build_array(rule));
    raise exception 'Expected stale revision';
  exception when others then
    if sqlerrm not like '%NATIVE_ACCOUNTING_RULE_CONFIGURATION_STALE%' then raise; end if;
  end;
  begin
    perform public.replace_native_accounting_rule_configuration(
      f.actor_id,f.organization_id,f.company_id,
      'purchasing.invoice_confirmed',initial->>'version',null);
    raise exception 'Expected null array rejection';
  exception when others then
    if sqlerrm not like '%NATIVE_ACCOUNTING_RULE_CONFIGURATION_INVALID%' then raise; end if;
  end;
  begin
    perform public.replace_native_accounting_rule_configuration(
      f.actor_id,f.organization_id,f.company_id,
      'purchasing.invoice_confirmed',initial->>'version',
      jsonb_build_array(jsonb_set(rule,'{amountField}',
        '"gross_earnings"'::jsonb)));
    raise exception 'Expected unsupported purchase field';
  exception when others then
    if sqlerrm not like '%NATIVE_ACCOUNTING_RULE_CONFIGURATION_INVALID%' then raise; end if;
  end;
  begin
    perform public.replace_native_accounting_rule_configuration(
      f.actor_id,f.organization_id,f.company_id,
      'purchasing.invoice_confirmed',initial->>'version',
      jsonb_build_array(rule,jsonb_set(rule,'{creditAccountId}',
        to_jsonb(a))));
    raise exception 'Expected invalid duplicate/account';
  exception when others then
    if sqlerrm not like '%NATIVE_ACCOUNTING_RULE_CONFIGURATION_INVALID%' then raise; end if;
  end;
  purchase:=public.replace_native_accounting_rule_configuration(
    f.actor_id,f.organization_id,f.company_id,
    'purchasing.invoice_confirmed',initial->>'version',
    jsonb_build_array(rule));
  if purchase->>'version'=initial->>'version'
    or purchase->'rules'<>jsonb_build_array(rule) then
    raise exception 'Purchase configuration replace mismatch'; end if;
  replaced:=public.get_native_accounting_rule_configuration(
    f.actor_id,f.organization_id,f.company_id,
    'purchasing.invoice_confirmed');
  if replaced<>purchase then raise exception 'Purchase configuration read mismatch'; end if;
  replaced:=public.get_native_purchase_accounting_rule_set(
    f.actor_id,f.organization_id,f.company_id);
  if jsonb_array_length(replaced->'rules')<>1 then
    raise exception 'Posting rule reader did not see configured purchase mapping'; end if;
  begin
    perform public.replace_native_accounting_rule_configuration(
      f.actor_id,f.organization_id,f.company_id,
      'purchasing.invoice_confirmed',initial->>'version','[]'::jsonb);
    raise exception 'Expected optimistic conflict';
  exception when others then
    if sqlerrm not like '%NATIVE_ACCOUNTING_RULE_CONFIGURATION_STALE%' then raise; end if;
  end;
  initial:=public.get_native_accounting_rule_configuration(
    f.actor_id,f.organization_id,f.company_id,'payroll.run_confirmed');
  payroll:=public.replace_native_accounting_rule_configuration(
    f.actor_id,f.organization_id,f.company_id,'payroll.run_confirmed',
    initial->>'version',jsonb_build_array(jsonb_build_object(
      'id','native-config-smoke-payroll','amountField','gross_earnings',
      'debitAccountId',a,'creditAccountId',b,
      'description','Temporary payroll mapping','isActive',false)));
  if jsonb_array_length(payroll->'rules')<>1 then
    raise exception 'Payroll configuration replace failed'; end if;
  emptied:=public.replace_native_accounting_rule_configuration(
    f.actor_id,f.organization_id,f.company_id,
    'purchasing.invoice_confirmed',purchase->>'version','[]'::jsonb);
  if emptied->'rules'<>'[]'::jsonb or emptied->>'version'<>md5('[]')
    or (select count(*) from public.shared_accounting_integration_rules r
      where r.tenant_id=f.tenant_id and r.company_id=f.company_id
        and r.source='payroll')<>1
    or (select count(*) from public.shared_native_accounting_rule_config_events e
      where e.tenant_id=f.tenant_id and e.company_id=f.company_id)<>3
  then raise exception 'Replace isolation or audit mismatch'; end if;
end;
$smoke$;
do $access$
begin
  if has_function_privilege('anon',
      'public.get_native_accounting_rule_configuration(uuid,uuid,text,text)','execute')
    or has_function_privilege('authenticated',
      'public.get_native_accounting_rule_configuration(uuid,uuid,text,text)','execute')
    or has_function_privilege('anon',
      'public.replace_native_accounting_rule_configuration(uuid,uuid,text,text,text,jsonb)','execute')
    or has_function_privilege('authenticated',
      'public.replace_native_accounting_rule_configuration(uuid,uuid,text,text,text,jsonb)','execute')
    or not has_function_privilege('service_role',
      'public.replace_native_accounting_rule_configuration(uuid,uuid,text,text,text,jsonb)','execute')
    or has_table_privilege('service_role',
      'public.shared_native_accounting_rule_config_events','select')
  then raise exception 'Accounting rule configuration access leaked'; end if;
end;
$access$;
rollback;
