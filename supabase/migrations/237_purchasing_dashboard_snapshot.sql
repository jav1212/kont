-- Fiscal purchasing dashboard over the shared operational source of truth.
alter table public.organization_delegation_scopes drop constraint if exists organization_delegation_scopes_scope_check;
alter table public.organization_delegation_scopes add constraint organization_delegation_scopes_scope_check check(scope in('accounting','payroll','inventory','purchases','tax','documents','administration'));

insert into public.module_capabilities(module_id,capability_code)
select id,'purchases.dashboard' from public.module_catalog where code='purchases' on conflict do nothing;

create or replace function public.sync_company_inventory_bundled_modules()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_code text;v_status text;
begin
  select code into v_code from public.module_catalog where id=new.module_id;
  if v_code<>'inventory' then return new;end if;
  v_status:=case when new.status='active'then'active'else'suspended'end;
  insert into public.shared_company_module_activations(tenant_id,company_id,module_id,status,activated_at,suspended_at,updated_at)
  select new.tenant_id,new.company_id,m.id,v_status,
    case when v_status='active'then coalesce(new.activated_at,now())else coalesce(existing.activated_at,new.activated_at,now())end,
    case when v_status='suspended'then coalesce(new.suspended_at,now())else null end,now()
  from public.module_catalog m
  left join public.shared_company_module_activations existing on existing.tenant_id=new.tenant_id and existing.company_id=new.company_id and existing.module_id=m.id
  where m.code in('purchases','sales')
  on conflict(tenant_id,company_id,module_id)do update set status=excluded.status,activated_at=excluded.activated_at,suspended_at=excluded.suspended_at,updated_at=excluded.updated_at;
  return new;
end $$;
revoke all on function public.sync_company_inventory_bundled_modules()from public,anon,authenticated;
drop trigger if exists shared_company_inventory_sync_bundled_modules on public.shared_company_module_activations;
create trigger shared_company_inventory_sync_bundled_modules after insert or update of status on public.shared_company_module_activations for each row execute function public.sync_company_inventory_bundled_modules();
update public.shared_company_module_activations a set status=a.status,updated_at=now() from public.module_catalog m where m.id=a.module_id and m.code='inventory';

