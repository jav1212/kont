-- ADM-012 sales slice: exercise attribution, authorized consolidation and rollback.
do $smoke$
declare
  v_admin uuid;
  v_member uuid;
  v_org uuid;
  v_tenant uuid;
  v_member_role uuid;
  v_company jsonb;
  v_company_id text;
  v_branch_a jsonb;
  v_branch_b jsonb;
  v_hash text := gen_random_uuid()::text;
  v_invoice_a text;
  v_invoice_unassigned text;
  v_report jsonb;
begin
  select o.id,admin.user_id,member.user_id,o.legacy_tenant_id,member.role_id
    into v_org,v_admin,v_member,v_tenant,v_member_role
  from public.organizations o
  join public.organization_memberships admin on admin.organization_id=o.id and admin.status='active'
  join public.organization_roles ar on ar.id=admin.role_id and ar.organization_id=o.id and ar.status='active'
  join public.organization_role_permissions arp on arp.role_id=ar.id
    and arp.permission_code in ('companies.create','branches.create','branches.assign_users','sales.read','sales.confirm')
  join public.organization_memberships member on member.organization_id=o.id and member.status='active' and member.user_id<>admin.user_id
  join public.organization_roles mr on mr.id=member.role_id and mr.organization_id=o.id and mr.status='active'
  where o.status='active' and o.legacy_tenant_id is not null
    and ar.code in ('owner','admin') and mr.code not in ('owner','admin')
    and exists(select 1 from public.organization_role_permissions x where x.role_id=ar.id and x.permission_code='companies.create')
    and exists(select 1 from public.organization_role_permissions x where x.role_id=ar.id and x.permission_code='branches.assign_users')
    and exists(select 1 from public.organization_role_permissions x where x.role_id=ar.id and x.permission_code='sales.read')
    and not exists(select 1 from public.organization_role_permissions x where x.role_id=mr.id and x.permission_code='branches.select_any')
  order by o.id,admin.user_id,member.user_id limit 1;
  if not found then raise exception 'SMOKE_NO_ADMIN_AND_BRANCH_MEMBER'; end if;

  begin
    insert into public.organization_role_permissions(role_id,permission_code)
    values(v_member_role,'branches.read'),(v_member_role,'branches.select'),(v_member_role,'branches.consolidate'),
      (v_member_role,'sales.read'),(v_member_role,'sales.confirm') on conflict do nothing;
    execute 'set local role service_role';
    v_company := public.create_native_company(v_admin,v_org,'adm012-'||v_hash,'ADM012 sales consolidation '||v_hash,null,null,'VE','standard');
    v_company_id := v_company->>'id';
    v_branch_a := public.create_native_company_branch(v_admin,v_org,v_company_id,'adm012-a-'||v_hash,'A','Branch A');
    v_branch_b := public.create_native_company_branch(v_admin,v_org,v_company_id,'adm012-b-'||v_hash,'B','Branch B');
    perform public.set_native_company_branch_membership(v_admin,v_org,v_company_id,(v_branch_a->>'id')::uuid,v_member,'active',0);
    execute 'reset role';

    insert into public.shared_inventory_customers(tenant_id,id,company_id,rif,name)
      values(v_tenant,'adm012-customer-'||replace(v_hash,'-',''),v_company_id,'ADM012-'||replace(v_hash,'-',''),'ADM012 Smoke Customer');
    v_invoice_a := 'adm012-a-'||replace(v_hash,'-','');
    v_invoice_unassigned := 'adm012-u-'||replace(v_hash,'-','');
    insert into public.shared_inventory_sales_invoices(tenant_id,id,company_id,customer_id,invoice_number,invoice_date,period,status,subtotal,vat_amount,total,branch_id)
    values(v_tenant,v_invoice_a,v_company_id,'adm012-customer-'||replace(v_hash,'-',''),'ADM012-A-'||replace(v_hash,'-',''),date '2026-09-20','2026-09','borrador',100,16,116,null),
      (v_tenant,v_invoice_unassigned,v_company_id,'adm012-customer-'||replace(v_hash,'-',''),'ADM012-U-'||replace(v_hash,'-',''),date '2026-09-21','2026-09','borrador',50,8,58,null);
    insert into public.shared_inventory_sales_invoice_items(tenant_id,id,invoice_id,product_id,description,quantity,unit_price,line_total,vat_rate,currency,vat_base)
      values(v_tenant,'adm012-line-a-'||replace(v_hash,'-',''),v_invoice_a,null,'ADM012 service fixture',1,100,116,'exenta','VES',100),
        (v_tenant,'adm012-line-u-'||replace(v_hash,'-',''),v_invoice_unassigned,null,'ADM012 legacy fixture',1,50,58,'exenta','VES',50);
    execute 'set local role service_role';
    perform set_config('kontave.sales.branch_actor_user_id','',true);
    perform set_config('kontave.sales.branch_id','',true);
    begin
      update public.shared_inventory_sales_invoices set branch_id=(v_branch_a->>'id')::uuid
      where tenant_id=v_tenant and id=v_invoice_a;
      raise exception 'SMOKE_DIRECT_BRANCH_ASSIGNMENT_ACCEPTED';
    exception when others then if sqlerrm<>'SALES_BRANCH_ASSIGNMENT_RPC_REQUIRED' then raise; end if; end;
    if exists(select 1 from public.shared_inventory_sales_invoices where tenant_id=v_tenant and id=v_invoice_a and branch_id is not null)
      then raise exception 'SMOKE_DIRECT_BRANCH_ASSIGNMENT_PERSISTED'; end if;
    perform public.confirm_native_sales_invoice_branch_secure(v_admin,v_org,v_company_id,v_invoice_a,
      (v_branch_a->>'id')::uuid,false,null,null,null);
    perform public.shared_inventory_sales_invoice_confirm_attributed(v_tenant,v_invoice_unassigned,v_admin,false);
    if not exists(select 1 from public.shared_inventory_sales_invoices where tenant_id=v_tenant and id=v_invoice_a
      and status='confirmada' and branch_id=(v_branch_a->>'id')::uuid) then raise exception 'SMOKE_BRANCH_CONFIRMATION_PERSISTENCE'; end if;

    v_report := public.get_native_sales_branch_consolidation(v_admin,v_org,v_company_id,date '2026-09-01',date '2026-09-30',null);
    if jsonb_array_length(v_report->'rows')<>1 or v_report->'rows'->0->>'branchId' is distinct from v_branch_a->>'id'
      or v_report->'rows'->0->>'documentCount'<>'1' or v_report->'rows'->0->>'total'<>'116.00'
      or v_report->'coverage'->>'attributedConfirmedDocumentCount'<>'1'
      or v_report->'coverage'->>'unattributedConfirmedDocumentCount'<>'1'
      or v_report->'coverage'->>'includesUnattributed'<>'true' then raise exception 'SMOKE_ADMIN_CONSOLIDATION'; end if;

    v_report := public.get_native_sales_branch_consolidation(v_member,v_org,v_company_id,date '2026-09-01',date '2026-09-30',null);
    if jsonb_array_length(v_report->'rows')<>1 or v_report->'rows'->0->>'branchId' is distinct from v_branch_a->>'id'
      or v_report->'coverage'->>'unattributedConfirmedDocumentCount' is not null
      or v_report->'coverage'->>'includesUnattributed'<>'false' then raise exception 'SMOKE_MEMBER_SCOPE'; end if;
    begin
      perform public.get_native_sales_branch_consolidation(v_member,v_org,v_company_id,date '2026-09-01',date '2026-09-30',array[(v_branch_b->>'id')::uuid]);
      raise exception 'SMOKE_UNASSIGNED_BRANCH_REPORT_ACCEPTED';
    exception when others then if sqlerrm<>'SALES_BRANCH_CONSOLIDATION_ACCESS_DENIED' then raise; end if; end;
    begin
      perform public.get_native_sales_branch_consolidation(v_admin,v_org,v_company_id,date '2026-09-01',date '2027-09-02',null);
      raise exception 'SMOKE_OVERLONG_REPORT_ACCEPTED';
    exception when others then if sqlerrm<>'SALES_BRANCH_CONSOLIDATION_INVALID' then raise; end if; end;
    begin
      perform public.confirm_native_sales_invoice_branch_secure(v_member,v_org,v_company_id,'missing-invoice',(v_branch_b->>'id')::uuid,false,null,null,null);
      raise exception 'SMOKE_UNASSIGNED_BRANCH_CONFIRM_ACCEPTED';
    exception when others then if sqlerrm<>'SALES_BRANCH_ACCESS_DENIED' then raise; end if; end;
    begin
      perform public.confirm_native_sales_invoice_branch_secure(v_member,v_org,v_company_id,'missing-invoice',(v_branch_a->>'id')::uuid,false,null,null,null);
      raise exception 'SMOKE_EXPECTED_MISSING_INVOICE';
    exception when others then if sqlerrm<>'SALES_NOT_FOUND' then raise; end if; end;

    if has_function_privilege('anon','public.get_native_sales_branch_consolidation(uuid,uuid,text,date,date,uuid[])','execute')
      or has_function_privilege('authenticated','public.confirm_native_sales_invoice_branch_secure(uuid,uuid,text,text,uuid,boolean,text,text,text)','execute')
      or not has_function_privilege('service_role','public.get_native_sales_branch_consolidation(uuid,uuid,text,date,date,uuid[])','execute')
      then raise exception 'SMOKE_BRANCH_REPORT_RPC_ACL'; end if;
    if has_table_privilege('anon','public.shared_company_branch_memberships','select')
      or has_table_privilege('authenticated','public.shared_company_branch_memberships','insert') then raise exception 'SMOKE_BRANCH_MEMBERSHIP_TABLE_ACL'; end if;
    -- Legacy invoice table grants predate this additive change and are not altered here.
    raise exception 'ADM012_SMOKE_ROLLBACK';
  exception when others then
    if sqlerrm='ADM012_SMOKE_ROLLBACK' then null; else raise; end if;
  end;
  if exists(select 1 from public.shared_inventory_sales_invoices where tenant_id=v_tenant and id in (v_invoice_a,v_invoice_unassigned))
    or exists(select 1 from public.shared_inventory_customers where tenant_id=v_tenant and id like 'adm012-customer-%')
    or exists(select 1 from public.shared_company_branch_memberships where tenant_id=v_tenant and company_id=v_company_id)
    or exists(select 1 from public.shared_company_branch_membership_events where tenant_id=v_tenant and company_id=v_company_id)
    or exists(select 1 from public.shared_company_branches where tenant_id=v_tenant and company_id=v_company_id)
    or exists(select 1 from public.shared_companies where tenant_id=v_tenant and id=v_company_id)
    then raise exception 'SMOKE_FIXTURE_REMAINS'; end if;
end
$smoke$;
