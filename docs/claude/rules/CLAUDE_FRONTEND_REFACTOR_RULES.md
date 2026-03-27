# Claude Frontend Refactor Rules

Use these rules for every frontend refactor task in `Kont`.

## Mission

Refactor the frontend incrementally without breaking current production behavior.

The frontend must scale to many future modules while keeping UI consistency, reuse, and strict typing.

## Non-negotiables

- Current features are already correct and in production.
- Preserve external behavior unless a change is explicitly requested.
- Prefer incremental refactors over rewrites.
- Keep diffs small, reviewable, and reversible.
- `any` is forbidden in all new or refactored frontend code.
- Spanish is forbidden in code.
- Only GUI user-facing text may be in Spanish.
- Do not create new UI primitives if an equivalent reusable abstraction already exists.
- All reusable UI must converge toward shared atomic components instead of duplicating markup across pages.
- Do not mix architectural cleanup with unrelated feature work.

## Core frontend rule

If a reusable abstraction already exists, use it.

Examples:

- If `base-button` exists, do not create new button variants from scratch in feature pages.
- If `base-input`, `base-select`, `base-table`, or other shared UI primitives exist, reuse or extend them instead of duplicating local implementations.
- If the existing abstraction is insufficient, improve the shared abstraction first, then reuse it.

## Reuse rules

- Shared atomic components must be fully reusable.
- Do not create one-off UI primitives inside pages or feature modules if they belong in shared UI.
- Prefer composition over duplication.
- Prefer variants, props, slots, and controlled extension over copy-paste components.
- If a component is used in more than one context or clearly will be reused, move it to shared UI or a reusable widget layer.

## Typing rules

- `any` is forbidden.
- Use explicit props, domain types, generics, unions, discriminated unions, or `unknown` with narrowing.
- Do not hide weak typing behind broad helper types.
- Do not use unsafe casts unless minimal and justified.

## Language rules

- Code identifiers, types, classes, interfaces, methods, folders, file names, comments, and docs inside code: English.
- Spanish is forbidden in code.
- Only final GUI text shown to users may be in Spanish.
- Legacy Spanish code names may stay temporarily only when changing them would increase delivery risk.
- When legacy names remain, isolate them and avoid spreading them further.

## Architectural target

Frontend structure should converge toward:

- `app/`
  - routes
  - layouts
  - page composition only
- `src/shared/`
  - `ui/` reusable primitives and shared composed UI
  - `hooks/`
  - `lib/`
  - `types/`
  - `constants/`
- `src/modules/`
  - domain-specific frontend by business module
  - feature components
  - hooks
  - services
  - mappers
  - local types
- optional `src/widgets/`
  - reusable cross-module blocks larger than atomic UI

## Layering rules

- `app/` can import from `modules` and `shared`.
- `modules` can import from `shared`.
- `shared` must not import from `modules`.
- Shared UI must not depend on business-specific logic.
- Business rules must not leak into atomic UI components.

## UI rules

- Shared UI primitives are the design-system source of truth.
- Feature modules may compose primitives, not re-invent them.
- Avoid repeated Tailwind class blocks for the same control pattern.
- If repeated styling appears across multiple files, extract it into the shared component.

## Documentation rules

Every new or substantially refactored frontend file must contain concise English comments explaining:

- file purpose
- architectural role
- important constraints or behavior

Do not add noisy comments.
Comment intent and boundaries, not obvious syntax.

## Refactor strategy

Always work in this order:

1. identify duplicated UI or weak boundary
2. verify whether a shared abstraction already exists
3. reuse it if possible
4. if insufficient, improve shared abstraction
5. migrate local usages
6. keep compatibility
7. run lint and verify affected flows

## Output rules for every task

When finishing a task, report only:

- files changed
- reused abstractions introduced or enforced
- duplicated UI removed
- typing improvements
- remaining legacy hotspots

Keep responses compact.
