# ADR 0041: Portable sales performance reporting and attribution

- Status: Accepted
- Date: 2026-09-25

## Context

The sales dashboard reports company totals and daily trends, but it cannot
explain which user, role, or sales register produced those totals. Current
shared invoices do not retain historical attribution. Membership roles can
change, so deriving a past role at read time would rewrite history.

## Decision

- Keep performance reporting in the existing `@kontave/sales` bounded context.
- Group confirmed sales invoices by user, role, or registered device through a
  typed application query and a tenant-scoped Supabase read adapter.
- Capture the confirming user's identity and role snapshot once, at invoice
  confirmation. Preserve register identity as optional operational metadata.
- Leave records without verifiable attribution grouped under an explicit
  unattributed row. Do not backfill a guessed actor or role.
- Return monetary totals as exact decimal strings in VES. Add other currencies
  only when the persisted historical conversion basis is available to the read
  model.
- Protect the report with the separate `sales.read.reporting` permission.

## Consequences

Historical invoices remain visible, but appear as unattributed. Attribution is
captured only when the confirmation request has a valid authenticated user and
active organization role. A verified carnet terminal is captured as the sales
register; clients without a registered terminal contribute to the unattributed
device row. Other device enrollment flows can add a stable register identity
later. The production Web presentation remains outside this change.
