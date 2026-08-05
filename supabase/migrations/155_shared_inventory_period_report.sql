-- Period report for the shared inventory schema.
-- Only products with movement or a confirmed purchase invoice in the requested
-- period are returned. Every relation is constrained by tenant_id.

create or replace function public.shared_inventory_period_report_get(
    p_tenant_id uuid,
    p_company_id text,
    p_period text
)
returns jsonb
language sql
security definer
set search_path = public
as $function$
with period_products as (
    select m.product_id
    from public.shared_inventory_movements m
    where m.tenant_id = p_tenant_id
      and m.company_id = p_company_id
      and m.period = p_period
    union
    select i.product_id
    from public.shared_inventory_purchase_invoice_items i
    join public.shared_inventory_purchase_invoices f
      on f.tenant_id = i.tenant_id and f.id = i.invoice_id
    where f.tenant_id = p_tenant_id
      and f.company_id = p_company_id
      and f.period = p_period
      and f.status = 'confirmada'
),
inv_inicial as (
    select distinct on (m.product_id) m.product_id, m.balance_quantity as saldo
    from public.shared_inventory_movements m
    where m.tenant_id = p_tenant_id
      and m.company_id = p_company_id
      and m.period < p_period
    order by m.product_id, m.period desc, m.created_at desc
),
mov_periodo as (
    select
        m.product_id,
        sum(case when m.type in ('entrada','devolucion_salida','ajuste_positivo') then m.quantity else 0 end) as entradas,
        sum(case when m.type in ('salida','devolucion_entrada','ajuste_negativo','autoconsumo') then m.quantity else 0 end) as salidas,
        sum(case when m.type in ('entrada','devolucion_salida','ajuste_positivo') then coalesce(m.total_cost, 0) else 0 end) as costo_entradas_bs,
        sum(case when m.type = 'salida' then coalesce(m.sale_price_unit * m.quantity, m.total_cost, 0) else 0 end) as total_salidas_s_iva_bs,
        sum(case when m.type in ('salida','devolucion_entrada','ajuste_negativo','autoconsumo') then coalesce(m.total_cost, 0) else 0 end) as costo_salidas_bs,
        sum(case when m.type = 'autoconsumo' then coalesce(m.total_cost, 0) else 0 end) as costo_autoconsumo
    from public.shared_inventory_movements m
    where m.tenant_id = p_tenant_id
      and m.company_id = p_company_id
      and m.period = p_period
    group by m.product_id
),
supplier_por_producto as (
    select distinct on (i.product_id) i.product_id, s.name as supplier_name
    from public.shared_inventory_purchase_invoice_items i
    join public.shared_inventory_purchase_invoices f
      on f.tenant_id = i.tenant_id and f.id = i.invoice_id
    join public.shared_inventory_suppliers s
      on s.tenant_id = f.tenant_id and s.id = f.supplier_id
    where f.tenant_id = p_tenant_id
      and f.company_id = p_company_id
      and f.period = p_period
      and f.status = 'confirmada'
    order by i.product_id, f.invoice_date desc, f.created_at desc
)
select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
from (
    select
        p.code,
        p.name,
        coalesce(d.name, '') as departamento_nombre,
        coalesce(sp.supplier_name, '') as proveedor_nombre,
        p.vat_type as iva_tipo,
        coalesce(ii.saldo, 0) as inventario_inicial,
        p.average_cost as costo_promedio,
        coalesce(mp.entradas, 0) as entradas,
        coalesce(mp.salidas, 0) as salidas,
        p.current_stock as existencia_actual,
        coalesce(mp.costo_entradas_bs, 0) as costo_entradas_bs,
        coalesce(mp.total_salidas_s_iva_bs, 0) as total_salidas_s_iva_bs,
        coalesce(mp.costo_salidas_bs, 0) as costo_salidas_bs,
        coalesce(mp.costo_autoconsumo, 0) as costo_autoconsumo,
        p.current_stock * p.average_cost as costo_actual_bs
    from public.shared_inventory_products p
    join period_products eligible on eligible.product_id = p.id
    left join public.shared_inventory_departments d
      on d.tenant_id = p.tenant_id and d.company_id = p.company_id and d.id = p.department_id
    left join inv_inicial ii on ii.product_id = p.id
    left join mov_periodo mp on mp.product_id = p.id
    left join supplier_por_producto sp on sp.product_id = p.id
    where p.tenant_id = p_tenant_id
      and p.company_id = p_company_id
      and p.active = true
    order by coalesce(d.name, 'ZZZZ'), p.name
) t
$function$;

revoke all on function public.shared_inventory_period_report_get(uuid, text, text) from public, anon, authenticated;
grant execute on function public.shared_inventory_period_report_get(uuid, text, text) to service_role;
