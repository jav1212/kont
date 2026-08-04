# Shared-schema cutover inventory

Pilot tenant: `624a5ef3-6e23-43ba-b3de-30686fa944e5` (`oficinakm11`).

## Current coverage

| Module | Shared tables/migrations | Shared repository | Shared transactional SQL | Runtime status |
| --- | --- | --- | --- | --- |
| Companies | `shared_companies` / 121 | Yes | No | Pilot-enabled |
| Employees | `shared_employees`, salary history / 121-123 | Yes | Trigger only | Pilot-enabled |
| Payroll | runs and receipts / 125 | Yes | No | Pilot-enabled |
| Inventory core | products, departments, movements / 124, 126-127 | Yes | `shared_inventory_movement_save` | Pilot-enabled for core CRUD |
| Purchases | suppliers, invoices and items / 128-129 | No | No | Legacy RPC |
| Sales | customers, invoices and items / 130 | No | No | Legacy RPC |
| Accounting | charts, accounts, periods, entries and integrations / 131 | No | No | Legacy RPC |
| Payroll auxiliary | AR-I, work hours and benefit runs / 132 | No | No | Legacy RPC |
| Documents | folders and documents / 133 | No | No | Legacy RPC |

## Legacy RPC groups

- Companies, employees and payroll history: `tenant_company_*`, `tenant_employees_*`, `tenant_payroll_*`.
- Inventory core and reports: `tenant_inventario_productos_*`, `tenant_inventario_departamentos_*`, `tenant_inventario_movimientos_*`, `tenant_inventario_reporte_*`, `tenant_inventario_libro_*`.
- Purchases: `tenant_inventario_proveedores_*`, `tenant_inventario_factura_*`, retention and purchase-ledger functions.
- Sales: `tenant_ventas_*`.
- Accounting: `tenant_accounting_*`.
- Payroll auxiliary: `tenant_ari_*`, `tenant_cesta_ticket_*`, `tenant_bono_guerra_*`, `tenant_bonificaciones_*`.
- Documents: `tenant_documents_*`.

## Cutover rules

1. Every shared row must carry `tenant_id`; company-scoped rows must also carry `company_id`.
2. Repositories and SQL functions must validate that referenced records belong to the same tenant.
3. A module is not cut over until reads, writes, batch operations and reports use the same shared contract.
4. The pilot allowlist is the only runtime activation mechanism; non-pilot tenants remain on legacy RPCs.
5. Legacy objects are retained until backup, parity, isolation, atomicity and rollback checks pass.

## Next implementation order

1. Complete shared contracts and transactional functions for purchases.
2. Add purchase repositories and migrate purchase CRUD/confirmation for the pilot.
3. Add sales repositories and transactional invoice confirmation.
4. Add accounting repositories and journal-entry transactions.
5. Migrate reports only after their source module is fully shared.
