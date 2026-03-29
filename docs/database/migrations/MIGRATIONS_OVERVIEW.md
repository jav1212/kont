# Migrations Overview

This document gives a high-level map of the migration history.

## Purpose

The migration set shows how the database evolved from:

- a basic SaaS/public schema
- to tenant provisioning
- to payroll
- to inventory
- to memberships
- to documents
- to storage/branding additions
- to accounting module

## Evolution by stage

### Stage 1 - SaaS platform foundation

Main migrations:
- `001_saas_public_schema.sql`
- `002_provision_tenant_function.sql`
- `003_admin_bi_views.sql`
- `004_tenant_metrics_triggers.sql`
- `005_tenant_rpc_functions.sql`
- `006_plan_limits_enforcement.sql`
- `007_security_and_performance_fixes.sql`
- `008_consolidate_rls_policies.sql`

Focus:
- public platform tables
- tenant provisioning
- admin views
- metrics
- RPC gateway functions
- initial security hardening

### Stage 2 - Payroll stabilization

Main migrations:
- `009_fix_employees_varchar_cast.sql`
- `010_fix_salary_history_varchar_cast.sql`
- `011_companies_add_rif.sql`

Focus:
- payroll/company RPC fixes
- company fiscal data

### Stage 3 - Multi-module billing

Main migrations:
- `012_multi_module_billing.sql`
- `043_inventory_plans.sql`

Focus:
- products catalog
- per-product subscriptions
- inventory plan variants

### Stage 4 - Inventory expansion

Main migrations:
- `013_inventory_tenant_tables.sql`
- `014_inventory_proveedores_compras.sql`
- `015_inventory_departamentos_iva_autoconsumo.sql`
- `016_inventory_numero_control.sql`
- `017_inventory_libro_compras.sql`
- `018_inventory_reporte_islr.sql`
- `019_inventory_ventas_libro_ventas.sql`
- `020_inventory_multitasa_iva.sql`
- `021_inventory_libro_inventarios.sql`
- `022_fix_libro_compras_format_args.sql`
- `023_inventory_multimoneda.sql`
- `024_inventory_reporte_saldo.sql`
- `025_inventory_factura_delete.sql`
- `026_inventory_factura_delete_confirmed.sql`
- `027_inventory_libro_ventas_multitasa.sql`
- `034_drop_existencia_minima.sql`
- `035_productos_get_join_departamento.sql`
- `036_drop_moneda_defecto.sql`
- `037_rename_entradas_salidas.sql`
- `038_fix_movimientos_save_returning.sql`
- `039_movimiento_delete_and_update_meta.sql`
- `040_libro_inventarios_carry_forward.sql`
- `041_reporte_periodo_fix_tipos.sql`
- `042_reporte_periodo_fix_args.sql`

Focus:
- inventory base tables
- vendors and purchase invoices
- department and VAT support
- books and tax reports
- movement naming and reporting fixes
- multi-currency support
- reporting corrections

### Stage 5 - Memberships and documents

Main migrations:
- `029_tenant_memberships.sql`
- `030_documents_tenant_tables.sql`
- `031_documents_storage_rls.sql`
- `032_documents_rpc_functions.sql`
- `033_documents_rpc_company_null_fix.sql`

Focus:
- tenant collaboration
- invitations
- tenant document folders/documents
- storage access
- document RPCs

### Stage 7 - Accounting module

Main migrations:
- `050_accounting_module` (applied as DB migration 050)
- `051_accounting_integration` (applied as DB migration 051)

Focus:
- accounting product in public.products
- accounting subscription plans (4 tiers)
- tenant schema tables: accounting_accounts, accounting_periods, accounting_entries, accounting_entry_lines
- tenant schema tables: accounting_integration_rules, accounting_integration_log
- RPC gateway functions for all accounting CRUD, reporting, and integration
- balance-validation constraint enforced at posting time
- non-blocking integration hooks from payroll and inventory confirm flows

### Stage 6 - Branding and media

Main migrations:
- `044_avatars_bucket.sql`
- `045_companies_add_contact_fields.sql`
- `046_company_show_logo_in_pdf.sql`

Focus:
- avatars bucket
- company contact data
- company logo display rules in PDFs

## How to use this folder

When a new migration is added:

1. decide which area it affects
2. update the relevant schema doc
3. update this overview if it changes the model significantly

## Maintenance rule

Do not document only the migration file.
Also update the "current schema" docs so future readers can understand the current model without replaying the whole migration history mentally.
