-- Read-only checks for the shared-schema pilot.
-- Replace the tenant UUID only when running a different approved pilot.

WITH pilot AS (
    SELECT '624a5ef3-6e23-43ba-b3de-30686fa944e5'::uuid AS tenant_id
), tenant_info AS (
    SELECT t.id, t.schema_name
    FROM public.tenants t
    JOIN pilot p ON p.tenant_id = t.id
)
SELECT 'tenant_exists' AS check_name, count(*)::bigint AS value
FROM tenant_info;

-- Backfill parity for the core shared tables.
SELECT 'companies_count' AS check_name, count(*)::bigint AS shared_count
FROM public.shared_companies
WHERE tenant_id = '624a5ef3-6e23-43ba-b3de-30686fa944e5'::uuid;

-- Compare the shared count with the tenant schema in the SQL editor output.
DO $$
DECLARE
    v_schema text;
    v_legacy_count bigint;
    v_shared_count bigint;
BEGIN
    SELECT schema_name INTO v_schema FROM public.tenants
    WHERE id = '624a5ef3-6e23-43ba-b3de-30686fa944e5'::uuid;
    SELECT count(*) INTO v_shared_count FROM public.shared_companies
    WHERE tenant_id = '624a5ef3-6e23-43ba-b3de-30686fa944e5'::uuid;
    EXECUTE format('SELECT count(*) FROM %I.companies', v_schema) INTO v_legacy_count;
    RAISE NOTICE 'companies shared=% legacy=%', v_shared_count, v_legacy_count;
END $$;

-- Orphan and cross-tenant reference checks must return zero rows.
SELECT 'orphan_employees' AS check_name, count(*)::bigint AS violations
FROM public.shared_employees e
LEFT JOIN public.shared_companies c
  ON c.tenant_id = e.tenant_id AND c.id = e.company_id
WHERE e.tenant_id = '624a5ef3-6e23-43ba-b3de-30686fa944e5'::uuid
  AND c.id IS NULL
UNION ALL
SELECT 'orphan_purchase_invoices', count(*)::bigint
FROM public.shared_inventory_purchase_invoices f
LEFT JOIN public.shared_companies c
  ON c.tenant_id = f.tenant_id AND c.id = f.company_id
LEFT JOIN public.shared_inventory_suppliers s
  ON s.tenant_id = f.tenant_id AND s.id = f.supplier_id AND s.company_id = f.company_id
WHERE f.tenant_id = '624a5ef3-6e23-43ba-b3de-30686fa944e5'::uuid
  AND (c.id IS NULL OR s.id IS NULL)
UNION ALL
SELECT 'orphan_purchase_items', count(*)::bigint
FROM public.shared_inventory_purchase_invoice_items i
LEFT JOIN public.shared_inventory_purchase_invoices f
  ON f.tenant_id = i.tenant_id AND f.id = i.invoice_id
LEFT JOIN public.shared_inventory_products p
  ON p.tenant_id = i.tenant_id AND p.id = i.product_id AND p.company_id = f.company_id
WHERE i.tenant_id = '624a5ef3-6e23-43ba-b3de-30686fa944e5'::uuid
  AND (f.id IS NULL OR p.id IS NULL);

-- RLS must be enabled for every table used by the pilot.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
      'shared_companies', 'shared_employees', 'shared_payroll_runs',
      'shared_payroll_receipts', 'shared_inventory_products',
      'shared_inventory_movements', 'shared_inventory_suppliers',
      'shared_inventory_purchase_invoices', 'shared_inventory_purchase_invoice_items'
  )
ORDER BY c.relname;

-- Only service_role should execute the shared write functions.
SELECT p.proname AS function_name,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'shared_inventory_%'
  AND p.prokind = 'f'
ORDER BY p.proname;
