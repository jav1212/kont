# Public Schema

This document summarizes the shared `public` schema used by the SaaS platform.

## Purpose

The `public` schema stores cross-tenant platform data:

- plans
- tenants
- billing products
- subscriptions
- payment requests
- admin users
- tenant memberships and invitations
- shared RPC functions

## Core tables

### `public.plans`

Purpose:
- subscription plans
- commercial limits and pricing

Key concepts:
- `name`
- `max_companies`
- `max_employees_per_company`
- `price_monthly_usd`
- `price_quarterly_usd`
- `price_annual_usd`
- `is_active`
- `product_id` after multi-module billing

Notes:
- Originally global plans
- Later linked to `public.products`
- Backward compatibility with older tenant fields still exists

### `public.tenants`

Purpose:
- one SaaS tenant per registered owner

Key concepts:
- `id` references `auth.users`
- `plan_id` legacy billing reference
- `status`
- `schema_name`
- `billing_cycle`
- period dates and payment timestamps

Notes:
- `plan_id` remains for backward compatibility
- multi-module subscriptions now also exist in `public.tenant_subscriptions`

### `public.payment_requests`

Purpose:
- manual billing review flow

Key concepts:
- `tenant_id`
- `plan_id`
- `billing_cycle`
- `amount_usd`
- `payment_method`
- `receipt_url`
- `status`
- `reviewed_by`

### `public.admin_users`

Purpose:
- platform administrators

Key concepts:
- `id` references `auth.users`
- `email`

### `public.system_error_logs`

Purpose:
- centralized, support-oriented application incident records

Key concepts:
- `error_code` is the unique support reference shown to a user
- `user_id` identifies the authenticated reporting user when available
- technical diagnostics (`technical_message`, `stack_trace`, `metadata`) are administrator-only data
- `resolution_status` is `pending` or `resolved`; existing records default to `pending`
- `resolved_at` and `resolved_by` describe the current resolution only; reopening clears both values

Notes:
- reporter and resolver display data is obtained from `profiles` when present; the log remains valid if a profile is unavailable
- only the service role can update the resolution columns, after server-side administrator authorization; authenticated users have no direct mutation privilege

### `public.shared_document_folders` and `public.shared_documents`

Purpose:
- shared metadata for document folders and files, owned by both tenant and organization

Key concepts:
- [224_portable_documents_native.sql](../../../supabase/migrations/224_portable_documents_native.sql) makes `organization_id` required on both tables while retaining `tenant_id` for legacy ownership and compatibility.
- [251_document_organization_compatibility.sql](../../../supabase/migrations/251_document_organization_compatibility.sql) supplies a missing `organization_id` from `public.organizations.legacy_tenant_id` for existing Web write payloads. Native document RPCs keep their explicit organization value when it matches that tenant.
- A missing tenant-to-organization mapping or an explicit organization that belongs to a different tenant rejects the write.

Notes:
- The compatibility trigger runs only before inserts and updates to `tenant_id` or `organization_id`; it does not alter unrelated updates.
- Its `SECURITY DEFINER` lookup is read-only, uses a fixed catalog search path, and does not bypass table RLS for the write itself.
- [document-organization-compatibility.sql](../../../test/document-organization-compatibility.sql) covers legacy and native metadata writes, invalid mappings, and RLS denial in a rolled-back transaction; it does not access object storage.

### `public.shared_sales_receivables` and `public.shared_sales_receivable_payments`

Purpose:
- commercial accounts receivable created when a shared sales invoice confirms on credit
- immutable partial-payment history in the debt or another accepted currency

Key concepts:
- a receivable is unique for `(tenant_id, sales_invoice_id)` and retains the identified customer, due date, original debt amount, debt currency and the sale-time exchange-rate snapshot
- each payment retains received amount and currency, the payment-time rate snapshot, the amount applied to the debt, a tenant-scoped idempotency key, optional payment method and reference
- the database derives the applied amount from both rate snapshots, rejects overpayments, serializes concurrent payments with a row lock, and marks the account `settled` only when its original principal is fully covered
- source `identity` represents a VES-to-VES rate; `bcv`, `manual` and `legacy` preserve the origin of non-identity snapshots

Notes:
- The local files [20260925192503_sales_credit_receivables.sql](../../../supabase/migrations/20260925192503_sales_credit_receivables.sql), [20260925192914_sales_receivable_identity_rate_source.sql](../../../supabase/migrations/20260925192914_sales_receivable_identity_rate_source.sql), [20260925193135_credit_requires_identified_customer.sql](../../../supabase/migrations/20260925193135_credit_requires_identified_customer.sql) and [20260925193901_receivable_payment_idempotency_race.sql](../../../supabase/migrations/20260925193901_receivable_payment_idempotency_race.sql) form one deployment unit before clients use POS credit or receivable payments. Their timestamped prefixes match the migration entries applied through Supabase MCP.
- confirmation creates the receivable only for a credit invoice with a due date, complete sale-rate snapshot and an identified customer. It does not backfill historical invoices.
- authenticated users can read rows permitted by their active tenant membership. Only `service_role` can execute `shared_sales_receivable_apply_payment`; the Web API supplies the application permission check.

### `public.products`

Purpose:
- catalog of billable modules

