-- ADM-035: the temporary rule, period, journals and source changes all roll back.
begin;
do $smoke$
declare
  f record; a record; b record; s jsonb; r jsonb; p jsonb; reversed jsonb;
  posted jsonb; replay jsonb; reversed_receipt jsonb; line_debit jsonb;
  line_credit jsonb; key text; cost text; rule jsonb; journal_id text;
  source_version bigint; item_id text; movement_id text; line_id text;
begin
  select o.id organization_id,mem.user_id actor_id,c.tenant_id,
    c.id company_id,i.id invoice_id,i.invoice_date
  into f from public.organizations o
  join public.organization_memberships mem
    on mem.organization_id=o.id and mem.status='active'
  join public.organization_roles role
    on role.id=mem.role_id and role.organization_id=o.id and role.status='active'
  join public.shared_companies c
    on c.organization_id=o.id and c.status='active'
  join public.shared_inventory_purchase_invoices i
    on i.tenant_id=c.tenant_id and i.company_id=c.id
  where o.status='active' and i.status='confirmada'
    and i.document_type='factura' and i.inventory_effect='additional_purchase'
    and exists(select 1 from public.organization_role_permissions q
      where q.role_id=role.id and q.permission_code='purchases.read')
    and exists(select 1 from public.organization_role_permissions q
      where q.role_id=role.id and q.permission_code='accounting.read')
    and exists(select 1 from public.organization_role_permissions q
      where q.role_id=role.id and q.permission_code='accounting.post')
    and (select count(*) from public.shared_accounting_accounts x
      where x.tenant_id=c.tenant_id and x.company_id=c.id
        and x.is_active and not x.is_group)>=2
    and (select sum(m.total_cost) from public.shared_inventory_movements m
      where m.tenant_id=i.tenant_id and m.purchase_invoice_id=i.id)>0
    and (select sum(m.total_cost) from public.shared_inventory_movements m
      where m.tenant_id=i.tenant_id and m.purchase_invoice_id=i.id)
      =round((select sum(m.total_cost) from public.shared_inventory_movements m
        where m.tenant_id=i.tenant_id and m.purchase_invoice_id=i.id),2)
  order by i.id limit 1;
  if not found then raise exception 'Authorized purchase posting fixture unavailable'; end if;
  select x.id into a from public.shared_accounting_accounts x
  where x.tenant_id=f.tenant_id and x.company_id=f.company_id
    and x.is_active and not x.is_group order by x.id limit 1;
  select x.id into b from public.shared_accounting_accounts x
  where x.tenant_id=f.tenant_id and x.company_id=f.company_id
    and x.is_active and not x.is_group and x.id<>a.id
  order by x.id limit 1;
  insert into public.shared_accounting_integration_rules(
    tenant_id,id,company_id,source,debit_account_id,credit_account_id,
    amount_field,description,is_active
  ) values(f.tenant_id,'native-purchase-smoke-rule',f.company_id,
    'inventory_purchase',a.id,b.id,'recognized_inventory_cost',
    'Temporary purchase posting smoke',true);
  s:=public.get_native_purchase_accounting_snapshot(
    f.actor_id,f.organization_id,f.company_id,f.invoice_id);
  r:=public.get_native_purchase_accounting_rule_set(
    f.actor_id,f.organization_id,f.company_id);
  if r->>'source'<>'purchasing.invoice_confirmed'
    or jsonb_array_length(r->'rules')<>1 then
    raise exception 'Purchase rule-set mismatch'; end if;
  rule:=r->'rules'->0; cost:=s->>'recognizedInventoryCost';
  source_version:=(s->>'sourceVersion')::bigint;
  key:='16:accounting-event|28:purchasing.invoice_confirmed|'
    ||length(f.tenant_id::text)::text||':'||f.tenant_id::text||'|'
    ||length(f.organization_id::text)::text||':'||f.organization_id::text||'|'
    ||length(f.company_id)::text||':'||f.company_id||'|'
    ||length(f.invoice_id)::text||':'||f.invoice_id||'|'
    ||length(source_version::text)::text||':'||source_version::text;
  line_debit:=jsonb_build_object('accountId',a.id,'side','debit',
    'amount',cost,'ruleId',rule->>'id','ruleVersion',rule->>'version');
  line_credit:=jsonb_build_object('accountId',b.id,'side','credit',
    'amount',cost,'ruleId',rule->>'id','ruleVersion',rule->>'version');
  p:=jsonb_build_object('operationKey',key,'tenantId',f.tenant_id,
    'organizationId',f.organization_id,'companyId',f.company_id,
    'source','purchasing.invoice_confirmed','sourceId',f.invoice_id,
    'sourceVersion',source_version,'ruleSetVersion',r->>'version',
    'effectiveDate',s->>'effectiveDate','occurredAt',s->>'confirmedAt',
    'description','Purchase invoice '||f.invoice_id,
    'lines',jsonb_build_array(line_debit,line_credit));
  begin
    perform public.post_native_purchase_accounting_integration(
      gen_random_uuid(),f.organization_id,f.company_id,p);
    raise exception 'Expected actor denial';
  exception when others then
    if sqlerrm not like '%ORGANIZATIONAL_USER_ACCESS_DENIED%' then raise; end if;
  end;
  begin
    perform public.post_native_purchase_accounting_integration(
      f.actor_id,f.organization_id,f.company_id,
      jsonb_set(p,'{ruleSetVersion}','"stale"'::jsonb));
    raise exception 'Expected stale mapping';
  exception when others then
    if sqlerrm not like '%NATIVE_PURCHASE_ACCOUNTING_RULESET_CHANGED%' then raise; end if;
  end;
  begin
    perform public.post_native_purchase_accounting_integration(
      f.actor_id,f.organization_id,f.company_id,p);
    raise exception 'Expected closed period';
  exception when others then
    if sqlerrm not like '%NATIVE_PURCHASE_ACCOUNTING_PERIOD_CLOSED%' then raise; end if;
  end;
  insert into public.shared_accounting_periods(
    tenant_id,id,company_id,name,start_date,end_date,status)
  values(f.tenant_id,'native-purchase-smoke-period',f.company_id,
    'Temporary purchase posting smoke',f.invoice_date,f.invoice_date,'open');
  posted:=public.post_native_purchase_accounting_integration(
    f.actor_id,f.organization_id,f.company_id,p);
  if posted->>'operationKey'<>key or (posted->>'replayed')::boolean then
    raise exception 'Purchase posting failed'; end if;
  journal_id:=posted->>'journalEntryId';
  replay:=public.post_native_purchase_accounting_integration(
    f.actor_id,f.organization_id,f.company_id,p);
  if replay->>'journalEntryId'<>journal_id
    or not (replay->>'replayed')::boolean then
    raise exception 'Purchase posting replay failed'; end if;
  begin
    perform public.post_native_purchase_accounting_integration(
      f.actor_id,f.organization_id,f.company_id,
      jsonb_set(p,'{description}','"Changed description"'::jsonb));
    raise exception 'Expected operation conflict';
  exception when others then
    if sqlerrm not like '%NATIVE_PURCHASE_ACCOUNTING_OPERATION_KEY_INVALID%'
      and sqlerrm not like '%NATIVE_PURCHASE_ACCOUNTING_IDEMPOTENCY_CONFLICT%' then raise; end if;
  end;
  begin
    update public.shared_inventory_purchase_invoices i
    set notes=coalesce(notes,'')||' [temporary posted]'
    where i.tenant_id=f.tenant_id and i.id=f.invoice_id;
    raise exception 'Expected source guard';
  exception when others then
    if sqlerrm not like '%NATIVE_PURCHASE_ACCOUNTING_SOURCE_REQUIRES_REVERSAL%' then raise; end if;
  end;
  select i.id into item_id from public.shared_inventory_purchase_invoice_items i
  where i.tenant_id=f.tenant_id and i.invoice_id=f.invoice_id limit 1;
  begin
    update public.shared_inventory_purchase_invoice_items i
    set total_cost=i.total_cost+1
    where i.tenant_id=f.tenant_id and i.id=item_id;
    raise exception 'Expected item guard';
  exception when others then
    if sqlerrm not like '%NATIVE_PURCHASE_ACCOUNTING_SOURCE_REQUIRES_REVERSAL%' then raise; end if;
  end;
  select m.id into movement_id from public.shared_inventory_movements m
  where m.tenant_id=f.tenant_id and m.purchase_invoice_id=f.invoice_id limit 1;
  begin
    update public.shared_inventory_movements m
    set notes=coalesce(m.notes,'')||' [temporary posted]'
    where m.tenant_id=f.tenant_id and m.id=movement_id;
    raise exception 'Expected movement guard';
  exception when others then
    if sqlerrm not like '%NATIVE_PURCHASE_ACCOUNTING_SOURCE_REQUIRES_REVERSAL%' then raise; end if;
  end;
  begin
    update public.shared_accounting_entries e set description='tampered'
    where e.tenant_id=f.tenant_id and e.id=journal_id;
    raise exception 'Expected journal guard';
  exception when others then
    if sqlerrm not like '%NATIVE_PURCHASE_ACCOUNTING_JOURNAL_IMMUTABLE%' then raise; end if;
  end;
  select l.id into line_id from public.shared_accounting_entry_lines l
  where l.tenant_id=f.tenant_id and l.entry_id=journal_id limit 1;
  begin
    update public.shared_accounting_entry_lines l set amount=l.amount+1
    where l.tenant_id=f.tenant_id and l.id=line_id;
    raise exception 'Expected journal line guard';
  exception when others then
    if sqlerrm not like '%NATIVE_PURCHASE_ACCOUNTING_JOURNAL_IMMUTABLE%' then raise; end if;
  end;
  reversed:=jsonb_build_object('operationKey',key||':reversal',
    'originalOperationKey',key,'tenantId',f.tenant_id,
    'organizationId',f.organization_id,'companyId',f.company_id,
    'source','purchasing.invoice_confirmed','sourceId',f.invoice_id,
    'sourceVersion',source_version,'effectiveDate',f.invoice_date,
    'occurredAt',to_char(clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'reason','Temporary purchase reversal smoke',
    'lines',jsonb_build_array(
      jsonb_set(line_debit,'{side}','"credit"'::jsonb),
      jsonb_set(line_credit,'{side}','"debit"'::jsonb)));
  reversed_receipt:=public.reverse_native_purchase_accounting_integration(
    f.actor_id,f.organization_id,f.company_id,reversed);
  if (reversed_receipt->>'replayed')::boolean then
    raise exception 'Purchase reversal failed'; end if;
  replay:=public.reverse_native_purchase_accounting_integration(
    f.actor_id,f.organization_id,f.company_id,reversed);
  if replay->>'journalEntryId'<>reversed_receipt->>'journalEntryId'
    or not (replay->>'replayed')::boolean then
    raise exception 'Purchase reversal replay failed'; end if;
  update public.shared_inventory_purchase_invoices i
  set notes=coalesce(notes,'')||' [temporary after reversal]'
  where i.tenant_id=f.tenant_id and i.id=f.invoice_id;
  s:=public.get_native_purchase_accounting_snapshot(
    f.actor_id,f.organization_id,f.company_id,f.invoice_id);
  if (s->>'sourceVersion')::bigint<>source_version+1 then
    raise exception 'Reversed source did not advance version'; end if;
end;
$smoke$;
do $access$
begin
  if has_function_privilege('anon',
      'public.post_native_purchase_accounting_integration(uuid,uuid,text,jsonb)','execute')
    or has_function_privilege('authenticated',
      'public.post_native_purchase_accounting_integration(uuid,uuid,text,jsonb)','execute')
    or has_function_privilege('anon',
      'public.reverse_native_purchase_accounting_integration(uuid,uuid,text,jsonb)','execute')
    or has_function_privilege('authenticated',
      'public.reverse_native_purchase_accounting_integration(uuid,uuid,text,jsonb)','execute')
    or not has_function_privilege('service_role',
      'public.post_native_purchase_accounting_integration(uuid,uuid,text,jsonb)','execute')
    or not has_function_privilege('service_role',
      'public.reverse_native_purchase_accounting_integration(uuid,uuid,text,jsonb)','execute')
    or has_table_privilege('service_role',
      'public.shared_native_purchase_accounting_posts','select')
  then raise exception 'Purchase posting access leaked'; end if;
end;
$access$;
rollback;
