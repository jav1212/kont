-- Read-only checks for shared-schema tenant isolation.
-- Expected result: every violation count is zero.

SELECT 'employees_without_company' AS check_name, count(*)::bigint AS violations
FROM public.shared_employees e
LEFT JOIN public.shared_companies c
  ON c.tenant_id = e.tenant_id AND c.id = e.company_id
WHERE c.id IS NULL
UNION ALL
SELECT 'accounting_accounts_without_company', count(*)
FROM public.shared_accounting_accounts a
LEFT JOIN public.shared_companies c
  ON c.tenant_id = a.tenant_id AND c.id = a.company_id
WHERE c.id IS NULL
UNION ALL
SELECT 'accounting_accounts_cross_tenant_chart', count(*)
FROM public.shared_accounting_accounts a
JOIN public.shared_accounting_charts c
  ON c.id = a.chart_id AND c.tenant_id <> a.tenant_id
UNION ALL
SELECT 'purchase_items_cross_tenant_invoice', count(*)
FROM public.shared_inventory_purchase_invoice_items i
JOIN public.shared_inventory_purchase_invoices f ON f.id = i.invoice_id
WHERE f.tenant_id <> i.tenant_id
UNION ALL
SELECT 'sales_items_cross_tenant_invoice', count(*)
FROM public.shared_inventory_sales_invoice_items i
JOIN public.shared_inventory_sales_invoices f ON f.id = i.invoice_id
WHERE f.tenant_id <> i.tenant_id;

SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = c.relname)::int AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname LIKE 'shared_%'
  AND c.relkind = 'r'
ORDER BY c.relname;

SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'shared_%'
ORDER BY p.proname;
