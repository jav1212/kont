# Requirement

## Metadata

- ID: REQ-002
- Name: Accounting Integration Architecture for Payroll and Inventory
- Status: Planned
- Priority: High
- Owner: Product / Engineering

## Objective

Design the integration architecture that connects Payroll and Inventory with the new Accounting module so accounting records can be generated automatically, safely, and with full traceability.

## Context

The new Accounting module is intended to become the financial core of the platform.

That means its value depends heavily on its ability to consume operational outcomes from:

- Payroll
- Inventory

This integration must not be implemented as scattered ad hoc logic.

It must define a stable architecture for:

- accounting rule mapping
- source event interpretation
- posting workflows
- traceability
- reversals
- period control
- future extensibility to more modules

This is one of the highest-leverage architectural requirements in the system.

## Scope

This requirement includes the design and phased implementation plan for:

- the integration boundary between operational modules and Accounting
- posting rules and mapping architecture
- accounting source traceability
- automated entry generation workflow
- reversal and correction strategy
- future support for more commercial modules

## Out of scope

This requirement does not require implementing all accounting features or all module automations immediately.

It should not include:

- complete accounting module delivery
- every possible Payroll accounting rule
- every possible Inventory accounting rule
- full tax automation
- full event sourcing implementation

The goal is the architecture and first usable integration slices.

## Functional impact

Once implemented, the platform should support this model:

- operational activity happens in Payroll or Inventory
- Accounting receives a controlled business-level accounting trigger
- the system resolves the correct accounting mapping
- one or more accounting entries are generated
- the result remains traceable back to the originating operational action

Examples of target outcomes:

- a confirmed payroll run can generate accounting entries
- a purchase invoice confirmation in Inventory can generate accounting entries
- a stock-related accounting movement can be represented with traceable journal impact

## Frontend impact

The frontend will likely need new Accounting integration views such as:

- accounting mapping configuration
- posting rule configuration
- source-to-entry trace views
- accounting integration logs
- failed posting review screens
- source transaction accounting status

Possible placement:

- inside the Accounting module
- optionally with source module indicators inside Payroll and Inventory

Expected UX goals:

- users must understand what was posted automatically
- users must see what source record generated each entry
- users must be able to identify failures or missing mappings

## Backend impact

This requirement is primarily backend architecture.

It will require:

- explicit integration contracts between Payroll/Inventory and Accounting
- an application service or handler boundary for accounting postings
- deterministic posting logic
- reversal-aware workflows
- source reference metadata
- posting status tracking

Recommended architecture direction:

- operational modules do not write accounting tables directly
- operational modules trigger accounting application flows
- Accounting owns accounting entry creation
- mapping resolution happens inside Accounting or in a dedicated integration layer

Recommended concepts:

- accounting source reference
- posting request
- posting result
- posting rule
- posting batch
- reversal action

## Database impact

This requirement will likely need structures such as:

- accounting integration mappings
- posting status records
- source reference columns in accounting entries
- source module/source entity/source entity id tracking
- reversal references
- posting logs or audit trail tables

Potential conceptual entities:

- `accounting_rule`
- `accounting_posting_batch`
- `accounting_posting_entry`
- `accounting_source_reference`
- `accounting_reversal_reference`

The exact names should be defined in the accounting architecture phase, but the data model must preserve:

- source traceability
- idempotency
- posting status
- auditability

## Security impact

Security impact is high.

The integration architecture must ensure:

- tenant isolation is preserved end to end
- automated postings cannot cross tenants
- only authorized roles can configure mappings
- posting and reversal actions are auditable
- period-locked data cannot be silently altered

Special care is needed for:

- automatic posting after sensitive operational workflows
- privileged correction/reversal actions
- accounting access for collaborator roles

## Billing/commercial impact

This requirement reinforces the value of Accounting as a paid module.

Commercially, the automation layer is a product differentiator because it turns:

