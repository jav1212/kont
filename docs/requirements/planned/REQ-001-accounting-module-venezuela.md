# Requirement

## Metadata

- ID: REQ-001
- Name: Accounting Module for Venezuela
- Status: Planned
- Priority: High
- Owner: Product / Engineering

## Objective

Design and implement a new independent Accounting module for Venezuela that becomes the financial core of the platform and connects directly with Payroll and Inventory to automate accounting flows.

## Context

`Kont` already has strong operational modules in:

- Payroll
- Inventory
- Documents

The next strategic step is to add Accounting as a separate commercial product.

This new module must not be treated as an isolated bookkeeping tool.
Its core value is to translate operational events from Payroll and Inventory into accounting records that support Venezuelan accounting and tax workflows.

The module must:

- work as an independent billable module
- have its own plans and pricing
- integrate with existing modules
- support Venezuelan accounting realities
- prepare the platform for deeper financial automation in future phases

## Scope

This requirement includes the design and phased implementation plan for a new Accounting module with:

- independent product/module identity in the platform
- independent billing plans
- chart of accounts management
- support for importing multiple chart-of-accounts templates
- accounting entries
- accounting books and financial summaries
- integration with Payroll
- integration with Inventory
- document support for accounting evidence
- Venezuelan accounting orientation

## Out of scope

The first implementation phases should not include a full all-at-once rollout of:

- advanced bank reconciliation
- complete tax filing automation
- full inflation-adjustment engine
- full external regulatory submission formats
- complete external-auditor reporting pack
- every possible accounting automation from day one

Those can be introduced in later phases.

## Functional impact

The platform will gain a new commercial product:

- `accounting`

This product will allow tenants to:

- subscribe independently to Accounting
- configure accounting structure for one or more companies
- import and manage chart-of-accounts templates
- post manual and automated accounting entries
- generate accounting books and financial summaries
- connect operational module activity to accounting outputs

The intended business model is:

- Accounting is a standalone product
- it has its own plans and pricing
- it can coexist with Payroll, Inventory, and Documents subscriptions
- its highest value comes from automation across modules

## Frontend impact

The frontend will require a new Accounting module area with routes, pages, and reusable UI patterns for:

- accounting dashboard
- chart of accounts
- journal entries
- ledger views
- trial balance
- period closing
- accounting settings
- accounting integration rules
- accounting reports

Expected UI needs:

- import flows for chart of accounts
- account-tree visualization
- journal entry editor
- accounting report filters
- accounting period controls
- integration trace views showing the source module of automated entries

This module should follow the frontend reuse rules already defined for shared UI and module boundaries.

## Backend impact

The backend will require a new Accounting domain/module with clear boundaries for:

- chart-of-accounts management
- journal entry creation and validation
- posting rules
- closing rules
- report generation
- integrations from Payroll
- integrations from Inventory
- future integrations from other modules

The design should support:

- command/query separation
- explicit accounting events or accounting posting actions
- adapter-based integration with Payroll and Inventory
- future event-sourcing readiness

The backend should be designed so operational modules do not directly embed accounting logic everywhere.
Instead, they should emit or trigger explicit accounting application flows.

## Database impact

This requirement will likely need:

- a new billable product entry for Accounting in `public.products`
- Accounting-specific plans in `public.plans`
- tenant subscriptions for the Accounting product in `public.tenant_subscriptions`
- new tenant schema tables or equivalent accounting storage model
- accounting-related RPCs or repository access patterns
- document links or references for accounting support evidence

Likely core accounting data structures:

- chart of accounts
- account categories / hierarchy
- journal entries
- journal entry lines
- accounting periods
- closing records
- report mappings
- integration mappings from Payroll and Inventory

Design note:

The data model must support:

- multiple chart-of-accounts imports/templates
- company-level accounting within the tenant
- traceability from operational source to accounting result

## Security impact

This module affects sensitive financial and regulatory data, so security impact is high.

Main concerns:

- accounting data must remain tenant-isolated
- accounting actions must respect role boundaries
- automated postings must be traceable to their operational source
- close/reopen actions must be controlled and auditable
- accounting reports may include highly sensitive financial information

The module should define clear permissions for:

- owner
- tenant admin
- accountant/bookkeeper role
- platform admin

It should also prepare for:

- immutable audit trails for posted entries
- explicit reversal flows instead of silent destructive edits

