# Payment orders

This package records organization-scoped payment-order drafts. It does not execute, schedule, or reconcile bank transfers.

It also exposes a portable ADM-037 boundary that plans one VES draft for each positive
receipt of a confirmed payroll run. The boundary carries tenant, organization, company,
run, receipt, and employee identifiers as immutable traceability and uses a deterministic
per-receipt idempotency key. Its persistence port must atomically authorize, re-check the
confirmed source run, and create or replay the draft with that trace.

ADM-037 persistence is provided by the additive migration
[`337_payroll_payment_order_drafts.sql`](../../../supabase/migrations/337_payroll_payment_order_drafts.sql).
It adds a private RLS link between a confirmed payroll receipt and its payment-order
draft, with one link per receipt, one order per link, immutable payroll-derived business
values, and a deterministic idempotency key. The service-only
`create_payroll_payment_order_draft` RPC rechecks `payroll.read` and
`payment_orders.create`, active company scope, the confirmed run, and the receipt's
employee and VES net pay before atomically creating or replaying the draft. The adapter
uses only that RPC and never writes either table directly.

A generic cancellation preserves the historic source link. Consequently, replaying the
same payroll receipt after its linked order is cancelled conflicts instead of creating a
second order. This package neither settles a payment nor creates an administrative
transfer, and no Web client composes this flow yet.

Apply migrations `291_user_security_access.sql`, `292_operational_audit_trail.sql`,
`295_payment_orders_audit.sql`, and `337_payroll_payment_order_drafts.sql` in order.
The general payment-order adapter calls service-only RPCs; each operation validates
`payment_orders.*` authorization, company scope, optimistic version, and writes an
immutable operational audit fact.
