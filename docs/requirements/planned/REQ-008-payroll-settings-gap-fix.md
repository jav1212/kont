# REQ-008 - Payroll Settings Gap Fix

## Metadata

- ID: `REQ-008`
- Name: `Payroll Settings Gap Fix`
- Status: `Planned`
- Priority: `High`
- Owner: `Product / Engineering`

## Objective

Close the functional gaps left after `REQ-005` so Payroll calculation settings behave as a complete company-scoped and tenant-safe configuration workflow.

## Context

`REQ-005` was implemented partially. The current module already supports:

- company-scoped Payroll settings persistence
- FAOV behavior by quincena
- PDF visibility flags
- saved calculation defaults for several Payroll parameters

However, two important gaps remain:

1. overtime support was integrated into calculation and employee-level overrides, but not into persisted company-level Payroll settings
2. settings loading must be guaranteed whenever the active company or active tenant changes, so the calculator never keeps stale configuration from a previous context

This requirement exists only to close those gaps without redesigning the entire Payroll module.

## Scope

This requirement includes:

- company-scoped default overtime configuration
- explicit support for day overtime and night overtime in saved Payroll settings
- guaranteed Payroll settings reload when company changes
- guaranteed Payroll settings reload when tenant changes
- protection against stale calculator state after context changes
- safer backend validation for Payroll settings payloads

## Out Of Scope

This requirement does not include:

- a Payroll module rewrite
- accounting integration
- a full redesign of employee-level overrides
- a new overtime legal model beyond the already accepted Payroll logic
- changes to final user-visible Spanish text unless strictly needed for UX clarity

## Functional Gaps To Close

### 1. Overtime must become company-scoped configuration

Current state:

- overtime lines exist in employee-level calculation overrides
- day and night overtime are computed correctly
- they are not part of the persisted company settings model

Required state:

- Payroll settings must support company-level overtime defaults
- the settings model must explicitly store day overtime and night overtime configuration
- the calculator must load those defaults for the active company
- the PDF flow must stay consistent with the saved overtime-related visibility rules

Minimum expected configuration support:

- day overtime enabled/default behavior
- night overtime enabled/default behavior
- default overtime rows or equivalent reusable overtime definitions

### 2. Settings must reload on company and tenant change

Current state:

- settings are loaded by company
- behavior must be hardened so no stale calculation state survives a company or tenant switch

Required state:

- when the active company changes, Payroll settings must reload immediately
- when the active tenant changes, Payroll settings must reload immediately
- after either change, the calculator must reflect the correct company-scoped settings
- stale state from the previous tenant/company must not remain visible or active

This includes at least:

- earning rows
- deduction rows
- bonus rows
- salary mode
- utility days
- vacation bonus days
- meal-ticket settings
- night-shift settings
- overtime defaults
- minimum salary reference
- PDF visibility settings

## Frontend Impact

The Payroll calculator page must:

- react to active company changes
- react to active tenant changes
- reset and reapply calculation configuration safely
- include persisted overtime configuration in the left-side calculation settings workflow

The UI must make it clear that the displayed calculation settings belong to the currently active company and tenant context.

## Backend Impact

The backend must:

- extend the `PayrollSettings` model to include overtime defaults
- persist those values safely per company
- validate incoming settings payloads more strictly before saving
- preserve tenant and company isolation

## Database Impact

If the current `payroll_settings` JSONB structure is used, it must be extended to support overtime-related configuration fields.

No new table is required if the existing company-scoped JSONB model remains sufficient.

## Security Impact

- settings must remain tenant-scoped
- settings must remain company-scoped
- switching tenant/company must never expose the previous context configuration
- invalid or malformed settings payloads should not be saved silently

## Acceptance Criteria

- Payroll settings include persisted overtime-related configuration
- day overtime and night overtime are represented in the saved settings model
- Payroll settings reload every time the active company changes
- Payroll settings reload every time the active tenant changes
- no stale Payroll configuration remains after switching context
- PDF behavior remains aligned with the currently active saved settings
- backend validation rejects malformed settings payloads

## Verification

Verify with these scenarios:

1. save Payroll settings for Company A and Company B with different values
2. switch from Company A to Company B and confirm the calculator reflects Company B settings
3. switch back and confirm Company A settings return correctly
4. switch tenant context and confirm Payroll settings reload for the new tenant/company combination
5. confirm overtime defaults persist and reload correctly
6. confirm FAOV second-half behavior still works after context switching
7. confirm PDF visibility still follows the currently active settings

## Assumptions

- the active tenant and active company contexts are already available in the app
- Payroll settings will continue to be stored per company
- overtime remains part of the Payroll calculation workflow and does not require a separate module
