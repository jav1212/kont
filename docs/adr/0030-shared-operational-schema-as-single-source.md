# ADR 0030: Shared operational schema as the single source of truth

## Status

Accepted.

## Decision

Web, Desktop and Mobile use the same operational records in the `public.shared_*` tables. New client architecture must not create parallel company, employee, payroll, inventory, sales, purchasing, accounting or document tables merely to obtain cleaner names or identifiers.

Global cross-client concepts remain in their owning public tables: `organizations`, `organization_*`, `profiles`, `user_preferences`, authentication, billing and platform status. These are shared global capabilities, not tenant-specific operational copies.

Packages may expose modern domain models and translate legacy column names inside persistence adapters. Schema cleanup and column renaming require an explicit cutover migration; they do not justify dual writes or a second source of truth.

Every query for company-owned data must scope composite shared identifiers by organization or tenant. Authorization of the request does not make a repository query scoped only by `company_id` safe.

## Consequences

- `@kontave/companies-supabase` reads and writes `shared_companies`.
- `@kontave/employees-supabase` reads and writes `shared_employees` and `shared_employee_salary_history`.
- Company module activation is stored in `shared_company_module_activations`.
- Native routes may keep compatibility aliases, but aliases resolve the same shared records.
- Parallel operational models are not extended. Existing compatibility tables are removed only through a separately verified data-safe migration.

This decision supersedes the dual-model migration strategy described in ADR 0010 and the operational-data portions of ADR 0008.