create or replace function public.get_shared_purchasing_dashboard_snapshot(
 p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_from date,p_to date,p_granularity text default'day',p_recent_limit integer default 5
)returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_tenant_id uuid;v_allowed boolean;v_result jsonb;
begin
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>365 or p_granularity<>'day' or p_recent_limit<1 or p_recent_limit>100 then raise exception'PURCHASING_DASHBOARD_INVALID';end if;
 select tenant_id into v_tenant_id from public.shared_companies where organization_id=p_organization_id and id=p_company_id;
 if v_tenant_id is null then raise exception'PURCHASING_DASHBOARD_ACCESS_DENIED';end if;
 select exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=p_actor_user_id and m.status='active')or exists(
  select 1 from public.organization_delegation_member_assignments a join public.organization_delegations d on d.id=a.delegation_id join public.organization_delegation_scopes s on s.delegation_id=d.id and s.scope='purchases'
  where a.user_id=p_actor_user_id and a.status='active'and d.client_organization_id=p_organization_id and d.status='active'and d.valid_from<=now()and(d.valid_until is null or d.valid_until>now()))into v_allowed;
 if not coalesce(v_allowed,false)then raise exception'PURCHASING_DASHBOARD_ACCESS_DENIED';end if;
 with invoices as(
  select i.*,s.id supplier_match_id,s.name supplier_name,s.rif supplier_rif from public.shared_inventory_purchase_invoices i
  left join public.shared_inventory_suppliers s on s.tenant_id=i.tenant_id and s.company_id=i.company_id and s.id=i.supplier_id
  where i.tenant_id=v_tenant_id and i.company_id=p_company_id and i.invoice_date between p_from and p_to
 ),days as(select generate_series(p_from,p_to,interval'1 day')::date bucket_date),daily as(
  select invoice_date bucket_date,coalesce(sum(total)filter(where status='confirmada'),0)purchase_total,coalesce(sum(vat_amount)filter(where status='confirmada'),0)vat_total,
   count(*)filter(where status='confirmada')::integer confirmed_count,count(*)filter(where status='borrador')::integer draft_count from invoices group by invoice_date
 ),supplier_totals as(
  select supplier_match_id,coalesce(nullif(trim(supplier_name),''),'Proveedor no identificado')supplier_name,nullif(trim(supplier_rif),'')supplier_rif,
   sum(total)purchase_total,count(*)::integer document_count from invoices where status='confirmada'
  group by supplier_match_id,coalesce(nullif(trim(supplier_name),''),'Proveedor no identificado'),nullif(trim(supplier_rif),'')
  order by sum(total)desc,coalesce(nullif(trim(supplier_name),''),'Proveedor no identificado'),supplier_match_id nulls last limit 5
 )
 select jsonb_build_object(
  'period',jsonb_build_object('from',p_from::text,'to',p_to::text,'granularity','day'),
  'summary',jsonb_build_object(
   'confirmedPurchaseTotal',jsonb_build_object('amount',coalesce((select sum(total)::text from invoices where status='confirmada'),'0'),'currency','VES'),
   'vatCreditTotal',jsonb_build_object('amount',coalesce((select sum(vat_amount)::text from invoices where status='confirmada'),'0'),'currency','VES'),
   'vatWithheldTotal',jsonb_build_object('amount',coalesce((select sum(coalesce(vat_retention_amount,0))::text from invoices where status='confirmada'),'0'),'currency','VES'),
   'confirmedDocumentCount',(select count(*)::integer from invoices where status='confirmada'),'draftDocumentCount',(select count(*)::integer from invoices where status='borrador')),
  'daily',coalesce((select jsonb_agg(jsonb_build_object('date',d.bucket_date::text,'confirmedPurchaseTotal',jsonb_build_object('amount',coalesce(x.purchase_total,0)::text,'currency','VES'),'vatCreditTotal',jsonb_build_object('amount',coalesce(x.vat_total,0)::text,'currency','VES'),'confirmedDocumentCount',coalesce(x.confirmed_count,0),'draftDocumentCount',coalesce(x.draft_count,0))order by d.bucket_date)from days d left join daily x on x.bucket_date=d.bucket_date),'[]'::jsonb),
  'topSuppliers',coalesce((select jsonb_agg(jsonb_build_object('supplier',jsonb_build_object('id',supplier_match_id,'legalName',supplier_name,'taxIdentifier',supplier_rif),'confirmedPurchaseTotal',jsonb_build_object('amount',purchase_total::text,'currency','VES'),'confirmedDocumentCount',document_count)order by purchase_total desc,supplier_name,supplier_match_id nulls last)from supplier_totals),'[]'::jsonb),
  'recentDocuments',coalesce((select jsonb_agg(item order by fiscal_date desc,created_at desc,document_id desc)from(select jsonb_build_object(
   'id',i.id,'documentType',case i.document_type when'nota_credito'then'credit_note'when'nota_debito'then'debit_note'else'invoice'end,'invoiceNumber',i.invoice_number,'controlNumber',nullif(trim(i.control_number),''),
   'supplier',jsonb_build_object('id',i.supplier_match_id,'legalName',coalesce(nullif(trim(i.supplier_name),''),'Proveedor no identificado'),'taxIdentifier',nullif(trim(i.supplier_rif),'')),
   'fiscalDate',i.invoice_date::text,'status',case i.status when'confirmada'then'confirmed'else'draft'end,
   'functionalAmounts',jsonb_build_object('subtotal',jsonb_build_object('amount',i.subtotal::text,'currency','VES'),'vat',jsonb_build_object('amount',i.vat_amount::text,'currency','VES'),'vatWithheld',jsonb_build_object('amount',coalesce(i.vat_retention_amount,0)::text,'currency','VES'),'total',jsonb_build_object('amount',i.total::text,'currency','VES')),
   'transactionCurrency',i.currency_code,'transactionAmounts',jsonb_build_object(
    'subtotal',case when i.source_subtotal is not null then jsonb_build_object('amount',i.source_subtotal::text,'currency',i.currency_code)when i.currency_code='VES'then jsonb_build_object('amount',i.subtotal::text,'currency','VES')else null end,
    'vat',case when i.source_vat_amount is not null then jsonb_build_object('amount',i.source_vat_amount::text,'currency',i.currency_code)when i.currency_code='VES'then jsonb_build_object('amount',i.vat_amount::text,'currency','VES')else null end,
    'total',case when i.source_total is not null then jsonb_build_object('amount',i.source_total::text,'currency',i.currency_code)when i.currency_code='VES'then jsonb_build_object('amount',i.total::text,'currency','VES')else null end))item,
    i.invoice_date fiscal_date,i.created_at,i.id document_id
   from invoices i order by i.invoice_date desc,i.created_at desc,i.id desc limit p_recent_limit)r),'[]'::jsonb),'generatedAt',now()::text)into v_result;
 return v_result;
end $$;
revoke all on function public.get_shared_purchasing_dashboard_snapshot(uuid,uuid,text,date,date,text,integer)from public,anon,authenticated;
grant execute on function public.get_shared_purchasing_dashboard_snapshot(uuid,uuid,text,date,date,text,integer)to service_role;
create index if not exists shared_purchase_invoices_confirmed_supplier_date_idx on public.shared_inventory_purchase_invoices(tenant_id,company_id,supplier_id,invoice_date desc)where status='confirmada';
