import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  InvitationCallbackPolicy,
  ProvisionOrganizationInvitationIdentity,
  type InvitationIdentityProvider,
  type OrganizationInvitationAuthorizer,
  type ProvisionedInvitationIdentity,
} from "../../application/provision-user";
import { AuthenticationFailure } from "../../domain";

/** Server-only Supabase credentials for administrative user invitations. */
export interface SupabaseInvitationProvisioningConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/**
 * Creates an administrative Supabase invitation provider.
 * @param configuration - Server-only Supabase endpoint and service-role credentials.
 * @returns A provider that asks Supabase Admin to deliver invitations.
 * @throws {AuthenticationFailure} When a later provider request is unavailable.
 */
export function createSupabaseInvitationIdentityProvider(
  configuration: SupabaseInvitationProvisioningConfiguration,
): InvitationIdentityProvider {
  return new SupabaseInvitationIdentityProvider(
    createClient(configuration.url, configuration.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
  );
}

/**
 * Creates the concrete SEG-001 invitation identity entrypoint.
 * @param configuration Server-only Supabase credentials.
 * @param exactCallbacks Full callback URLs allowed for invitation setup links.
 * @returns A use case that verifies members.invite through the trusted RPC before contacting Supabase Admin.
 */
export function createSupabaseProvisionOrganizationInvitationIdentity(
  configuration: SupabaseInvitationProvisioningConfiguration,
  exactCallbacks: readonly string[],
): ProvisionOrganizationInvitationIdentity {
  const client = createServiceClient(configuration);
  return new ProvisionOrganizationInvitationIdentity(
    new SupabaseOrganizationInvitationAuthorizer(client),
    new InvitationCallbackPolicy(exactCallbacks),
    new SupabaseInvitationIdentityProvider(client),
  );
}

/** Uses Supabase Admin invitation delivery; it never creates passwords or confirms emails. */
export class SupabaseInvitationIdentityProvider implements InvitationIdentityProvider {
  /**
   * Creates an adapter.
   * @param client Service-role Supabase client.
   * @returns An invitation identity provider.
   */
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Invites a global identity through Supabase Admin.
   * @param input - Normalized email and exact callback URL.
   * @returns The identity created for the invitation.
   * @throws {AuthenticationFailure} When the identity exists, rate limits apply, or Supabase fails.
   */
  async inviteUser(input: { readonly email: string; readonly redirectTo: string }): Promise<ProvisionedInvitationIdentity> {
    let data: { user: { id: string; email?: string | null } | null };
    let error: { message: string; code?: string | undefined } | null;
    try {
      ({ data, error } = await this.client.auth.admin.inviteUserByEmail(input.email, {
        redirectTo: input.redirectTo,
      }));
    } catch (cause: unknown) {
      throw new AuthenticationFailure("PROVIDER_UNAVAILABLE", "No se pudo contactar a Supabase para crear la invitación.", { cause });
    }
    if (error) {
      throw mapInvitationFailure(error.message, error.code, error);
    }
    const identity = data.user;
    if (!identity?.id || !identity.email) {
      throw new AuthenticationFailure("PROVIDER_UNAVAILABLE", "Supabase no devolvió la identidad invitada.");
    }
    return { userId: identity.id, email: identity.email.trim().toLowerCase() };
  }
}

/** Authorizes invitation provisioning through the service-only organization RPC. */
export class SupabaseOrganizationInvitationAuthorizer implements OrganizationInvitationAuthorizer {
  /**
   * Creates an authorizer.
   * @param client Service-role Supabase client.
   * @returns An organization invitation authorizer.
   */
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Verifies invitation authority through the service-only organization RPC.
   * @param actorUserId - Authenticated administrator identity.
   * @param organizationId - Organization receiving the future member.
   * @returns Nothing when the actor has `members.invite`.
   * @throws {AuthenticationFailure} When the RPC denies or cannot verify authority.
   */
  async authorizeInvitation(actorUserId: string, organizationId: string): Promise<void> {
    const { error } = await this.client.rpc("account_security_authorize_invitation", {
      p_actor_user_id: actorUserId,
      p_organization_id: organizationId,
    });
    if (error) {
      throw new AuthenticationFailure("ACCOUNT_SECURITY_DENIED", "No tienes permiso para invitar usuarios en esta organización.", { cause: error });
    }
  }
}

function createServiceClient(configuration: SupabaseInvitationProvisioningConfiguration): SupabaseClient {
  return createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function mapInvitationFailure(message: string, code: string | undefined, cause: unknown): AuthenticationFailure {
  if (code === "user_already_exists") {
    return new AuthenticationFailure("IDENTITY_ALREADY_EXISTS", "Ya existe una identidad con este correo.", { cause });
  }
  if (/already (registered|exists)|already been registered|duplicate/i.test(message)) {
    return new AuthenticationFailure("IDENTITY_ALREADY_EXISTS", "Ya existe una identidad con este correo.", { cause });
  }
  if (/rate limit|too many/i.test(message)) {
    return new AuthenticationFailure("RATE_LIMITED", "Se alcanzó el límite de invitaciones. Intenta más tarde.", { cause });
  }
  return new AuthenticationFailure("PROVIDER_UNAVAILABLE", "No se pudo crear la invitación de usuario.", { cause });
}
