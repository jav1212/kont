# Authentication capability

`createSupabaseFederatedSignIn` starts Azure Entra ID OAuth through the existing Supabase client. It supports organizations whose on-premises Active Directory is federated or synchronized with Entra ID; it does not speak LDAP or AD directly.

Before enabling it, configure the Azure provider in Supabase with an Entra application registration, its client ID and secret, and a callback URL registered in both Supabase and Entra. Request the `email` scope and restrict the Entra tenant when the organization requires it. Applications must pass `StartFederatedSignIn` a `FederatedRedirectPolicy` containing only their owned HTTPS origins (HTTP is accepted only for `localhost`).

`createSupabaseAccountSecurityRepository` and `createSupabaseCredentialSecurityPolicyRepository` use service-role-only RPCs from migration 293. `transact` executes its callback locally, then compares and swaps the state version; it retries a bounded number of conflicts and does not claim that an arbitrary TypeScript callback ran inside PostgreSQL.

`SecureSignIn` combines a provider-authenticated session, the trusted policy version read at the start of the flow, and a CAS state transition under database locks. Browser callers must never supply a `credentialsValid` flag or a security policy. Password-expired accounts use the existing password recovery flow. Migration 293 updates durable security state through the authoritative `auth.users.encrypted_password` trigger after the provider password mutation, including identities that did not yet have a state row.

`account_security_unlock` requires `members.update`; it clears lockout evidence and resets `last_authenticated_at` to restore an inactive account without resetting password age. These capabilities are not yet connected to the production Web flow or deployed remotely.

`createSupabaseProvisionOrganizationInvitationIdentity` creates a global invitation identity through Supabase Admin only after the service-role RPC verifies `members.invite`. It validates an exact callback allow-list and does not create the organization membership itself; the later acceptance and local organizational assignment remain a consumer workflow.
