-- Read-only preflight for migration 364. Run through Supabase MCP in development.
select jsonb_build_object(
  'readinessRpcInstalled', to_regprocedure(
    'public.get_native_inventory_branch_stock_readiness(uuid,uuid,text,integer)') is not null,
  'manualMappingTableInstalled', to_regclass(
    'public.shared_inventory_manual_branch_movements') is not null,
  'readinessRpcServiceRoleOnly', (
    select has_function_privilege('service_role',oid,'EXECUTE')
      and not has_function_privilege('authenticated',oid,'EXECUTE')
      and not has_function_privilege('anon',oid,'EXECUTE')
    from pg_proc where oid=to_regprocedure(
      'public.get_native_inventory_branch_stock_readiness(uuid,uuid,text,integer)')
  ),
  'manualMappings', (select count(*) from public.shared_inventory_manual_branch_movements),
  'independentMovements', (select count(*) from public.shared_inventory_movements
    where purchase_invoice_id is null and sales_invoice_id is null)
) as preflight;
