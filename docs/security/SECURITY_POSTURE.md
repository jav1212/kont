# Security Posture

This document summarizes the current observed security posture of `Kont`.

## Assessment status

This is an engineering assessment based on source inspection.

It is not a formal security certification or penetration test.

## Overall posture

Current posture:

- **moderate**

Reasoning:

- the system has meaningful security controls already in place
- the architecture shows clear intent around isolation and authorization
- but the project is moving quickly and still has consistency risks, especially in backend/API patterns and long-term hardening discipline

## Strengths

### 1. Multi-tenant isolation is a real first-class concern

The system is not pretending to be multi-tenant with only a soft filter.

Observed strengths:

- per-tenant schemas
- tenant context resolution
- explicit membership checks for cross-tenant access
- route-level and API-level awareness of tenant state

### 2. Admin separation exists as its own security boundary

The system clearly separates:

- platform admin
- normal application user

This is good because admin compromise risk is treated differently from normal tenant usage.

### 3. RLS is present and not incidental

RLS exists in both:

- public/shared tables
- tenant-local tables

That gives the platform a meaningful database-level safety layer in addition to application logic.

### 4. Orphaned/suspended tenant handling exists

The middleware checks for:

- missing tenant record
- suspended tenants

This helps reduce stale-session and billing-state exposure.

## Weaknesses and risks

### 1. Security depends on consistency across many custom layers

The system relies on:

- middleware
- route handlers
- tenant wrappers
- RPC functions
- RLS
- storage rules

This is powerful, but also means inconsistency is a real risk if one API route bypasses the intended pattern.

### 2. Admin routing depends on a custom cookie marker

The `kont-admin` cookie is used to separate admin route behavior.

This is useful operationally, but it should be treated as a routing signal layered on top of real authorization, not as a primary trust source.

The backend admin checks do validate against `admin_users`, which is good.
Still, any future route relying only on the cookie would be a serious regression.

### 3. Service-role usage requires tight discipline

Admin checks and some privileged flows use the service role.

That is sometimes necessary, but it increases blast radius if:

- code paths expand carelessly
- helper boundaries are not respected
- future refactors make privileged clients easier to misuse

### 4. RPC-heavy logic raises verification cost

A large amount of business logic appears to live in SQL/RPC functions.

This is not inherently bad, but it creates security review pressure because correctness now spans:

- application code
- SQL functions
- schema evolution
- RLS interaction

### 5. No evidence of a formal security testing layer

From the current repository view, there is no obvious documented layer for:

- security regression tests
- authorization matrix tests
- route protection tests
- RPC permission tests

This does not mean they do not exist elsewhere, but they are not evident in the current codebase structure.

## Current practical rating by area

### Authentication

- **good**

Reason:
- Supabase Auth based
- separate admin validation exists

### Authorization

- **moderate**

Reason:
- explicit checks exist
- but consistency across all routes remains an ongoing risk

### Tenant isolation

- **good**

Reason:
- schema isolation plus access wrappers is a strong model

### Admin security

- **moderate**

Reason:
- explicit checks exist
- cookie-based routing adds an area that must stay disciplined

### Storage security

- **moderate**

Reason:
- bucket policy controls exist
- but storage access should keep being documented and reviewed as new buckets appear

### Security observability

- **weak to moderate**

Reason:
- no obvious security testing or review framework is documented in the repository

## Main conclusion

The system shows strong security intent and some genuinely solid structural protections, especially around tenant isolation and admin separation.

The main risk is not "no security model."
The main risk is drift:

- inconsistent route patterns
- expanding privileged helpers
- undocumented RPC behavior
- missing automated security verification