## Billing/commercial impact

This requirement has direct commercial impact.

Accounting must be introduced as:

- a new product/module
- with its own plans
- with its own pricing strategy

Commercial assumptions:

- tenants may subscribe to Accounting independently
- some tenants may use Payroll + Accounting
- some may use Inventory + Accounting
- some may use Payroll + Inventory + Accounting

This supports modular product packaging and cross-sell growth.

## Core product vision

The core value of the Accounting module is not only manual bookkeeping.

The core value is:

- connecting Payroll and Inventory to Accounting
- automating accounting flows
- reducing manual accounting work
- making `Kont` the financial operating system of the tenant

This integration-first approach is the heart of the module.

## Recommended functional scope

### Phase-1 functional core

- chart of accounts
- import multiple chart-of-accounts templates
- account hierarchy
- manual journal entries
- posted vs draft entries
- journal book
- general ledger
- trial balance
- accounting period management
- basic financial statements foundation
- document attachment/support references

### Phase-2 integration core

- automatic accounting entries from Payroll
- automatic accounting entries from Inventory
- accounting rule mapping per operation type
- source-to-entry traceability
- accounting integration logs

### Phase-3 Venezuelan compliance depth

- VAT-oriented accounting support
- purchase/sales book alignment where relevant
- withholding-related support
- legal/accounting report alignment
- inflation-adjustment readiness or implementation
- richer financial statements under Venezuelan accounting expectations

## Risks

### 1. Overbuilding too early

Accounting can become too broad if the first version tries to solve every legal and tax scenario at once.

### 2. Weak integration design

If Payroll and Inventory integrate through ad hoc logic instead of explicit accounting boundaries, the module will become hard to maintain.

### 3. Regulatory ambiguity

Venezuelan accounting and tax practice may require detailed validation by domain experts.

### 4. Traceability risk

If automated accounting entries are not traceable back to source operations, trust in the module will be weak.

### 5. Closing and edit risk

Accounting data must support strict period control and safe reversal patterns, not silent mutation after posting.

## Attack plan

### Phase 1 - Product definition and accounting foundation

- objective:
  define Accounting as a first-class commercial product and establish the accounting core domain
- affected areas:
  billing model, module architecture, database design, requirements, security model
- risk level:
  medium
- success criteria:
  Accounting exists as a clearly defined new product with domain boundaries, initial tables/contracts, and a phased functional map

### Phase 2 - Core accounting MVP

- objective:
  implement the minimum accounting feature set needed to operate independently
- affected areas:
  accounting frontend, accounting backend, accounting persistence, accounting reporting basics
- risk level:
  medium
- success criteria:
  users can manage chart of accounts, create/post journal entries, view journal/ledger/trial balance, and manage accounting periods

### Phase 3 - Payroll integration

- objective:
  automate accounting postings from Payroll operations
- affected areas:
  payroll backend integration boundary, accounting application layer, traceability model
- risk level:
  high
- success criteria:
  payroll events or confirmed payroll processes can generate controlled accounting entries with source traceability

### Phase 4 - Inventory integration

- objective:
  automate accounting postings from Inventory operations
- affected areas:
  inventory backend integration boundary, accounting posting rules, reporting traceability
- risk level:
  high
- success criteria:
  inventory purchases, movements, and operational accounting triggers can generate controlled accounting entries with traceable source mapping

### Phase 5 - Venezuelan accounting and tax depth

- objective:
  add deeper Venezuela-specific accounting and fiscal support
- affected areas:
  reports, compliance logic, fiscal mappings, advanced statements
- risk level:
  high
- success criteria:
  the module covers the prioritized Venezuelan accounting workflows selected for the business roadmap

## Acceptance criteria

- Accounting is defined as a standalone commercial module
- Accounting has its own billing/product identity
- The system supports multiple chart-of-accounts imports
- Manual accounting operation is possible
- Payroll can be integrated into Accounting through controlled automation
- Inventory can be integrated into Accounting through controlled automation
- The module design supports future Venezuelan compliance expansion
- The architecture preserves traceability, tenant isolation, and auditability

## Notes

This requirement should be implemented incrementally.

The first release should focus on:

- accounting domain foundation
- product/billing readiness
- chart of accounts
- journal entries
- books and balances
- integration-ready architecture

The deeper Venezuelan fiscal and regulatory layer should be planned in follow-up requirements if needed.
