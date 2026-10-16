import { AuthenticationFailure, type AuthenticatedSession } from "../domain";
import {
  EvaluateAccountAuthentication,
  type CredentialSecurityPolicyRepository,
} from "./account-security";
import type { CredentialSignInPort, SessionPort, SignInCommand } from "./index";

/** Resolves an organization member without exposing identity existence to a browser. */
export interface AccountIdentityResolver {
  /** @param input - Trusted-server organization and normalized email lookup. @returns Member user ID, or null. */
  resolve(input: {
    readonly organizationId: string;
    readonly email: string;
  }): Promise<{ readonly userId: string } | null>;
}

/**
 * Completes provider authentication only after applying the server-owned account policy.
 * A rejected result always clears the session the provider may have issued.
 */
export class SecureSignIn {
  /**
   * Composes a trusted-server login; credentials must not issue client-visible tokens before this service returns.
   * @param provider - Credential provider that is authoritative for password validation.
   * @param sessions - Local-session control for denying issued sessions.
   * @param policies - Trusted read access to organization policy.
   * @param attempts - Durable account-state evaluator.
   * @param clock - Source of instants for durable evidence.
   * @param identities - Trusted member resolver for recording rejected attempts without disclosing identities.
   * @returns A login service that commits the policy decision before returning a session.
   */
  constructor(
    private readonly provider: CredentialSignInPort,
    private readonly sessions: Pick<SessionPort, "clearSession">,
    private readonly policies: CredentialSecurityPolicyRepository,
    private readonly attempts: EvaluateAccountAuthentication,
    private readonly clock: { now(): string },
    private readonly identities: AccountIdentityResolver,
  ) {}

  /**
   * Validates credentials with the identity provider, then evaluates the persisted policy.
   * @param input - Organization selected by a trusted server boundary and credentials.
   * @returns The authenticated session when account policy permits it.
   * @throws {AuthenticationFailure} When credentials or account policy deny authentication.
   */
  async execute(
    input: SignInCommand & { readonly organizationId: string },
  ): Promise<AuthenticatedSession> {
    let session: AuthenticatedSession;
    try {
      session = await this.provider.signIn({
        email: input.email,
        password: input.password,
      });
    } catch (cause) {
      if (
        cause instanceof AuthenticationFailure &&
        cause.code === "INVALID_CREDENTIALS"
      ) {
        try {
          const identity = await this.identities.resolve({
            organizationId: input.organizationId,
            email: input.email.trim().toLowerCase(),
          });
          if (identity) {
            const stored = await this.policies.get(input.organizationId);
            await this.attempts.execute({
              organizationId: input.organizationId,
              userId: identity.userId,
              policy: stored.policy,
              policyVersion: stored.version,
              occurredAt: this.clock.now(),
              credentialsValid: false,
            });
          }
        } catch {
          /* Keep the provider's generic answer even when security telemetry is unavailable. */
        }
      }
      // Preserve the provider's generic rejection so the lookup cannot enumerate accounts.
      throw cause;
    }
    try {
      const stored = await this.policies.get(input.organizationId);
      const decision = await this.attempts.execute({
        organizationId: input.organizationId,
        userId: session.identity.userId,
        policy: stored.policy,
        policyVersion: stored.version,
        occurredAt: this.clock.now(),
        credentialsValid: true,
      });
      if (decision.allowed) return session;
      throw new AuthenticationFailure(
        "ACCOUNT_SECURITY_DENIED",
        denialMessage(decision.reason),
      );
    } catch (cause) {
      await this.sessions.clearSession().catch(() => undefined);
      throw cause;
    }
  }
}

function denialMessage(
  reason:
    | "locked"
    | "password_expired"
    | "inactive"
    | "invalid_credentials"
    | "accepted",
): string {
  if (reason === "locked") return "La cuenta está bloqueada temporalmente.";
  if (reason === "password_expired")
    return "La contraseña venció. Debes recuperarla antes de continuar.";
  if (reason === "inactive")
    return "La cuenta está inactiva por falta de uso. Solicita su desbloqueo.";
  return "No se pudo autorizar el inicio de sesión.";
}
