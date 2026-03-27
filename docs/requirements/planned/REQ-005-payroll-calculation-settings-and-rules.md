# Requirement

## Metadata

- ID: REQ-005
- Name: Payroll Calculation Settings per Company and Rule Enhancements
- Status: Planned
- Priority: High
- Owner: Product / Engineering

## Objective

Refine the Payroll calculation use case so calculation settings become company-specific and persistent, extend the calculation model with missing rule controls, and allow per-segment PDF visibility decisions from the calculation configuration panel.

## Context

The current Payroll calculator in `app/(app)/payroll/page.tsx` already provides a rich calculation panel with:

- period selection
- BCV rate
- salary reference
- alicuotas
- earnings
- deductions
- bonuses
- night-shift bonus
- second-half meal-ticket flow

However, the current implementation shows structural limitations:

- settings are stored only in local page state
- settings are not persisted per company
- calculation configuration is not modeled as a first-class company configuration
- FAOV is currently defined as a generic deduction row without a formal quincena rule
- overtime support exists partially in employee overrides, but not as a coherent company-level calculation rule set
- PDF visibility is not configurable per calculation segment

This requirement unifies those needs into a single Payroll calculation adjustment.

## Current module analysis summary

Based on the current Payroll module:

- the main calculator is centered in `app/(app)/payroll/page.tsx`
- the page stores calculation settings in React state
- employee-level calculation happens in `src/modules/payroll/frontend/components/payroll-employee-table.tsx`
- receipt generation happens in `src/modules/payroll/frontend/utils/payroll-pdf.ts`
- receipt confirmation stores some calculation metadata in `calculationData`
- company data already stores other company-level settings such as fiscal config and PDF logo behavior

Important current observations:

### 1. Settings are not persistent per company

The following values are currently local state in the Payroll page:

- earning rows
- deduction rows
- bonus rows
- `diasUtilidades`
- `diasBonoVacacional`
- `salaryMode`
- `cestaTicketUSD`
- `bonoNocturnoEnabled`
- `diasNocturnosInput`
- `salarioMinimoInput`

These values should be company-scoped configuration instead of ephemeral page state.

### 2. FAOV is not modeled as a formal period rule

`F.A.O.V` exists today as a default deduction row, but the requested rule is:

- first half of the month: no FAOV
- second half of the month: FAOV applies

That means FAOV should become a calculation rule tied to period type instead of only a generic deduction row.

### 3. Overtime support already exists partially

The current codebase already includes:

- `HorasExtrasRow`
- overtime multipliers
- employee override UI for overtime rows

But the requirement now asks for explicit support for:

- day overtime
- night overtime

This must be integrated more coherently into the calculator configuration and PDF/result flow.

### 4. PDF output is not segment-configurable

The current payroll PDF consumes computed earning, bonus, and deduction lines, but there is no explicit company-driven setting that decides whether a segment should appear in the PDF.

The requirement introduces presentation control from the calculation configuration.

## Scope

This requirement includes:

- company-specific persistence of Payroll calculation settings
- automatic load of settings per selected company
- update/save flow for company-specific Payroll settings
- support for explicit day overtime and night overtime configuration
- PDF visibility flags per calculation segment
- formal FAOV rule by quincena
- alignment of calculation engine and PDF generation with the saved company settings

## Out of scope

This requirement should not include:

- a complete Payroll module rewrite
- a full accounting integration
- redesign of every payroll-related page
- replacement of employee-level override behavior unless required for compatibility
- complete legal expansion of all payroll edge cases

This is an adjustment of the Payroll calculation use case, not a full Payroll platform redesign.

## Functional impact

The Payroll calculator must evolve from a transient page-level calculator into a reusable company-level calculation configuration workflow.

Expected behavior:

- each company has its own Payroll calculation settings
- when the active company changes, the calculator loads that company’s settings
- the calculator uses those settings by default
- the generated PDF respects segment visibility settings
- FAOV behaves according to the selected quincena rule
- overtime rules are modeled explicitly and consistently

## Frontend impact

The main impact is in the Payroll calculator UI.

Changes needed:

- load settings from the active company context
- persist changes for the active company
- expose overtime configuration clearly
- expose PDF visibility controls per segment
- ensure the calculator and results stay aligned with the saved company configuration

Recommended visible configuration groups:

- period-sensitive rules
- salary/integral settings
- earnings configuration
- deductions configuration
- bonuses/extras configuration
- PDF visibility configuration

Recommended PDF visibility controls:

- show earnings in PDF
- show deductions in PDF
- show bonuses in PDF
- show overtime in PDF
- show night-shift bonus in PDF
- show alicuota/integral breakdown in PDF

These can be modeled either as segment-level flags or grouped presentation settings.

## Backend impact

This requirement introduces a new need for Payroll calculation settings persistence.

The backend will need:

- a way to store Payroll settings per company
- a way to fetch Payroll settings by company
- a way to update Payroll settings safely

The preferred implementation should treat this as company-scoped Payroll configuration rather than ad hoc page storage.

