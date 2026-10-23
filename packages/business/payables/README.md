# @kontave/payables

Portable Accounts Payable bounded context (ADR 0046). It owns supplier debt and
credit documents, due-date changes, credit applications and their compensating
reversals, installments (giros), payment batches, supplier payments linked to
Treasury, payment-time VAT/ISLR withholdings, void/reverse, and the reports used
by Web, Desktop and Mobile.

- `domain`: document kinds and sides, balance and settlement rules
  (`settlePayableCurrency`, exact installment split), typed `PayablesFailure`.
- `application`: serializable commands and reports, `createExecutePayablesCommand`,
  and the ports the server must provide: `PayablesValuationPort` (BCV and company
  monetary policy) and `PayablesIslrCalculatorPort` (Decreto 1.808 catalog).
- `supabase`: adapter over the `shared_payables_*` RPCs. Each command family has
  its own RPC (documents, batches, payments, accounting); writes are idempotent and
  authorized in SQL.

All amounts are exact decimal strings. Clients never provide authoritative rates
or tariffs: the use case replaces them with server-resolved values before
persistence.

```sh
corepack pnpm --filter @kontave/payables check
corepack pnpm --filter @kontave/payables test
node supabase/checks/payables-pglite.mjs
PAYABLES_POSTGRES_MODULES=<dir>/node_modules node scripts/test-payables-postgres.mjs
```

The PostgreSQL script needs `@embedded-postgres/windows-x64` and `pg` installed
outside the repository and referenced by `PAYABLES_POSTGRES_MODULES`.
