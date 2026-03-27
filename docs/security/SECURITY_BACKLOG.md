# Security Backlog

This document lists the highest-value security hardening steps for `Kont`.

## Priority 1

### 1. Create an authorization matrix

Document who can do what for:

- owner
- tenant admin
- contable
- platform admin
- normal authenticated user
- unauthenticated user

Why:
- reduces ambiguity
- helps verify routes and RPCs
- makes regressions easier to spot

### 2. Audit all API routes for wrapper consistency

Verify every sensitive route uses the correct guard:

- `require-tenant`
- `withTenant`
- `require-admin`
- direct service-role usage only when justified

Why:
- one inconsistent route can bypass the intended model

### 3. Document all privileged service-role flows

Create a small inventory of:

- which routes use service role
- why
- what they can access

Why:
- reduces accidental privilege spread

## Priority 2

### 4. Add security regression checks

At minimum, add tests or scripted checks for:

- admin-only routes blocked for non-admins
- tenant-only routes blocked when unauthenticated
- cross-tenant access denied without membership
- revoked membership access denied
- suspended tenant restrictions enforced

### 5. Document RPC security assumptions

For critical `public.tenant_*` functions, document:

- expected caller
- required preconditions
- tenant resolution assumptions
- side effects

### 6. Review custom admin cookie usage

Ensure the `kont-admin` cookie remains:

- a routing/session marker
- never a standalone authorization source

## Priority 3

### 7. Add a secure coding checklist for vibe-coded changes

Before merging backend or auth-sensitive changes, verify:

- no new `any` in security-sensitive code
- correct auth wrapper used
- no direct privileged client leak
- no route bypasses middleware assumptions
- no new Spanish legacy naming introduced in new backend/frontend code

### 8. Track security-sensitive modules

Tag and monitor changes in:

- auth
- admin APIs
- tenant access wrappers
- shared backend helpers
- Supabase migration files

## Suggested next documentation step

Create a future file such as:

- `docs/security/AUTHORIZATION_MATRIX.md`

That single document would significantly improve security clarity during refactors.
