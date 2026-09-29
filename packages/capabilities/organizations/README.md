# @kontave/organizations

Portable organization domain and application contracts. The organizational-user capability covers the local-assignment portion of SEG-001 to SEG-004 and SEG-006 to SEG-007. Global identity lifecycle, authentication, and authorization decisions remain owned by their respective capabilities.

`administrativePriority` is an explicit administrative ordering value; it is not a role, permission, or access grant. Commands obtain authorization exclusively from `UserAdministrationAuthorizer`, then validate every permitted company belongs to the requested organization. Updates and revocations require a compare-and-swap `expectedVersion`.

`RevokeOrganizationalUser` only removes the local organization assignment. It never deletes a global identity, so identities shared by another organization remain intact. `RequireOrganizationalCompanyAccess` is a portable guard consumers must compose explicitly to enforce the active assignment and permitted-company allowlist; it is not connected to existing Web behavior.

Migration 291 and `@kontave/organizations/supabase` provide a service-role adapter and additive persistence for local assignments, priority, permitted companies and exact scoped grants. A membership without an administration row retains legacy company access during the staged cutover; once configured, its allow-list is authoritative. The migration has not been applied to a remote environment. Creating an assignment still requires an existing global identity; invitation/provisioning belongs to authentication.
