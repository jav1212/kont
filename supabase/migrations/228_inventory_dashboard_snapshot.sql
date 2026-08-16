-- Inventory dashboard read model. Values represent inventory cost in VES;
-- heterogeneous physical quantities remain separated by unit of measure.
create or replace function public.get_shared_inventory_dashboard_snapshot(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,
  p_from date,p_to date,p_granularity text default 'day',p_recent_limit integer default 5
)returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_tenant_id uuid;v_allowed boolean;v_result jsonb;
begin
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>365 or p_granularity<>'day' or p_recent_limit<1 or p_recent_limit>100 then
    raise exception 'INVENTORY_DASHBOARD_INVALID';
  end if;
  select c.tenant_id into v_tenant_id from public.shared_companies c where c.organization_id=p_organization_id and c.id=p_company_id;
  if v_tenant_id is null then raise exception 'INVENTORY_DASHBOARD_ACCESS_DENIED';end if;
  select
    exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=p_actor_user_id and m.status='active')
    or exists(
      select 1 from public.organization_delegation_member_assignments a
      join public.organization_delegations d on d.id=a.delegation_id
      join public.organization_delegation_scopes s on s.delegation_id=d.id and s.scope='inventory'
      where a.user_id=p_actor_user_id and a.status='active' and d.client_organization_id=p_organization_id
        and d.status='active' and d.valid_from<=now() and(d.valid_until is null or d.valid_until>now())
    ) into v_allowed;
  if not coalesce(v_allowed,false)then raise exception 'INVENTORY_DASHBOARD_ACCESS_DENIED';end if;

  with period_movements as(
    select m.*,p.measure_unit,
      case when m.type in('entrada','entrada_compra','entrada_produccion','devolucion_venta','ajuste_positivo')then'inbound'
           when m.type in('salida','salida_venta','salida_produccion','devolucion_compra','devolucion_entrada','autoconsumo','ajuste_negativo')then'outbound' end direction
    from public.shared_inventory_movements m join public.shared_inventory_products p on p.tenant_id=m.tenant_id and p.id=m.product_id
    where m.tenant_id=v_tenant_id and m.company_id=p_company_id and m.date between p_from and p_to
  ),days as(select generate_series(p_from,p_to,interval'1 day')::date bucket_date),day_flows as(
    select m.date bucket_date,
      coalesce(sum(abs(m.total_cost))filter(where direction='inbound'),0)inbound_value,
      coalesce(sum(abs(m.total_cost))filter(where direction='outbound'),0)outbound_value,
      count(*)filter(where direction is not null)::integer movement_count
    from period_movements m group by m.date
  ),summary_quantities as(
    select coalesce(nullif(trim(measure_unit),''),'unidad')unit,
      coalesce(sum(abs(quantity))filter(where direction='inbound'),0)inbound,
      coalesce(sum(abs(quantity))filter(where direction='outbound'),0)outbound
    from period_movements where direction is not null group by coalesce(nullif(trim(measure_unit),''),'unidad')
  ),daily_quantities as(
    select date bucket_date,coalesce(nullif(trim(measure_unit),''),'unidad')unit,
      coalesce(sum(abs(quantity))filter(where direction='inbound'),0)inbound,
      coalesce(sum(abs(quantity))filter(where direction='outbound'),0)outbound
    from period_movements where direction is not null group by date,coalesce(nullif(trim(measure_unit),''),'unidad')
  )
  select jsonb_build_object(
    'period',jsonb_build_object('from',p_from::text,'to',p_to::text,'granularity','day'),
    'summary',jsonb_build_object(
      'inboundValue',jsonb_build_object('amount',coalesce((select round(sum(abs(total_cost)),2)::text from period_movements where direction='inbound'),'0.00'),'currency','VES'),
      'outboundValue',jsonb_build_object('amount',coalesce((select round(sum(abs(total_cost)),2)::text from period_movements where direction='outbound'),'0.00'),'currency','VES'),
      'movementCount',(select count(*)::integer from period_movements where direction is not null),
      'inventoryValue',jsonb_build_object('amount',coalesce((select round(sum(coalesce(current_stock,0)*coalesce(average_cost,0)),2)::text from public.shared_inventory_products where tenant_id=v_tenant_id and company_id=p_company_id and active),'0.00'),'currency','VES'),
      'quantities',coalesce((select jsonb_agg(jsonb_build_object('unit',unit,'inbound',round(inbound,4)::text,'outbound',round(outbound,4)::text)order by unit)from summary_quantities),'[]'::jsonb),
      'valuationDate',current_date::text
    ),
    'charts',coalesce((select jsonb_agg(jsonb_build_object(
      'date',d.bucket_date::text,
      'inboundValue',jsonb_build_object('amount',round(coalesce(f.inbound_value,0),2)::text,'currency','VES'),
      'outboundValue',jsonb_build_object('amount',round(coalesce(f.outbound_value,0),2)::text,'currency','VES'),
      'movementCount',coalesce(f.movement_count,0),
      'quantities',coalesce((select jsonb_agg(jsonb_build_object('unit',q.unit,'inbound',round(q.inbound,4)::text,'outbound',round(q.outbound,4)::text)order by q.unit)from daily_quantities q where q.bucket_date=d.bucket_date),'[]'::jsonb)
    )order by d.bucket_date)from days d left join day_flows f on f.bucket_date=d.bucket_date),'[]'::jsonb),
    'recentSales',coalesce((select jsonb_agg(item order by item->>'date' desc,item->>'id' desc)from(
      select jsonb_build_object('id',i.id,'recordType',case i.document_type when'nota_entrega'then'delivery_note'when'nota_credito'then'credit_note'when'nota_debito'then'debit_note'when'venta'then'invoice'when'factura'then'invoice'else'other'end,
        'number',coalesce(nullif(i.invoice_number,''),i.id),'counterparty',c.name,'date',i.invoice_date::text,'status',i.status,
        'total',jsonb_build_object('amount',round(coalesce(i.total,0),2)::text,'currency','VES'),'transactionCurrency',coalesce(i.currency_code,'VES'),'sourceTotal',case when i.source_total is null then null else round(i.source_total,2)::text end)item
      from public.shared_inventory_sales_invoices i left join public.shared_inventory_customers c on c.tenant_id=i.tenant_id and c.id=i.customer_id
      where i.tenant_id=v_tenant_id and i.company_id=p_company_id and i.invoice_date between p_from and p_to order by i.invoice_date desc,i.created_at desc limit p_recent_limit
    )sales),'[]'::jsonb),
    'recentPurchases',coalesce((select jsonb_agg(item order by item->>'date' desc,item->>'id' desc)from(
      select jsonb_build_object('id',i.id,'recordType',case i.document_type when'nota_entrega'then'delivery_note'when'nota_credito'then'credit_note'when'nota_debito'then'debit_note'when'factura'then'invoice'else'other'end,
        'number',coalesce(nullif(i.invoice_number,''),i.id),'counterparty',s.name,'date',i.invoice_date::text,'status',i.status,
        'total',jsonb_build_object('amount',round(coalesce(i.total,0),2)::text,'currency','VES'),'transactionCurrency',coalesce(i.currency_code,'VES'),'sourceTotal',case when i.source_total is null then null else round(i.source_total,2)::text end)item
      from public.shared_inventory_purchase_invoices i left join public.shared_inventory_suppliers s on s.tenant_id=i.tenant_id and s.id=i.supplier_id
      where i.tenant_id=v_tenant_id and i.company_id=p_company_id and i.invoice_date between p_from and p_to order by i.invoice_date desc,i.created_at desc limit p_recent_limit
    )purchases),'[]'::jsonb),
    'generatedAt',now()::text
  )into v_result;
  return v_result;
end $$;
revoke all on function public.get_shared_inventory_dashboard_snapshot(uuid,uuid,text,date,date,text,integer)from public,anon,authenticated;
grant execute on function public.get_shared_inventory_dashboard_snapshot(uuid,uuid,text,date,date,text,integer)to service_role;
create index if not exists shared_inventory_movements_dashboard_idx on public.shared_inventory_movements(tenant_id,company_id,date desc);
create index if not exists shared_sales_invoices_dashboard_idx on public.shared_inventory_sales_invoices(tenant_id,company_id,invoice_date desc);
create index if not exists shared_purchase_invoices_dashboard_idx on public.shared_inventory_purchase_invoices(tenant_id,company_id,invoice_date desc);
