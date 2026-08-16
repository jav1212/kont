-- Preserve the original commercial-document fields for compatibility while
-- making the inventory dashboard expose its own physical movement recents.
alter function public.get_shared_inventory_dashboard_snapshot(uuid,uuid,text,date,date,text,integer)
  rename to get_shared_inventory_dashboard_snapshot_core;

create or replace function public.get_shared_inventory_dashboard_snapshot(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,
  p_from date,p_to date,p_granularity text default 'day',p_recent_limit integer default 5
)returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_snapshot jsonb;v_tenant_id uuid;v_inbound jsonb;v_outbound jsonb;
begin
  v_snapshot:=public.get_shared_inventory_dashboard_snapshot_core(p_actor_user_id,p_organization_id,p_company_id,p_from,p_to,p_granularity,p_recent_limit);
  select tenant_id into v_tenant_id from public.shared_companies where organization_id=p_organization_id and id=p_company_id;

  select coalesce(jsonb_agg(item order by item->>'effectiveDate' desc,item->>'id' desc),'[]'::jsonb)into v_inbound from(
    select jsonb_build_object(
      'id',m.id,'productId',m.product_id,'productName',p.name,'productSku',p.code,'effectiveDate',m.date::text,
      'movementType',m.type,'direction','inbound','quantity',jsonb_build_object('value',abs(m.quantity)::text,'unit',public.native_product_unit(p.measure_unit)),
      'totalCost',jsonb_build_object('amount',round(abs(m.total_cost),2)::text,'currency','VES'),'reference',nullif(m.reference,'')
    )item
    from public.shared_inventory_movements m join public.shared_inventory_products p on p.tenant_id=m.tenant_id and p.id=m.product_id
    where m.tenant_id=v_tenant_id and m.company_id=p_company_id and m.date between p_from and p_to
      and m.type in('entrada','entrada_compra','entrada_produccion','ajuste_positivo','devolucion_salida','devolucion_venta')
    order by m.date desc,m.created_at desc,m.id desc limit p_recent_limit
  )recent;

  select coalesce(jsonb_agg(item order by item->>'effectiveDate' desc,item->>'id' desc),'[]'::jsonb)into v_outbound from(
    select jsonb_build_object(
      'id',m.id,'productId',m.product_id,'productName',p.name,'productSku',p.code,'effectiveDate',m.date::text,
      'movementType',m.type,'direction','outbound','quantity',jsonb_build_object('value',abs(m.quantity)::text,'unit',public.native_product_unit(p.measure_unit)),
      'totalCost',jsonb_build_object('amount',round(abs(m.total_cost),2)::text,'currency','VES'),'reference',nullif(m.reference,'')
    )item
    from public.shared_inventory_movements m join public.shared_inventory_products p on p.tenant_id=m.tenant_id and p.id=m.product_id
    where m.tenant_id=v_tenant_id and m.company_id=p_company_id and m.date between p_from and p_to
      and m.type in('salida','salida_venta','salida_produccion','ajuste_negativo','devolucion_entrada','devolucion_compra','autoconsumo')
    order by m.date desc,m.created_at desc,m.id desc limit p_recent_limit
  )recent;

  return v_snapshot||jsonb_build_object('recentInboundMovements',v_inbound,'recentOutboundMovements',v_outbound);
end$$;

revoke all on function public.get_shared_inventory_dashboard_snapshot_core(uuid,uuid,text,date,date,text,integer)from public,anon,authenticated;
grant execute on function public.get_shared_inventory_dashboard_snapshot_core(uuid,uuid,text,date,date,text,integer)to service_role;
revoke all on function public.get_shared_inventory_dashboard_snapshot(uuid,uuid,text,date,date,text,integer)from public,anon,authenticated;
grant execute on function public.get_shared_inventory_dashboard_snapshot(uuid,uuid,text,date,date,text,integer)to service_role;
