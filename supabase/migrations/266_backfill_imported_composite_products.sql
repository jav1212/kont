-- Classify legacy catalog rows explicitly imported as compound products. This
-- deliberately leaves stock-bearing rows and existing recipe components alone
-- so they can be reviewed before changing their inventory representation.
update public.shared_inventory_products as product
set composition_kind = 'composite'
where product.composition_kind = 'simple'
  and product.current_stock = 0
  and lower(btrim(product.custom_fields ->> 'tipo_origen')) = 'compuesto'
  and not exists (
    select 1
    from public.shared_inventory_product_components as component
    where component.tenant_id = product.tenant_id
      and component.component_product_id = product.id
  );
