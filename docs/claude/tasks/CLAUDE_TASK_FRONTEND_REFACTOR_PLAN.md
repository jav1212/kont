# Claude Task - Frontend Refactor Plan

Use the rules in `docs/claude/rules/CLAUDE_FRONTEND_REFACTOR_RULES.md`.

Design and execute an incremental frontend refactor plan for `Kont`.

## Goal

Move the frontend toward a scalable architecture with:

- strong reusable atomic components
- clear separation between shared UI and business modules
- strict typing
- zero tolerance for duplicated primitives
- no `any`

## Context

- The current functionality is already correct and in production.
- The main problem is lack of consistent reuse of shared UI abstractions.
- Existing abstractions like `base-button` are not being consistently used.
- Future growth will add many more modules, so the frontend must scale cleanly.
- New or refactored code must be in English.
- Spanish is forbidden in code; only GUI user-facing text may remain in Spanish.

## What to do

### 1. Analyze the current frontend

Identify:

- duplicated atomic UI
- places where shared abstractions exist but are not used
- repeated Tailwind patterns that should be centralized
- misuse of page-level components as primitive UI
- `any` usage
- architectural hotspots in `app`, `shared`, and `modules`

Do not dump long file inventories.
Summarize by pattern and impact.

### 2. Propose the target frontend shape

Define a realistic target structure for this codebase:

- `app`
- `shared/ui`
- `shared/hooks`
- `shared/lib`
- `modules/<feature>`
- optional `widgets`

Explain where reusable primitives live and where business UI should live.

### 3. Produce a phased attack plan

Create a low-risk phased plan with:

- phase name
- objective
- files/modules affected
- risk level
- compatibility strategy
- success criteria

Prefer small phases.

### 4. Recommend the first implementation slice

Pick the safest high-leverage first slice.

Good candidates:

- shared button/input/select adoption
- duplicated primitive cleanup
- typed shared props cleanup
- page-level UI duplication removal

### 5. Define migration rules

Specify short operational rules for:

- atomic component reuse
- shared vs module boundaries
- typing
- comments
- compatibility
- avoiding duplicated primitives

## Constraints

- Do not rewrite the whole frontend in one pass.
- Do not change business behavior.
- Do not introduce new primitives when reusable ones already exist.
- Do not use `any`.
- Do not write code in Spanish.
- Prefer improving shared abstractions before creating local exceptions.
- Keep the plan token-efficient and implementation-oriented.

## Expected output format

Return only these sections:

1. Current frontend hotspots
2. Target architecture for this codebase
3. Phased attack plan
4. Best first slice
5. Migration rules

Keep each section compact and high-signal.
