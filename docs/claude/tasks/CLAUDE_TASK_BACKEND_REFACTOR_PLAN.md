# Claude Task - Backend Refactor Attack Plan

Use the rules in `docs/claude/rules/CLAUDE_BACKEND_REFACTOR_RULES.md`.

Design and execute an incremental backend refactor plan for `Kont`.

## Goal

Move the backend toward:

- Hexagonal Architecture
- DDD
- CQRS
- event-sourcing readiness

Without breaking current production behavior.

## Context

- The current functionality is already correct and in production.
- The problem is architecture, naming consistency, backend boundaries, and long-term maintainability.
- New backend code must be in English.
- Spanish is forbidden in code; only GUI user-facing text may remain in Spanish.
- `any` is forbidden in all new or refactored code.
- Refactor incrementally.

## What to do

### 1. Analyze the current backend

Map the current backend by module and identify:

- route handlers
- current use cases
- repositories
- direct Supabase access
- RPC-heavy flows
- mixed responsibilities
- Spanish naming in backend code
- architectural hotspots

Do not dump large file inventories.
Summarize by module and risk.

### 2. Propose the target backend shape

Define a backend target structure that is realistic for this codebase, not generic theory.

The plan must explain:

- module boundaries
- where commands and queries live
- where ports/contracts live
- where Supabase adapters live
- how API routes connect to handlers
- how to keep compatibility with current production behavior
- how to prepare for domain events and future event sourcing

### 3. Produce a phased attack plan

Create a phased plan with minimal-risk ordering.

The plan must include:

- phase name
- objective
- modules/files affected
- risk level
- compatibility strategy
- success criteria

Prefer small phases.
Do not propose a full rewrite.

### 4. Recommend the first implementation slice

Pick the safest high-leverage first slice.

Good candidates are small backend flows with:

- clear request/response boundary
- limited infra coupling
- easy verification

Explain why that slice should go first.

### 5. Define migration rules

Specify lightweight rules for the refactor:

- naming
- folder layout
- commands vs queries
- contracts vs adapters
- comments
- backward compatibility
- handling legacy Spanish names

Keep the rules short and operational.

## Constraints

- Do not rewrite the whole backend in one pass.
- Do not break API contracts unless explicitly planned.
- Do not rename database objects blindly.
- Do not spread new abstractions everywhere without immediate value.
- Do not use `any`; use explicit types, generics, unions, `unknown`, and narrowing instead.
- Prefer adapters around legacy code during transition.
- Keep the plan token-efficient and implementation-oriented.

## Expected output format

Return only these sections:

1. Current backend hotspots
2. Target architecture for this codebase
3. Phased attack plan
4. Best first slice
5. Migration rules

Keep each section compact and high-signal.
