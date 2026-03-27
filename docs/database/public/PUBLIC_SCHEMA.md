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

### `public.products`

Purpose:
- catalog of billable modules

Current examples:
- `payroll`
- `inventory`

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
- `contable`

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

## Current design observations

- `public` is both a platform schema and an RPC gateway into tenant schemas
- many business operations are exposed as `public.tenant_*` functions
- this is powerful, but it means RPC documentation must stay in sync with schema docs
