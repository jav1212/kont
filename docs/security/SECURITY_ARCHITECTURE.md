# Security Architecture

This document summarizes the current security architecture of `Kont`.

## Security boundaries

The system currently relies on several major boundaries:

- Supabase Auth for authenticated identity
- route protection in Next.js middleware
- RLS in the `public` schema
- per-tenant schemas for data isolation
- tenant access resolution through API-layer checks
- admin access validation through `admin_users`
- storage policies for bucket-level access control

## Authentication

Primary authentication is handled through Supabase Auth.

Observed patterns:

- standard app users authenticate through regular auth flows
- admin users also authenticate through Supabase Auth
- admin access is then gated by membership in `public.admin_users`

## Session separation

The system explicitly separates:

- regular app sessions
- admin sessions

This is enforced through:

- `middleware.ts`
- a dedicated `kont-admin` cookie used as a routing/security marker

Current intent:

- regular app users must not access `/admin/*`
- admin sessions must not access regular app/public routes as normal users

## Authorization model

### App users

Regular app access depends on:

- authenticated Supabase session
- route-level checks in middleware
- tenant existence/status validation

### Tenant access

Tenant-level access is resolved by `require-tenant.ts`.

Current model:

- if no `X-Tenant-Id` is provided, the user acts on their own tenant
- if `X-Tenant-Id` is provided and differs from the authenticated user
  - membership is checked in `public.tenant_memberships`
  - accepted and non-revoked membership is required
  - `actingAs` context is created

This is a critical control for multi-tenant access.

### Admin access

Admin access is resolved by:

- authenticated Supabase user
- verification against `public.admin_users`
- service-role lookup to avoid RLS blocking the check

## Data isolation

The system uses a hybrid model:

- shared data in `public`
- tenant business data in per-tenant schemas

This is a strong structural isolation pattern because tenant data is not only filtered logically, but also physically separated by schema.

## Database security

Database protection currently relies on:

- RLS on shared tables
- RLS on tenant tables
- tenant-specific policies
- service-role use only in selected privileged backend flows

Important note:

Some business operations are exposed through `public.tenant_*` RPC functions.
This means security correctness depends both on:

- schema/RLS design
- correctness of RPC function behavior

## Storage security

Observed documented storage controls:

- public avatar bucket
- policy-based restriction for writes to user-owned folder prefixes

Documents appear to use tenant metadata plus controlled access flows, which should continue to be treated as a separate private-access concern.

## Current strengths

- strong separation between admin and app routes
- multi-tenant access checks exist and are explicit
- tenant schema isolation is stronger than a purely shared-table design
- RLS is used across core public and tenant tables
- admin checks are centralized in a reusable helper

## Current sensitive areas

- heavy dependence on custom RPC correctness
- admin routing depends partly on a custom cookie marker
- service-role usage exists in privileged backend flows and must remain tightly controlled
- collaborator access is enforced partly at application level, so bypass risks must be considered in every sensitive API route
