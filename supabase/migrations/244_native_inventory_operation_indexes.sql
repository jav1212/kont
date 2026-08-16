-- Cover operation-line foreign keys and common detail joins.
create index if not exists shared_inventory_operation_lines_operation_idx on public.shared_inventory_operation_lines(tenant_id,operation_id);
create index if not exists shared_inventory_operation_lines_product_idx on public.shared_inventory_operation_lines(tenant_id,product_id);
