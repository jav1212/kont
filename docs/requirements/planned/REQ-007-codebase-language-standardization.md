# REQ-007 - Codebase Language Standardization

## Metadata

- ID: `REQ-007`
- Name: `Codebase Language Standardization`
- Status: `Planned`
- Priority: `High`
- Owner: `Product / Engineering`

## Objective

Standardize the internal language of the codebase so that all technical code artifacts are written in English, while preserving Spanish only for final GUI text explicitly shown to end users.

## Context

The project already defines a strict engineering rule: code identifiers, comments, file names, folder names, and technical documentation inside code must be in English. However, the current codebase still contains Spanish in shared utilities, module-level backend code, payroll utilities, inventory infrastructure, comments, and legacy database migration names.

This creates multiple problems:

- inconsistent engineering conventions
- harder onboarding for future contributors
- weaker architectural readability
- duplicated naming styles across modules
- friction when refactoring toward a clean, scalable architecture

The issue is not user-facing Spanish text in the GUI. That text is allowed and should remain in Spanish when required by product UX. The problem is internal technical language.

## Scope

This requirement includes:

- English-only technical comments
- English-only identifiers in touched code
- English-only file and folder names for active source code
- English-only architectural naming in module internals
- cleanup of Spanish terminology in shared, inventory backend, payroll utilities, and related module internals
- alignment of internal naming with the existing engineering rules

## Out Of Scope

This requirement does not include:

- changing Spanish text intentionally shown to users in the GUI
- changing business labels or legal wording required in PDFs or UI
- forced renaming of historical migration files if that introduces migration risk
- breaking public API routes or external contracts solely for language cleanup
- rewriting stable production behavior

## Functional Impact

This is primarily a maintainability and architecture requirement. It should not change product behavior by itself.

Expected outcomes:

- the codebase becomes internally consistent
- technical communication becomes clearer
- future refactors become easier and safer
- naming aligns with the target backend/frontend architecture

## Frontend Impact

Review and standardize internal language in:

- shared frontend components
- shared hooks and utilities
- payroll frontend utilities and helpers
- inventory frontend helpers and comments
- page-level non-UI identifiers where safe

Allowed exception:

- visible UI text may remain in Spanish

## Backend Impact

Review and standardize internal language in:

- shared backend utilities
- inventory backend factories, repositories, and comments
- payroll backend naming where still mixed
- module internals that still expose Spanish technical terminology

Target:

- folder names, use cases, repository contracts, comments, and helper names should converge toward English technical naming

## Database Impact

Database-related cleanup must be conservative.

Allowed:

- English comments in SQL files if touched
- English naming in new SQL artifacts

Avoid unless explicitly planned:

- renaming historical migration files
- renaming live SQL contracts or RPCs only for cosmetic language reasons

## Security Impact

No direct security change is expected. However, the cleanup must preserve:

- tenant isolation
- admin/client separation
- route compatibility
- database contract stability

## Priority Areas

### High Priority

- `src/shared/*`
- `src/modules/inventory/backend/infra/*`
- `src/modules/payroll/frontend/utils/*`
- shared/backend and shared/frontend comments

### Medium Priority

- module hooks with mixed Spanish comments or identifiers
- app/api internals with Spanish technical wording
- page-level local state names when safe to rename

### Low Priority

- legacy SQL migration file names
- legacy internal names whose renaming would create migration or compatibility risk

## Key Rules

- Spanish is forbidden in technical code artifacts.
- English is required for:
  - identifiers
  - file names
  - folder names
  - comments
  - inline technical documentation
  - architectural terminology
- Spanish is allowed only for final user-facing GUI text.
- Do not silence the issue with lint/compiler suppression comments.
- Do not break production behavior for cosmetic renames.

## Implementation Strategy

### Phase 1 - Shared layer

Standardize internal language in:

- shared frontend components
- shared frontend utilities
- shared backend utilities
- shared architectural comments

### Phase 2 - Inventory backend

Standardize:

- factory names
- comments
- repository naming where safe
- mixed Spanish technical labels in active backend inventory code

### Phase 3 - Payroll frontend utilities

Standardize:

- helper names
- PDF utility comments
- calculator terminology
- internal non-UI identifiers

### Phase 4 - API and page internals

Standardize:

- route-level internal comments
- non-user-facing variables
- page internals where renames are low-risk

### Phase 5 - Legacy review

Document remaining intentional legacy Spanish names that cannot be safely renamed yet without broader migration planning.

## Acceptance Criteria

- all touched technical code is in English
- user-facing Spanish text remains intact
- no new Spanish technical identifiers are introduced
- no lint/compiler suppressions are added to bypass the cleanup
- compatibility and runtime behavior remain stable
- remaining Spanish legacy hotspots are explicitly identified if left unresolved

## Verification

Verify by:

- searching for Spanish technical terms in `src/`, `app/`, and active source files
- reviewing shared, inventory backend, and payroll utility layers first
- confirming that GUI text in Spanish remains unchanged where required
- ensuring no public contract was broken by renames

## Assumptions

- the project will continue using Spanish for final user-visible product text
- internal engineering language should be fully English
- migration file names may remain legacy if renaming them introduces operational risk
- this requirement should be executed incrementally, not as a single risky rewrite