- Payroll + Accounting
- Inventory + Accounting
- Payroll + Inventory + Accounting

into integrated workflows instead of isolated products.

This supports:

- higher-value bundles
- stronger retention
- clearer up-sell paths

## Core design principles

The integration architecture should follow these principles:

- Accounting owns accounting data
- source modules own source business operations
- integrations must be explicit, not hidden
- posting must be deterministic
- reversals must be explicit
- traceability is mandatory
- future modules must plug into the same pattern

## Recommended integration model

### Model overview

Use a controlled posting-request model:

1. source module completes a business action
2. source module emits or triggers an accounting posting request
3. Accounting validates posting conditions
4. Accounting resolves the correct mapping
5. Accounting creates journal entries
6. Accounting stores source references and status

### Why this model

It avoids:

- direct coupling from Payroll/Inventory to accounting tables
- duplicated posting logic across modules
- weak audit trails

It supports:

- later CQRS alignment
- event-sourcing readiness
- future module expansion

## Recommended integration targets

### Payroll integration targets

High-priority candidate automations:

- confirmed payroll run
- payroll provisions
- vacation/liquidation flows
- employee benefit-related liabilities

Minimum first slice recommendation:

- confirmed payroll run -> accounting posting batch

### Inventory integration targets

High-priority candidate automations:

- purchase invoice confirmation
- inventory movement with accounting impact
- self-consumption
- adjustments
- production/transformations where relevant

Minimum first slice recommendation:

- confirmed purchase invoice -> accounting posting batch

## Risks

### 1. Tight coupling

If Payroll and Inventory directly create accounting rows, the system will become brittle.

### 2. Weak idempotency

If the same source action can generate duplicate postings, trust in the accounting module will drop quickly.

### 3. Missing traceability

If users cannot see where an accounting entry came from, debugging and audit quality will suffer.

### 4. Reversal chaos

If corrections are handled as silent overwrites instead of explicit reversals, accounting integrity will be weak.

### 5. Premature complexity

Trying to implement a full enterprise integration engine from day one may delay delivery unnecessarily.

## Attack plan

### Phase 1 - Integration architecture definition

- objective:
  define the integration boundary, core concepts, and data model
- affected areas:
  accounting architecture, backend contracts, database design, security model
- risk level:
  medium
- success criteria:
  there is a documented and approved model for posting requests, mappings, source references, and reversals

### Phase 2 - Minimal posting engine

- objective:
  implement the smallest reusable accounting posting workflow
- affected areas:
  accounting backend, persistence, traceability model
- risk level:
  medium
- success criteria:
  the platform can receive a posting request and generate a traceable accounting result

### Phase 3 - Payroll first integration slice

- objective:
  connect one confirmed Payroll workflow to Accounting
- affected areas:
  payroll backend, accounting application layer, integration status tracking
- risk level:
  high
- success criteria:
  a selected payroll operation can create a deterministic and traceable accounting posting

### Phase 4 - Inventory first integration slice

- objective:
  connect one confirmed Inventory workflow to Accounting
- affected areas:
  inventory backend, accounting mapping logic, accounting posting engine
- risk level:
  high
- success criteria:
  a selected inventory operation can create a deterministic and traceable accounting posting

### Phase 5 - Expansion and hardening

- objective:
  generalize the integration model for more posting rules and future modules
- affected areas:
  accounting rules, admin/configuration UX, monitoring, auditing
- risk level:
  medium to high
- success criteria:
  the architecture supports adding new module integrations without redesigning the core

## Acceptance criteria

- Payroll and Inventory do not write accounting data directly
- Accounting owns the posting workflow
- automated entries are traceable to source operations
- duplicate posting risk is controlled
- reversals follow an explicit strategy
- the integration architecture is reusable for future modules
- the design preserves tenant isolation and auditability

## Notes

This requirement should be treated as the core technical backbone of the future Accounting product.

If this architecture is designed well, future commercial modules can integrate into Accounting without creating a second or third integration style.
