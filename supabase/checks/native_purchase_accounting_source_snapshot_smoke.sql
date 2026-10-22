-- ADM-035: all temporary business-row changes below are rolled back.
begin;
do $smoke$
declare
  f record; x jsonb; v bigint; expected_cost numeric;
  item_id text; movement_id text;
begin
  select o.id as organization_id,mem.user_id as actor_id,
    c.tenant_id,c.id as company_id,i.id as invoice_id,
    i.invoice_date,i.confirmed_at,i.currency_code,
    sum(m.total_cost) as cost,count(m.id)::integer as movement_count
  into f
  from public.organizations o
  join public.organization_memberships mem
    on mem.organization_id=o.id and mem.status='active'
  join public.organization_roles role
    on role.id=mem.role_id and role.organization_id=o.id and role.status='active'
  join public.shared_companies c
    on c.organization_id=o.id and c.status='active'
  join public.shared_inventory_purchase_invoices i
    on i.tenant_id=c.tenant_id and i.company_id=c.id
  join public.shared_inventory_movements m
    on m.tenant_id=i.tenant_id and m.purchase_invoice_id=i.id
  where o.status='active' and i.status='confirmada'
    and i.document_type='factura' and i.inventory_effect='additional_purchase'
    and i.currency_code in ('VES','USD')
    and exists (select 1 from public.organization_role_permissions p
      where p.role_id=role.id and p.permission_code='purchases.read')
    and exists (select 1 from public.organization_role_permissions p
      where p.role_id=role.id and p.permission_code='accounting.read')
  group by o.id,mem.user_id,c.tenant_id,c.id,i.id,i.invoice_date,
    i.confirmed_at,i.currency_code
  having sum(m.total_cost)>0 and sum(m.total_cost)=round(sum(m.total_cost),2)
  order by i.id limit 1;
  if not found then raise exception 'Purchase accounting fixture unavailable'; end if;
  if not exists (select 1 from public.shared_inventory_purchase_invoice_items z
    where z.tenant_id=f.tenant_id and z.invoice_id=f.invoice_id) then
    raise exception 'Purchase accounting item fixture unavailable';
  end if;
  x:=public.get_native_purchase_accounting_snapshot(
    f.actor_id,f.organization_id,f.company_id,f.invoice_id);
  if x->>'tenantId'<>f.tenant_id::text
    or x->>'organizationId'<>f.organization_id::text
    or x->>'companyId'<>f.company_id
    or x->>'invoiceId'<>f.invoice_id
    or (x->>'sourceVersion')::bigint<>1
    or (x->>'effectiveDate')::date<>f.invoice_date
    or (x->>'confirmedAt')::timestamptz<>f.confirmed_at
    or (x->>'movementCount')::integer<>f.movement_count
    or (x->>'recognizedInventoryCost')::numeric<>f.cost
    or x->>'documentCurrency'<>f.currency_code then
    raise exception 'Purchase accounting snapshot mismatch';
  end if;

  begin
    perform public.get_native_purchase_accounting_snapshot(
      gen_random_uuid(),f.organization_id,f.company_id,f.invoice_id);
    raise exception 'Expected actor denial';
  exception when others then
    if sqlerrm not like '%ORGANIZATIONAL_USER_ACCESS_DENIED%' then raise; end if;
  end;
  begin
    perform public.get_native_purchase_accounting_snapshot(
      f.actor_id,f.organization_id,f.company_id,'missing-adm035-invoice');
    raise exception 'Expected missing invoice rejection';
  exception when others then
    if sqlerrm not like '%PURCHASE_ACCOUNTING_SNAPSHOT_NOT_CONFIRMED%' then raise; end if;
  end;

  update public.shared_inventory_purchase_invoices i
    set notes=coalesce(i.notes,'')||' [temporary ADM-035 smoke]'
  where i.tenant_id=f.tenant_id and i.id=f.invoice_id;
  x:=public.get_native_purchase_accounting_snapshot(
    f.actor_id,f.organization_id,f.company_id,f.invoice_id);
  if (x->>'sourceVersion')::bigint<>2 then
    raise exception 'Invoice update did not advance source revision';
  end if;

  select z.id into item_id from public.shared_inventory_purchase_invoice_items z
  where z.tenant_id=f.tenant_id and z.invoice_id=f.invoice_id limit 1;
  update public.shared_inventory_purchase_invoice_items z
    set total_cost=z.total_cost+1
  where z.tenant_id=f.tenant_id and z.id=item_id;
  x:=public.get_native_purchase_accounting_snapshot(
    f.actor_id,f.organization_id,f.company_id,f.invoice_id);
  if (x->>'sourceVersion')::bigint<>3 then
    raise exception 'Item update did not advance source revision';
  end if;

  select m.id into movement_id from public.shared_inventory_movements m
  where m.tenant_id=f.tenant_id and m.purchase_invoice_id=f.invoice_id limit 1;
  update public.shared_inventory_movements m set notes=coalesce(m.notes,'')||' [temporary ADM-035 smoke]'
  where m.tenant_id=f.tenant_id and m.id=movement_id;
  x:=public.get_native_purchase_accounting_snapshot(
    f.actor_id,f.organization_id,f.company_id,f.invoice_id);
  if (x->>'sourceVersion')::bigint<>4 then
    raise exception 'Movement update did not advance source revision';
  end if;
  select sum(m.total_cost) into expected_cost
  from public.shared_inventory_movements m
  where m.tenant_id=f.tenant_id and m.purchase_invoice_id=f.invoice_id;
  if (x->>'recognizedInventoryCost')::numeric<>expected_cost then
    raise exception 'Movement cost changed unexpectedly';
  end if;
  select r.version into v from public.shared_purchase_accounting_source_revisions r
  where r.tenant_id=f.tenant_id and r.invoice_id=f.invoice_id;
  if v<>4 then raise exception 'Revision metadata mismatch'; end if;
end;
$smoke$;

do $access$
begin
  if has_function_privilege('anon',
      'public.get_native_purchase_accounting_snapshot(uuid,uuid,text,text)','execute')
    or has_function_privilege('authenticated',
      'public.get_native_purchase_accounting_snapshot(uuid,uuid,text,text)','execute')
    or not has_function_privilege('service_role',
      'public.get_native_purchase_accounting_snapshot(uuid,uuid,text,text)','execute')
    or has_table_privilege('service_role',
      'public.shared_purchase_accounting_source_revisions','select')
  then raise exception 'Purchase accounting source privileges leaked'; end if;
end;
$access$;
rollback;
