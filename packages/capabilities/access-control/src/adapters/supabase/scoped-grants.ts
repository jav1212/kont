import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ScopedAccessGrantWriter } from "../../application";
import type { AccessControlSupabaseConfiguration } from "./index";
import { AccessControlFailure, AuthorizationDenied, AuthorizationReason } from "../../domain";

/**
 * Builds the persisted exact-target grant adapter used by SEG-012 through SEG-016 and SEG-022.
 * @param configuration - Server-only Supabase endpoint and service-role credentials.
 * @returns A scoped-grant reader and writer backed by trusted RPCs.
 * @throws {AccessControlFailure} When a later RPC call cannot reach persistence.
 */
export function createSupabaseScopedAccessGrants(
  configuration: AccessControlSupabaseConfiguration,
): ScopedAccessGrantWriter {
  return new SupabaseScopedAccessGrants(
    createClient(configuration.url, configuration.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }),
  );
}
/** Reads and writes explicit membership grants through service-only RPCs. */
export class SupabaseScopedAccessGrants implements ScopedAccessGrantWriter {
  /**
   * Creates a trusted scoped-grant adapter.
   * @param client - Service-role client; each mutation requires a verified actor with `roles.manage`.
   * @returns An adapter for exact membership grants.
   */
  constructor(private readonly client: SupabaseClient) {}
  /** {@inheritDoc ScopedAccessGrantWriter.hasGrant} */
  async hasGrant(
    input: Parameters<ScopedAccessGrantWriter["hasGrant"]>[0],
  ): Promise<boolean> {
    validateScope(input.actor.organizationId, input.resource?.organizationId);
    const data = await this.call(
      "organization_scoped_grant_has",
      readArgs(input),
    );
    if (typeof data !== "boolean") throw unavailable();
    return data;
  }
  /** {@inheritDoc ScopedAccessGrantWriter.grant} */
  async grant(
    input: Parameters<ScopedAccessGrantWriter["grant"]>[0],
  ): Promise<void> {
    validateScope(
      input.administrator.organizationId,
      input.resource?.organizationId,
    );
    await this.call("organization_scoped_grant_grant", writeArgs(input));
  }
  /** {@inheritDoc ScopedAccessGrantWriter.revoke} */
  async revoke(
    input: Parameters<ScopedAccessGrantWriter["revoke"]>[0],
  ): Promise<void> {
    validateScope(
      input.administrator.organizationId,
      input.resource?.organizationId,
    );
    await this.call("organization_scoped_grant_revoke", writeArgs(input));
  }
  private async call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      const { data, error } = await this.client.rpc(name, args);
      if (error) {
        if (/ACCESS_DENIED|permission denied/.test(error.message))
          throw denied();
        throw unavailable();
      }
      return data;
    } catch (cause) {
      if (cause instanceof AccessControlFailure || cause instanceof AuthorizationDenied) throw cause;
      throw unavailable();
    }
  }
}
function validateScope(
  actor: string | undefined,
  resource: string | undefined,
): void {
  if (!actor || (resource !== undefined && resource !== actor))
    throw denied();
}
function denied():AuthorizationDenied { return new AuthorizationDenied({allowed:false,reason:AuthorizationReason.PolicyDenied,matchedPolicy:"scoped-grants",policyVersion:"1"}); }
function unavailable(): AccessControlFailure {
  return new AccessControlFailure(
    "ACCESS_CONTROL_REPOSITORY_UNAVAILABLE",
    "Scoped grant persistence is unavailable or returned malformed data.",
  );
}
function readArgs(input: Parameters<ScopedAccessGrantWriter["hasGrant"]>[0]) {
  return {
    p_organization_id: input.actor.organizationId,
    p_actor_user_id: input.actor.userId,
    p_permission_code: input.permission,
    p_target_kind: input.target.kind,
    p_target_id: input.target.id,
    p_company_id: input.resource?.companyId ?? null,
  };
}
function writeArgs(input: Parameters<ScopedAccessGrantWriter["grant"]>[0]) {
  return {
    p_organization_id: input.administrator.organizationId,
    p_actor_user_id: input.administrator.userId,
    p_membership_id: input.membershipId,
    p_permission_code: input.permission,
    p_target_kind: input.target.kind,
    p_target_id: input.target.id,
    p_company_id: input.resource?.companyId ?? null,
  };
}