Current examples:
- `payroll`
- `inventory`
- `accounting`

### `public.tenant_subscriptions`

Purpose:
- per-tenant subscription per product

Key concepts:
- `tenant_id`
- `product_id`
- `plan_id`
- `status`
- `billing_cycle`
- current billing period

Notes:
- Enables multi-module billing
- Replaces the older single-plan mental model

### `public.tenant_memberships`

Purpose:
- multi-user access to a tenant

Key concepts:
- `tenant_id`
- `member_id`
- `role`
- `invited_by`
- `accepted_at`
- `revoked_at`

Current roles:
- `owner`
- `admin`
- `contador`
- `contable`
- `vendedor`
- `cajero`

Direct member provisioning:
- [252_direct_member_auth_provisioning.sql](../../../supabase/migrations/252_direct_member_auth_provisioning.sql) adds a password-based provisioning path for a new member of an existing tenant.
- [256_defer_direct_member_provisioning.sql](../../../supabase/migrations/256_defer_direct_member_provisioning.sql) is required by the current path. It makes the Auth provisioning trigger a deferred constraint trigger, so it reads the final trusted metadata row at transaction commit rather than the initial Auth insert.
- A trusted Auth-admin payload in `raw_app_meta_data.provisioned_membership` contains exactly `tenant_id`, `role`, and `invited_by`. Client-controlled user metadata cannot enable this path.
- Supabase Auth creates the row and then updates trusted application metadata in its transaction. The deferred `auth.users` trigger `on_auth_user_created` calls `public.handle_new_user()` after that update, creating the profile, one accepted active legacy membership, and its canonical active organization membership in the same transaction. A failed linkage rolls back the Auth user and profile.
- The provisioned role is `admin`, `contador`, `vendedor`, or `cajero`; the inviter must be an accepted, active `owner` or `admin`, and an `admin` cannot provision another `admin`.
- A directly provisioned user does not receive a tenant of their own and does not accept any pending invitation. Public registration and the normal invitation path retain their existing behavior.

### `public.tenant_invitations`

Purpose:
- invitation flow for tenant collaborators

Key concepts:
- `tenant_id`
- `email`
- `role`
- `token`
- `expires_at`
- `accepted_at`

### Canonical organization authorization

`public.organizations`, `public.organization_memberships`,
`public.organization_roles` and `public.organization_role_permissions` are the
canonical authorization source for an operational workspace. A legacy tenant
role is compatibility data; it does not independently grant a Web capability.
The active organization membership, its active scoped role, and its assigned
permission grants must agree before server authorization succeeds.

[257_organization_access_management_permission.sql](../../../supabase/migrations/257_organization_access_management_permission.sql)
adds `access.manage` for terminal and badge administration. It grants that
permission only to active system `owner` and `admin` roles, including role
templates used for future organizations. It intentionally leaves custom and
cashier, seller, and accountant default roles unchanged.

### `public.barcode_access_*`

Purpose:
- server-owned authorization state for Web barcode access

Tables:
- `barcode_access_terminals`: an enrolled browser terminal, its secret hash and revocation state
- `barcode_access_badges`: a tenant member's printable credential hash and lifecycle
- `barcode_access_sessions`: a Supabase session binding to terminal, badge and tenant; it intentionally retains revocation tombstones
- `barcode_access_audit`: sanitized access lifecycle events

Notes:
- [254_barcode_access_foundation.sql](../../../supabase/migrations/254_barcode_access_foundation.sql) grants these tables only to `service_role`; browser roles have no direct access.
- [255_barcode_access_direct_data_guard.sql](../../../supabase/migrations/255_barcode_access_direct_data_guard.sql) blocks direct PostgREST/RPC, Storage and Realtime use by a registered barcode-session JWT. It also supplies the service-only readiness check `public.barcode_access_protection_ready()`.
- The feature and its rollout constraints are documented in [web-barcode-access.md](../../security/web-barcode-access.md).

## Security model

The public schema uses RLS for shared platform tables.

Main patterns:

- users can read their own tenant rows
- users can read or create their own payment requests
- admins can access protected platform tables
- products and plans have public read policies for authenticated app usage

## Important functions in `public`

The exact list is large, but the schema includes important RPC helpers for:

- tenant schema resolution
- tenant provisioning
- company CRUD
- payroll CRUD and reporting
- inventory CRUD and reporting
- document access and folder replication
- admin summaries
- billing and plan enforcement

### Direct-member provisioning readiness

`public.membership_direct_provisioning_ready()` is a service-role-only readiness check used before creating a direct member. It verifies that exactly one enabled deferred, initially deferred constraint trigger on `auth.users` is attached to `public.handle_new_user()`. The API reports the feature as unavailable when this check is false, so apply migration 256 before deploying an application version that calls this endpoint.

After Auth reports a created user, the application independently checks the exact active legacy membership and canonical organization role before returning HTTP 201. If either is absent or mismatched it returns `503` with `provisioning_incomplete`; it does not delete the Auth account automatically. This preserves the record for safe operator review rather than risking an incorrect deletion.

## Current design observations

- `public` is both a platform schema and an RPC gateway into tenant schemas
- many business operations are exposed as `public.tenant_*` functions
- this is powerful, but it means RPC documentation must stay in sync with schema docs