The backend should also support:

- a stable shape for Payroll calculation settings
- future expansion of Payroll rule configuration
- compatibility with current payroll run confirmation flow

## Database impact

This requirement will likely need one of these approaches:

- extend company configuration with a dedicated Payroll settings structure
- add a dedicated Payroll settings field/table keyed by company

The model should support at least:

- default earning rows
- default deduction rows
- default bonus rows
- alicuota settings
- salary display mode
- meal-ticket settings
- night-shift settings
- overtime-related configuration
- PDF visibility flags
- period-specific rules such as FAOV behavior

Important requirement:

- configuration must be stored per company, not globally

## Security impact

Security impact is moderate.

The main concerns are:

- settings must remain tenant-scoped
- settings must remain company-scoped
- users should not be able to change another company’s Payroll settings without permission
- PDF output configuration must not leak hidden data unexpectedly

Because these settings affect payroll calculations, configuration integrity matters.

## Core requirement areas

### 1. Payroll calculation settings per company

The calculator configuration must be saved per company.

Examples of settings that should become company-specific:

- default earnings rows
- default deductions rows
- default bonus rows
- utility days
- vacation bonus days
- salary mode for PDF
- meal-ticket amount
- night-shift default behavior
- salary-minimum reference for capped deductions

### 2. Overtime enhancement

The calculation flow must explicitly support:

- day overtime
- night overtime

Current code already contains partial overtime structures in employee overrides.
This requirement should make overtime part of the supported Payroll calculation model and ensure it behaves consistently in:

- calculation
- results
- PDF representation where enabled

### 3. PDF segment visibility

Each relevant calculation segment should support a setting that decides whether it appears in the generated Payroll PDF.

This must affect presentation only.

Important rule:

- PDF visibility must not change the actual payroll calculation
- it must only change what is rendered in the generated PDF

### 4. FAOV second-half rule

The requested business rule is:

- first half payroll: FAOV does not apply
- second half payroll: FAOV applies

This should be implemented as an explicit calculation rule, not as a manual convention hidden in row editing.

## Recommended model direction

Separate these concepts clearly:

### Calculation settings

Company-scoped defaults and rules used by the Payroll calculator.

### Calculation results

The actual computed output for employees in a specific payroll execution.

### PDF presentation settings

Flags that control what parts of the already-computed result are displayed in the generated PDF.

This separation reduces future coupling and makes the use case easier to evolve.

## Risks

### 1. Mixing configuration and result state

If company settings and one-off payroll run adjustments are mixed carelessly, the calculator will become confusing and hard to trust.

### 2. PDF visibility accidentally affecting totals

Presentation flags must never change totals or stored results.

### 3. Rule drift

If FAOV and similar deductions remain as informal row conventions, users may get inconsistent payroll outputs.

### 4. Overtime duplication

Because overtime already exists partially in employee overrides, the new requirement must avoid creating a second conflicting overtime model.

## Attack plan

### Phase 1 - Payroll settings model definition

- objective:
  define the company-scoped Payroll settings structure and persistence strategy
- affected areas:
  Payroll domain, company configuration boundary, database model
- risk level:
  medium
- success criteria:
  there is a stable Payroll settings model tied to company context

### Phase 2 - Settings persistence and loading

- objective:
  persist Payroll calculator settings per company and load them automatically
- affected areas:
  Payroll calculator page, backend/company settings access, company context integration
- risk level:
  medium
- success criteria:
  switching company loads the correct saved Payroll settings

### Phase 3 - Rule enhancements

- objective:
  formalize FAOV second-half behavior and integrate day/night overtime consistently
- affected areas:
  calculation engine, Payroll table computation, rule configuration
- risk level:
  medium to high
- success criteria:
  FAOV behaves by quincena and overtime support is coherent and traceable

### Phase 4 - PDF visibility controls

- objective:
  let users decide which calculation segments appear in the Payroll PDF
- affected areas:
  Payroll settings, PDF generation, UI configuration
- risk level:
  medium
- success criteria:
  PDFs reflect saved company-level visibility flags without affecting calculations

### Phase 5 - Hardening and compatibility

- objective:
  ensure current payroll confirmation and receipt generation remain compatible
- affected areas:
  Payroll confirmation flow, historical metadata, PDF generation, settings defaults
- risk level:
  medium
- success criteria:
  the new settings model works without breaking current Payroll operations

## Acceptance criteria

- Payroll calculation settings are saved per company
- changing active company loads company-specific Payroll settings
- day overtime and night overtime are supported consistently
- PDF segment visibility can be configured from Payroll settings
- FAOV is applied only in the second quincena according to the defined rule
- PDF visibility does not alter payroll calculations
- current payroll confirmation flow remains functional

## Notes

This requirement should be treated as a use-case refinement of the Payroll calculator, not as a cosmetic UI enhancement.

It formalizes the calculator as:

- company-scoped
- rule-driven
- presentation-aware

which is a necessary step if Payroll is expected to scale reliably across multiple companies and legal/business variations.
