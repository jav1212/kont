# Tenant Schema

This document summarizes the per-tenant schema pattern used by `Kont`.

## Purpose

Each tenant gets its own schema:

```text
tenant_<user_uuid_without_dashes>
```

This schema stores tenant-isolated business data.

## Provisioning model

Tenant schemas are created through `public.provision_tenant_schema(...)`.

Over time, migrations expanded this provisioning to include:

- core company data
- payroll data
- inventory data
- document management data
- company contact and branding fields

## Core tenant tables

### `companies`

Purpose:
- business entities managed by the tenant

Current notable fields:
- `id`
- `owner_id`
- `name`
- `rif`
- `phone`
- `address`
- `logo_url`
- `show_logo_in_pdf`
- timestamps

### `employees`

Purpose:
- employees belonging to a company

Current notable fields:
- `company_id`
- `cedula`
- `nombre`
- `cargo`
- `salario_mensual`
- `estado`
- timestamps

### `payroll_runs`

Purpose:
- payroll execution batches

Current notable fields:
- `company_id`
- `period_start`
- `period_end`
- `exchange_rate`
- `status`
- timestamps

### `payroll_receipts`

Purpose:
- payroll result rows generated from a payroll run

Current notable fields:
- `run_id`
- `company_id`
- `employee_id`
- salary totals
- net values
- exchange rate data
- JSON payload columns for calculated rows

## Inventory tables

The tenant schema includes a substantial inventory model.

### `inventario_departamentos`

Purpose:
- product departments/categories by company

### `inventario_productos`

Purpose:
- product master data

Current notable fields:
- `empresa_id`
- `departamento_id`
- `codigo`
- `nombre`
- `unidad_medida`
- `tipo`
- `metodo_valuacion`
- `existencia_actual`
- `costo_promedio`
- `iva_tipo`
- `activo`

### `inventario_transformaciones`

Purpose:
- production or transformation records

### `inventario_transformaciones_insumos`

Purpose:
- input rows consumed by a transformation

### `inventario_movimientos`

Purpose:
- inventory movements ledger

Current notable fields:
- `empresa_id`
- `producto_id`
- `tipo`
- `fecha`
- `periodo`
- `cantidad`
- cost and balance columns
- `moneda`
- `tasa_dolar`
- `factura_compra_id`

### `inventario_cierres`

Purpose:
- closed accounting/inventory periods per company

### `inventario_proveedores`

Purpose:
- vendors by company

### `inventario_facturas_compra`

Purpose:
- purchase invoices

### `inventario_facturas_compra_items`

Purpose:
- purchase invoice line items

## Documents tables

### `document_folders`

Purpose:
- hierarchical folders for tenant documents

Current notable fields:
- `parent_id`
- `company_id`
- `created_by`

### `documents`

Purpose:
- stored document metadata

Current notable fields:
- `folder_id`
- `company_id`
- `name`
- `storage_path`
- `mime_type`
- `size_bytes`
- `uploaded_by`

## Security model

Tenant tables use schema-local RLS.

Main pattern:

- all tenant tables are protected with a `tenant_owner` policy
- the policy is tied to the tenant owner user id
- collaborator access is handled at the application/API layer through membership checks and `actingAs` resolution

## Accounting tables

Added in migration 048. New-English-named tables (unlike the legacy Spanish inventory naming).

### `accounting_accounts`

Purpose:
- chart of accounts per company
- hierarchical via `parent_code`

Current notable fields:
- `company_id`
- `code` (unique per company, e.g. "1-01-001")
- `name`
- `type` — 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
- `parent_code`
- `is_active`

### `accounting_periods`

Purpose:
- fiscal periods for grouping journal entries

Current notable fields:
- `company_id`
- `name`
- `start_date` / `end_date`
- `status` — 'open' | 'closed'
- `closed_at`

### `accounting_entries`

Purpose:
- journal entries (asientos contables)

Current notable fields:
- `company_id`
- `period_id`
- `entry_number` (sequential per company)
- `date`
- `description`
- `status` — 'draft' | 'posted'
- `source` — 'manual' | 'payroll' | 'inventory'
- `source_ref` — FK to originating record (for integrations)
- `posted_at`

### `accounting_entry_lines`

Purpose:
- debit/credit lines within a journal entry

Current notable fields:
- `entry_id`
- `account_id`
- `type` — 'debit' | 'credit'
- `amount`
- `description`

### `accounting_integration_rules`

Purpose:
- maps operational module events (payroll, inventory_purchase, inventory_movement) to accounting account pairs
- one rule per (company, source, amount_field) combination

Current notable fields:
- `company_id`
- `source` — 'payroll' | 'inventory_purchase' | 'inventory_movement'
- `debit_account_id`
- `credit_account_id`
- `amount_field` — which financial field from the source to use (e.g. 'net_pay', 'total')
- `description` — template for entry description (supports `{{period}}` and `{{ref}}`)
- `is_active`

### `accounting_integration_log`

Purpose:
- immutable audit trail of each integration execution (success, error, or skipped)

Current notable fields:
- `company_id`
- `source`
- `source_ref` — FK to source record (payroll run id, invoice id, etc.)
- `entry_id` — accounting entry created (nullable if skipped/error)
- `status` — 'success' | 'error' | 'skipped'
- `error_message`

## Important observations

- data isolation relies on separate schemas plus RLS
- the app frequently reaches tenant data through `public.tenant_*` RPC functions
- this means tenant schema changes often require matching RPC updates
- the tenant schema is currently a blend of payroll, inventory, documents, company management, and accounting

## Current modeling note

Many tenant table and RPC names are still in Spanish.
That reflects the legacy/current production schema and should be treated as a compatibility boundary during refactors.
