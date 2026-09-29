# Payment orders

This package records organization-scoped payment-order drafts. It does not execute, schedule, or reconcile bank transfers.

Apply migrations `291_user_security_access.sql`, `292_operational_audit_trail.sql`, and `295_payment_orders_audit.sql` in order. The Supabase adapter calls service-only RPCs; each operation validates `payment_orders.*` authorization, company scope, optimistic version, and writes an immutable operational audit fact.
