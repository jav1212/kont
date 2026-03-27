# Requirement

## Metadata

- ID: REQ-004
- Name: Module Dashboards for Web and PWA
- Status: Planned
- Priority: High
- Owner: Product / Engineering

## Objective

Introduce dedicated dashboards for the main modules of the platform so users can see relevant indicators, charts, alerts, and quick actions in both web and PWA contexts.

The dashboard must become the mobile representation of the module whenever the full module experience is not practical or not available in the PWA.

## Context

The platform currently has strong module functionality, but mobile usage needs a more focused experience.

In many cases, especially in PWA/mobile usage:

- the full module is too dense
- some module screens are not ideal for mobile interaction
- users still need quick operational visibility
- users still need fast access to the most important tasks

The dashboard solves this by acting as:

- a control panel
- an information summary
- an alert center
- an entry point into the most important module actions

## Scope

This requirement includes the design and phased implementation plan for:

- module dashboards in web
- module dashboards in PWA
- reusable dashboard UI patterns
- summary indicators
- trend charts
- alerts
- recent activity
- quick actions

Initial target modules:

- Payroll
- Inventory
- Documents

## Out of scope

This requirement should not become a full BI platform.

The first implementation should not include:

- advanced custom report builders
- user-defined chart builders
- heavy analytics warehouse features
- cross-module executive reporting in the first phase
- full offline analytics

The first goal is operational dashboards, not enterprise BI.

## Functional impact

Each target module will gain a dashboard/tablero that presents:

- key KPIs
- trends
- alerts
- recent activity
- quick actions

The dashboard must exist in:

- web
- PWA/mobile

Core rule:

- if the full module is not practical or available in the PWA, the dashboard must represent the module in the PWA

This makes the dashboard a first-class product surface, not a decorative page.

## Frontend impact

This requirement has major frontend impact.

It will require:

- reusable dashboard layout patterns
- KPI cards
- chart containers
- alert panels
- recent activity panels
- quick action panels
- responsive behavior between web and mobile

Recommended shared UI pieces:

- dashboard shell
- KPI card
- chart card
- alerts panel
- recent activity feed
- quick actions panel
- empty/loading/error dashboard states

Module-specific dashboard pages should compose shared dashboard primitives instead of creating one-off implementations.

## Backend impact

Each module will need dashboard-oriented data endpoints or use cases.

Recommended dashboard data groups:

- summary
- trends
- alerts
- recent activity
- quick actions metadata if needed

Each module should expose dashboard data in a structured and reusable way instead of embedding ad hoc aggregation logic directly in the page.

## Database impact

This requirement may not require major schema changes at first if the current module data is enough to compute indicators.

However, it may later benefit from:

- aggregated views
- dashboard-oriented RPCs
- lightweight summary tables
- cached metrics

The first phase should prefer reading from existing module data where feasible.

## Security impact

Dashboard data must respect the same tenant and role boundaries as the module itself.

This means:

- no cross-tenant leakage
- no exposure of unauthorized business metrics
- dashboards must obey active tenant and company context
- module alerts and activities must remain tenant-scoped

If dashboards later include cached or aggregated views, access control must remain equivalent to current module access rules.

## Billing/commercial impact

Dashboards increase the value and usability of existing commercial modules.

This is especially important for:

- Payroll
- Inventory
- Documents

The dashboard experience can improve:

- retention
- mobile usability
- perceived product maturity
- module adoption

This requirement does not create a new commercial module by itself, but it strengthens the experience of existing ones.

## Target module dashboard definitions

### Payroll dashboard

Recommended KPI areas:

- active employees
- payroll cost for current period
- change versus previous period
- generated receipts
- pending or confirmed payroll runs
- upcoming obligations or deadlines

Recommended trend areas:

- payroll cost by month
- payroll cost by company
- employee distribution by status
- benefit/liability evolution where applicable

Recommended alerts:

- incomplete employee data
- pending payroll confirmation
- missing closures
- unusual salary changes

Recommended quick actions:

- new payroll run
- employees
- payroll history
- receipts

### Inventory dashboard

Recommended KPI areas:

- active products
- inventory value
- entries in current period
- exits in current period
- stock-critical products
- purchase volume

Recommended trend areas:

- entries vs exits
- stock value evolution
- movement by department
- top-moving products
- supplier activity

Recommended alerts:

- low stock
- invoices pending confirmation
- recent adjustments
- stale products
- pending closures

Recommended quick actions:

- new entry
- new exit
- products
- suppliers
- purchase invoices
- stock critical view

### Documents dashboard

Recommended KPI areas:

- total documents
- documents uploaded in current period
- active folders
- documents by company
- pending classification count

Recommended trend areas:

- uploads by month
- documents by company
- storage growth
- upload activity

Recommended alerts:

- unclassified documents
- upload failures
- missing folder structure
- recent important uploads

Recommended quick actions:

- upload document
- take photo
- create folder
- view recent files

## PWA-specific rule

The PWA dashboard is not just a smaller copy of the web dashboard.

It should be:

- more compact
- more action-oriented
- more alert-focused
- more suitable for quick operational checks

Priority order in PWA:

1. alerts
2. KPIs
3. recent activity
4. quick actions
5. small trend charts

## Recommended dashboard architecture

### Shared dashboard contract

Each module should converge toward a dashboard data contract with sections like:

- `summary`
- `trends`
- `alerts`
- `recentActivity`
- `quickActions`

### Shared dashboard UI

The UI should be built from shared abstractions, not module-specific duplicates.

### Module-specific aggregation

Each module is responsible for producing its own dashboard data, but in a consistent structure.

## Risks

### 1. Dashboard bloat

If too many charts and panels are added, the dashboard becomes noise.

### 2. Mobile overload

If the PWA dashboard tries to replicate the entire desktop experience, usability will drop.

### 3. Inconsistent implementation

If each module builds dashboards in a completely different way, reuse and maintainability will suffer.

### 4. Weak actionability

A dashboard that only shows metrics but does not guide next actions loses value quickly.

## Attack plan

### Phase 1 - Dashboard system definition

- objective:
  define a reusable dashboard contract and shared UI system
- affected areas:
  frontend architecture, module contracts, responsive design
- risk level:
  low to medium
- success criteria:
  the team agrees on a common dashboard structure for modules

### Phase 2 - Web dashboards

- objective:
  implement web dashboards for Payroll, Inventory, and Documents
- affected areas:
  module pages, dashboard components, data aggregation logic
- risk level:
  medium
- success criteria:
  each target module has a useful operational dashboard in web

### Phase 3 - PWA dashboards

- objective:
  adapt module dashboards for mobile/PWA usage
- affected areas:
  responsive frontend, mobile UX, quick actions, compact indicators
- risk level:
  medium
- success criteria:
  PWA users can rely on dashboards even when the full module is not practical in mobile

### Phase 4 - Hardening and optimization

- objective:
  improve clarity, performance, and actionability
- affected areas:
  metrics generation, loading states, chart density, cached summaries
- risk level:
  low to medium
- success criteria:
  dashboards are fast, clear, and operationally useful

## Acceptance criteria

- Payroll has a dashboard in web and PWA
- Inventory has a dashboard in web and PWA
- Documents has a dashboard in web and PWA
- dashboards show relevant KPIs, alerts, and quick actions
- PWA dashboards can represent the module when the full module is not suitable for mobile
- dashboard UI follows shared reusable patterns
- dashboard data respects tenant and module access rules

## Notes

This requirement should be treated as a product-surface improvement with architectural value.

If done correctly, it will:

- improve mobile usability
- improve module discoverability
- reduce friction for daily operations
- create a reusable dashboard pattern for future modules
