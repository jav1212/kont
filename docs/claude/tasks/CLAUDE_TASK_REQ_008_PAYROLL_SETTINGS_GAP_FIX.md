# Claude Task - REQ-008 Payroll Settings Gap Fix

Implement `REQ-008` only.

Reference:
- `docs/requirements/planned/REQ-008-payroll-settings-gap-fix.md`

## Goal

Close the remaining gaps from `REQ-005` in the Payroll calculator:

- persist overtime-related defaults as company-scoped Payroll settings
- reload Payroll settings every time the active company changes
- reload Payroll settings every time the active tenant changes
- prevent stale Payroll calculator state after context switching
- improve backend validation of the Payroll settings payload

## Strict rules

- Preserve current production behavior unless the change is required by `REQ-008`.
- Do not use `any`.
- Do not use `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, or similar suppressions.
- Keep code, comments, and identifiers in English.
- Spanish is allowed only for final user-facing GUI text.
- Keep diffs small and reviewable.
- Do not mix unrelated cleanup with this task.

## Scope

### 1. Payroll settings model

Extend the persisted Payroll settings model so it includes company-scoped overtime defaults.

Minimum requirement:
- explicit support for day overtime
- explicit support for night overtime

The shape must be stable and compatible with the current saved settings approach.

### 2. Frontend settings loading

Ensure the Payroll calculator reloads settings when:
- active company changes
- active tenant changes

The UI must not keep stale rows or stale calculator values from the previous context.

This includes reloading:
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

### 3. Backend/API validation

Improve validation in the Payroll settings save flow.

Do not accept malformed payloads silently.
Validate enough to protect the stored settings shape without overengineering.

## Constraints

- Do not redesign the entire Payroll module.
- Do not rewrite employee override flows unless required for compatibility.
- Do not change public route names.
- Do not break FAOV second-half behavior.
- Do not break PDF visibility behavior.

## Expected output

When done, report only:
- files changed
- overtime settings added
- context reload behavior added or fixed
- validation improvements
- any remaining risk or limitation
