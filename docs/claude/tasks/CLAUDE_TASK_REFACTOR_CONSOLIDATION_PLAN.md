# Claude Task - Refactor Consolidation Plan

## Goal

Close the current backend and frontend refactor without reopening major architectural redesign. The priority is to leave the system coherent, typed, reusable, and lint-healthy.

## Phase 1 - Recover the shared foundation

Attack `shared` first, because the remaining issues there contaminate the whole project.

### Scope

- `src/shared/frontend/components/base-input.tsx`
- `src/shared/frontend/components/base-button.tsx`
- `src/shared/frontend/components/base-select.tsx`
- `src/shared/frontend/components/base-table.tsx`
- `src/shared/frontend/components/theme-provider.tsx`
- `src/shared/frontend/components/pwa-install-button.tsx`
- `src/shared/frontend/hooks/use-is-desktop.ts`
- `src/shared/backend/source/infra/tenant-supabase.ts`

### Actions

- Remove `abstract class` patterns from atomic UI components that use hooks.
- Convert them into normal function components or compatible namespace-style exports without class wrappers.
- Remove all `any`.
- Properly type `BaseTable` and `BaseSelect` with real generics.
- Fix synchronous `setState` inside `useEffect`.
- Keep all technical comments and code identifiers in English.

### Exit criteria

- `shared` has no lint errors.
- `shared` has zero `any`.
- no invalid hook usage remains in shared UI.

## Phase 2 - Normalize data hooks

The loading pattern is still unstable and continues to trigger React Compiler and ESLint issues.

### Priority scope

- `src/modules/auth/frontend/hooks/use-auth.ts`
- `src/modules/companies/frontend/hooks/use-companies.ts`
- `src/modules/payroll/frontend/hooks/use-employee.ts`
- `src/modules/payroll/frontend/hooks/use-payroll-history.ts`

### Actions

- Define one consistent pattern for `loading`, `error`, `data`, and `reload`.
- Avoid `reload()` inside `useEffect` when it causes cascading state updates.
- Replace problematic manual memoization with simpler inline functions, `useEffectEvent`, or equivalent restructuring where appropriate.
- Keep hooks predictable and side effects minimal.

### Exit criteria

- zero `react-hooks/set-state-in-effect` errors in the targeted hooks
- zero `preserve-manual-memoization` errors in the targeted hooks
- hook contracts are consistent

## Phase 3 - Consolidate critical frontend screens

After fixing `shared` and the hooks, clean the pages that still carry fragile reactive patterns.

### High-priority scope

- Inventory pages
- heavy Payroll pages
- `app/(public)/accept-invite/page.tsx`

### Actions

- Remove derived state created in effects when it can be computed instead.
- reduce unused-variable warnings introduced by the refactor
- eliminate unnecessary manual callbacks
- review forms that initialize local state through effects with many chained `setState` calls

### Exit criteria

- targeted pages have no lint errors
- less fragile reactive logic
- better readability without changing behavior

## Phase 4 - Close the typing debt

This phase enforces the engineering rule that `any` is forbidden.

### Actions

- Remove `any` from all touched code in `src/` and `app/`.
- Use:
  - explicit types
  - generics
  - `unknown` with narrowing
  - unions
  - typed API response contracts
- Review especially:
  - `src/modules/payroll/frontend/components/payroll-employee-table.tsx`
  - `src/shared/backend/source/infra/tenant-supabase.ts`
  - `src/shared/frontend/components/base-table.tsx`
  - `src/shared/frontend/components/base-select.tsx`

### Exit criteria

- zero `no-explicit-any` errors
- no broad unsafe casts used as shortcuts

## Phase 5 - Align backend architecture

The direction is better, but conventions are still inconsistent across modules.

### Actions

- Standardize module folders to:
  - `application`
  - `domain`
  - `infrastructure`
- Migrate `inventory/backend/app` to `application`
- Migrate `inventory/backend/infra` to `infrastructure`
- Review Payroll so it follows the same convention used by Documents, Auth, and Companies
- Preserve external compatibility; internal renames must not break API behavior

### Exit criteria

- all backend modules follow the same folder convention
- factories and use cases use consistent names
- technical comments remain in English

## Phase 6 - Finish reusable frontend cleanup

There is good progress with shared UI, but the reuse rule still needs to be fully enforced.

### Actions

- Identify remaining duplicated controls in feature modules.
- Move them to shared only when they are truly atomic or cross-module.
- Avoid introducing new local primitives when an abstraction already exists.
- Leave a clear distinction between:
  - primitive shared UI
  - shared composed UI
  - module-specific UI

### Exit criteria

- more uniform UI system
- less duplication
- clear reuse boundaries

## Phase 7 - Close language and documentation consistency

The language rules were not fully applied in the current refactor.

### Actions

- Keep code, comments, identifiers, and technical architecture text in English.
- Allow Spanish only for final end-user visible UI text.
- Review new comments added in:
  - hooks
  - factories
  - shared UI
- Do not rewrite historical code unnecessarily; focus on the refactor scope and base layers first.

### Exit criteria

- language convention is consistent
- no unnecessary Spanish technical commentary remains in the refactor scope

## Recommended execution order

1. `shared/frontend` and `shared/backend`
2. data hooks
3. critical pages with reactive issues
4. full `any` removal
5. backend architecture alignment
6. reusable UI cleanup
7. language and documentation consistency

## Sprint breakdown

### Sprint 1

- clean `shared`
- remove `any` from base layers
- fix invalid hooks

### Sprint 2

- stabilize data hooks
- remove lint errors from critical Inventory and Payroll pages

### Sprint 3

- align backend architecture
- finish reusable UI cleanup
- close language consistency

## Expected result

At the end of this plan the project should be:

- lint-green or close to lint-green
- free of `any`
- free of invalid hooks
- backed by truly reusable shared frontend primitives
- consistent across backend module architecture
- aligned with the language and documentation rules already defined for Claude
