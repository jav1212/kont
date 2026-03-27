# Claude Backend Refactor Rules

Use these rules for every backend refactor task in `Kont`.

## Mission

Refactor the backend incrementally without breaking current production behavior.

Target architecture:

- Hexagonal Architecture
- DDD
- CQRS
- Event-sourcing ready
- SOLID
- DRY
- clear design patterns

## Non-negotiables

- Current features are already correct and in production.
- Preserve external behavior unless a change is explicitly requested.
- Prefer incremental refactors over rewrites.
- Keep diffs small, reviewable, and reversible.
- Do not mix architecture cleanup with unrelated feature work.
- All new backend code must be written in English.
- `any` is forbidden in all new or refactored code.
- Do not rename public API routes or database contracts unless required and explicitly planned.
- Do not change Supabase schema, RPC contracts, or auth behavior unless strictly necessary for the current step.

## Language rules

- Code identifiers, types, classes, interfaces, methods, folders, and file names: English.
- Comments and architectural docs inside code: English.
- Spanish is forbidden in code.
- User-facing text shown in the GUI may remain in Spanish if already in production or required by product UX.
- Legacy Spanish backend names may stay temporarily only when changing them would increase risk.
- When legacy names remain, isolate them behind adapters or mappers and avoid spreading them further.

## Typing rules

- `any` is forbidden.
- Use explicit domain types, DTOs, generics, unions, `unknown`, or narrow temporary interfaces instead.
- If a boundary is not fully known yet, prefer `unknown` plus validation/narrowing.
- Do not silence typing problems with casts unless they are minimal, justified, and localized.
- Do not introduce broad utility types that hide weak typing.

## Architectural target

Backend structure should converge toward:

- `domain`
  - entities
  - value objects
  - domain services
  - domain events
  - repository contracts
- `application`
  - commands
  - command handlers
  - queries
  - query handlers
  - use cases
  - DTOs
- `infrastructure`
  - persistence
  - Supabase adapters
  - RPC adapters
  - mappers
  - event bus abstractions/adapters
- `interfaces`
  - API route adapters
  - presenters/serializers

## CQRS rules

- Separate write and read paths when touching a feature.
- Commands change state.
- Queries never change state.
- Do not force CQRS everywhere in one pass; apply it incrementally per module.

## DDD rules

- Put business rules in domain/application, not in route handlers.
- Prefer rich domain naming over generic helpers.
- Avoid anemic services when the rule belongs to an entity or value object.
- Repository interfaces belong to the domain/application boundary, not infrastructure.

## Hexagonal rules

- Frameworks and Supabase are implementation details.
- Route handlers must depend on application services/handlers, not directly on infrastructure when avoidable.
- Infrastructure must implement ports/contracts, not define the business flow.

## Event-sourcing readiness

Do not implement full event sourcing now unless explicitly requested.

Instead, make the design ready for it:

- isolate command handling
- define domain events where meaningful
- keep state transitions explicit
- avoid hiding side effects inside repositories
- prefer append-friendly event names and explicit outcomes

## Commenting rules

Every new or substantially refactored backend file must have concise comments in English:

- file purpose
- role in the architecture
- important invariants or boundaries

Do not add noisy comments.
Comment intent, boundaries, and non-obvious decisions.

## Safety rules

- Preserve database behavior first.
- Preserve auth and tenant isolation first.
- Preserve admin/client separation first.
- Avoid big-bang folder moves.
- Prefer adapters/anti-corruption layers around legacy code.
- If a step increases delivery risk, split it into smaller phases.

## Refactor strategy

Always work in this order:

1. map current flow
2. define target boundary
3. add contracts/ports
4. add adapters
5. move business logic inward
6. keep old behavior compatible
7. verify with lint/tests/manual checks

## Output rules for every task

When finishing a task, report only:

- files changed
- architectural boundary improved
- compatibility risks
- remaining legacy hotspots

Keep responses compact.
