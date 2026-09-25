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
- `252_direct_member_auth_provisioning.sql`
- `256_defer_direct_member_provisioning.sql`
- `257_organization_access_management_permission.sql`

Focus:
- tenant collaboration
- invitations
- tenant document folders/documents
- storage access
- document RPCs
- direct creation of confirmed, password-based tenant members

### Direct member provisioning rollout

Apply both `252_direct_member_auth_provisioning.sql` and `256_defer_direct_member_provisioning.sql` before deploying the application code that uses `POST /api/memberships/members`. Migration 256 supersedes the insert-only trigger timing introduced by 252: Supabase Auth inserts a user and then writes trusted app metadata in the same transaction, so the canonical `on_auth_user_created` handler must be a deferred, initially deferred constraint trigger that reads the final user row. It preserves the ordinary signup and invitation branches at commit and retains the existing organization synchronization.

Run [004_deferred_direct_member_checks.sql](../../../supabase/verification/004_deferred_direct_member_checks.sql) after migration 256. Its fixtures roll back and it verifies the Auth insert-then-metadata-update ordering, trusted-metadata validation, legacy and canonical organization linkage for every direct-member role, unchanged signup and invitation behavior, and deferred trigger readiness. Password sign-in remains an Auth-provider integration check. Verification 003 remains historical coverage for the earlier migration but is not sufficient rollout evidence for the current trigger timing.

Before release, confirm `public.membership_direct_provisioning_ready()` is true using a service-role connection, and inspect `pg_trigger` for `on_auth_user_created` with `tgdeferrable` and `tginitdeferred` both true. If readiness fails, do not deploy the direct-member Web change; apply or restore migration 256 and rerun verification 004. Rolling back the Web code does not undo accounts or memberships already provisioned.

### Canonical access-management permission rollout

Apply `257_organization_access_management_permission.sql` after the organization role catalog exists. It records `access.manage` in the access-control catalog and grants it only to active system owner and admin roles, including templates. It does not alter custom role grants or cashier, seller, and accountant defaults. Verify the required grant on active system owner/admin roles before enabling the access-settings Web route; applying the migration alone does not deploy that route.

### Organization system-role permission overrides rollout

Apply `261_organization_system_role_permission_overrides.sql` after migrations
that create the canonical organization role catalog and its versioned role
update RPC. It updates both the legacy permission-replacement RPC and the
versioned role-update RPC so an active organization-local system role can have
its permissions replaced when its code is not `owner`. The role must belong to
an organization; global templates remain immutable.

The migration keeps system-role identity metadata and lifecycle immutable:
only a custom role may change its name or description, and no system role may
be archived through the update RPC. It does not rewrite any current role grants
or template defaults. Organization roles already provisioned keep their grants;
future organizations receive their initial system-role grants from the unchanged
templates. An override is limited to the organization whose local role is
updated and does not re-provision another organization.

Apply migration 261 before deploying or enabling the Web editor for default
role permissions. The editor requires `roles.manage`, requires the caller to own
every permission being granted, and sends `expectedVersion`; a stale version
returns the existing role-version conflict. If the application code is rolled
back, stored local overrides remain in place; do not remove role or permission
rows merely to disable the editor.

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

### POS credit receivables

Main migrations:
- `20260925192503_sales_credit_receivables.sql`
- `20260925192914_sales_receivable_identity_rate_source.sql`
- `20260925193135_credit_requires_identified_customer.sql`
- `20260925193901_receivable_payment_idempotency_race.sql`

Focus:
- immutable sale and payment exchange-rate snapshots for credit sales in any currency available from the rate catalog
- one tenant-scoped receivable per confirmed credit invoice, with an identified customer and due date
- partial payments with an idempotency key, transactionally calculated debt application and overpayment rejection

Apply all four migrations before deploying the POS credit flow or the accounts-receivable route. They are additive and do not retroactively create receivables for historical invoices. The payment RPC is exclusive to `service_role`; validate `sales.create` in the server route that invokes it. See [ADR 0042](../../adr/0042-pos-credit-receivables.md) for the contract and rollout constraints.

The local timestamped prefixes match the migration entries applied through
Supabase MCP, avoiding a collision or future reapplication with concurrent
sales migrations.

## How to use this folder

When a new migration is added:

1. decide which area it affects
2. update the relevant schema doc
3. update this overview if it changes the model significantly

## Maintenance rule

Do not document only the migration file.
Also update the "current schema" docs so future readers can understand the current model without replaying the whole migration history mentally.
