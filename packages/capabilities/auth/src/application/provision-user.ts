import { AuthenticationFailure } from "../domain";

/** Trusted authorization boundary for organization-scoped identity invitations. */
export interface OrganizationInvitationAuthorizer {
  /**
   * Verifies that an authenticated actor has members.invite in an organization.
   * @param actorUserId Identity established by the transport boundary.
   * @param organizationId Organization receiving the later membership invitation.
   * @returns Nothing when the actor is allowed to provision an invitation identity.
   * @throws AuthenticationFailure when the actor lacks invitation authority.
   */
  authorizeInvitation(actorUserId: string, organizationId: string): Promise<void>;
}

/** Administrative identity provider used only after organization authorization succeeds. */
export interface InvitationIdentityProvider {
  /**
   * Creates an invitation identity and asks the provider to deliver its setup link.
   * @param input Normalized email and prevalidated callback URL.
   * @returns The provider identity created for the invitation.
   * @throws AuthenticationFailure when the identity already exists or the provider rejects the request.
   */
  inviteUser(input: { readonly email: string; readonly redirectTo: string }): Promise<ProvisionedInvitationIdentity>;
}

/** Minimal identity result needed to connect the existing organization invitation flow later. */
export interface ProvisionedInvitationIdentity {
  readonly userId: string;
  readonly email: string;
}

/** Enforces exact callback destinations for administrative identity invitations. */
export class InvitationCallbackPolicy {
  private readonly allowedCallbacks: ReadonlySet<string>;

  /**
   * Creates a callback allow-list.
   * @param callbacks Full callback URLs owned by a client application.
   * @returns A callback policy instance.
   * @throws AuthenticationFailure when no valid callback is configured.
   */
  constructor(callbacks: readonly string[]) {
    const normalized = callbacks.map(normalizeCallback);
    if (normalized.length === 0) {
      throw new AuthenticationFailure("INVALID_INPUT", "Debes configurar al menos un callback de invitación.");
    }
    this.allowedCallbacks = new Set(normalized);
  }

  /**
   * Validates and normalizes one requested callback.
   * @param callback Complete callback URL requested by a client.
   * @returns The canonical configured callback URL.
   * @throws AuthenticationFailure when the URL is not an exact allow-list entry.
   */
  assertTrusted(callback: string): string {
    const normalized = normalizeCallback(callback);
    if (!this.allowedCallbacks.has(normalized)) {
      throw new AuthenticationFailure("INVALID_INPUT", "El callback de invitación no está autorizado.");
    }
    return normalized;
  }
}

/** Creates a global identity through an invitation without creating a password or organization membership. */
export class ProvisionOrganizationInvitationIdentity {
  /**
   * Creates the provisioning use case.
   * @param authorizer Trusted organization permission boundary.
   * @param callbacks Exact callback allow-list.
   * @param provider Administrative identity provider.
   * @returns A provisioning use case instance.
   */
  constructor(
    private readonly authorizer: OrganizationInvitationAuthorizer,
    private readonly callbacks: InvitationCallbackPolicy,
    private readonly provider: InvitationIdentityProvider,
  ) {}

  /**
   * Provisions an invitation identity after validating callback and organization authority.
   * This intentionally does not confirm an email, set a password, or create a membership.
   * @param input Actor, future organization scope, invitee email, and client callback.
   * @returns The global identity that the existing organization invitation acceptance flow may link later.
   * @throws AuthenticationFailure for malformed input, untrusted callback, authorization denial, or provider failure.
   */
  async execute(input: {
    readonly actorUserId: string;
    readonly organizationId: string;
    readonly email: string;
    readonly redirectTo: string;
  }): Promise<ProvisionedInvitationIdentity> {
    const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
    const organizationId = requireIdentifier(input.organizationId, "organizationId");
    const email = requireEmail(input.email);
    const redirectTo = this.callbacks.assertTrusted(input.redirectTo);
    await this.authorizer.authorizeInvitation(actorUserId, organizationId);
    const identity = await this.provider.inviteUser({ email, redirectTo });
    if (requireIdentifier(identity.userId, "userId") !== identity.userId || requireEmail(identity.email) !== email) {
      throw new AuthenticationFailure("PROVIDER_UNAVAILABLE", "El proveedor devolvió una identidad de invitación inválida.");
    }
    return { userId: identity.userId, email };
  }
}

function requireIdentifier(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 128) {
    throw new AuthenticationFailure("INVALID_INPUT", `${field} no es válido.`);
  }
  return normalized;
}

function requireEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > 254 || !/^\S+@\S+\.\S+$/.test(normalized)) {
    throw new AuthenticationFailure("INVALID_INPUT", "Ingresa un correo válido.");
  }
  return normalized;
}

function normalizeCallback(value: string): string {
  let callback: URL;
  try {
    callback = new URL(value);
  } catch {
    throw new AuthenticationFailure("INVALID_INPUT", "El callback de invitación no es válido.");
  }
  if (callback.protocol !== "https:" && !(callback.protocol === "http:" && callback.hostname === "localhost")) {
    throw new AuthenticationFailure("INVALID_INPUT", "El callback de invitación debe usar HTTPS.");
  }
  if (callback.username || callback.password || callback.hash) {
    throw new AuthenticationFailure("INVALID_INPUT", "El callback de invitación no es válido.");
  }
  return callback.toString();
}
