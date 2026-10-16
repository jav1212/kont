-- Read-only preflight for ADM-012 historical attribution. Run through Supabase MCP
-- before applying migrations 360/361; no business rows are changed.
with independent as (
  select m.tenant_id, m.company_id, m.id, m.type, m.quantity,
    m.unit_cost, m.total_cost, m.reference, p.measure_unit,
    case when a.movement_id is null then false else true end as attributed
  from public.shared_inventory_movements m
  join public.shared_inventory_products p on p.tenant_id=m.tenant_id
    and p.company_id=m.company_id and p.id=m.product_id
  left join public.shared_inventory_manual_branch_movements a
    on a.tenant_id=m.tenant_id and a.company_id=m.company_id
      and a.movement_id=m.id
  where m.purchase_invoice_id is null and m.sales_invoice_id is null
), type_counts as (
  select type, count(*)::bigint as total,
    count(*) filter (where not attributed)::bigint as unattributed
  from independent group by type
)
select jsonb_build_object(
  'independentTotal', (select count(*) from independent),
  'unattributedTotal', (select count(*) from independent where not attributed),
  'typeCounts', coalesce((select jsonb_agg(jsonb_build_object(
    'type',type,'total',total,'unattributed',unattributed) order by type)
    from type_counts), '[]'::jsonb),
  'unsupportedType', (select count(*) from independent where type not in
    ('entrada','salida','ajuste_positivo','ajuste_negativo',
     'devolucion_entrada','devolucion_salida','autoconsumo')),
  'negativeUnitCost', (select count(*) from independent where unit_cost<0),
  'negativeTotalCost', (select count(*) from independent where total_cost<0),
  'unitOver64', (select count(*) from independent where length(measure_unit)>64),
  'referenceOver4096', (select count(*) from independent where length(reference)>4096),
  'referenceWithControl', (select count(*) from independent
    where reference ~ '[[:cntrl:]]'),
  'nonPositiveQuantity', (select count(*) from independent where quantity<=0),
  'existingMappings', (select count(*) from independent where attributed)
) as preflight;
