import {
  AuthenticationFailure,
  credentialSecurityPolicy,
  evaluateAuthenticationAttempt,
  type AccountSecurityState,
  type AuthenticationAttemptResult,
  type CredentialSecurityPolicy,
  type StoredCredentialSecurityPolicy,
} from "../domain";

/** Atomic persistence boundary for credential-security state and attempt evidence. */
export interface AccountSecurityRepository {
  /**
   * Locks one account, supplies its current state, and atomically commits the state
   * returned by the callback. Implementations use a transaction or compare-and-swap.
   * @param userId - Identity whose authentication evidence is serialized.
   * @param operation - Pure state transition and associated result.
   * @returns The callback result after its state has committed.
   * @throws {AuthenticationFailure} When the account is absent or persistence cannot serialize it.
   */
  transact<T>(
    scope: AccountSecurityScope,
    operation: (state: AccountSecurityState) => {
      readonly state: AccountSecurityState;
      readonly result: T;
    },
  ): Promise<T>;
}

/** Identifies the organization-specific security state of one identity. */
export interface AccountSecurityScope {
  readonly organizationId: string;
  readonly userId: string;
  readonly policyVersion?: number;
}

/** Reads and changes server-owned credential policies. This port is trusted-server only. */
export interface CredentialSecurityPolicyRepository {
  /**
   * Reads the current security policy for one organization.
   * @param organizationId - Organization owning the policy.
   * @returns The effective versioned policy snapshot.
   * @throws {AuthenticationFailure} When trusted persistence cannot read the policy.
   */
  get(organizationId: string): Promise<StoredCredentialSecurityPolicy>;
  /**
   * Replaces a policy only when its observed version is current.
   * @param policy - Validated replacement.
   * @param expectedVersion - Version observed by the administrator.
   * @param actorUserId - Authenticated administrator performing the update.
   * @returns The persisted policy with its new version.
   * @throws {AuthenticationFailure} When authorization, validation, or compare-and-swap fails.
   */
  update(
    policy: StoredCredentialSecurityPolicy,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<StoredCredentialSecurityPolicy>;
}

/**
 * Records a login result while applying password age, inactivity, and lockout policy.
 * The adapter must serialize each user row so concurrent failures cannot bypass the lock.
 */
export class EvaluateAccountAuthentication {
  /** @param repository - Atomic account-security persistence port. */
  constructor(private readonly repository: AccountSecurityRepository) {}

  /**
   * Evaluates and records one credential attempt.
   * @param input - User, tenant policy, provider outcome, and clock instant.
   * @returns The durable allow or deny decision.
   * @throws {AuthenticationFailure} When the account is missing or persistence fails.
   */
  async execute(input: {
    readonly organizationId: string;
    readonly userId: string;
    readonly policy: CredentialSecurityPolicy;
    readonly policyVersion?: number;
    readonly occurredAt: string;
    readonly credentialsValid: boolean;
  }): Promise<AuthenticationAttemptResult> {
    return this.repository.transact(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        ...(input.policyVersion === undefined
          ? {}
          : { policyVersion: input.policyVersion }),
      },
      (state) => {
        if (
          state.userId !== input.userId ||
          state.organizationId !== input.organizationId
        )
          throw new AuthenticationFailure(
            "INVALID_CREDENTIALS",
            "Las credenciales no son válidas.",
          );
        const result = evaluateAuthenticationAttempt(
          state,
          input.policy,
          input.occurredAt,
          input.credentialsValid,
        );
        return { state: result.state, result };
      },
    );
  }
}

/** Configures the effective policy. Only a trusted administration boundary may expose it. */
export class ConfigureCredentialSecurityPolicy {
  /**
   * Creates the policy configuration use case.
   * @param repository - Server-owned policy persistence.
   * @returns A use case that normalizes policies before persistence.
   */
  constructor(
    private readonly repository: CredentialSecurityPolicyRepository,
  ) {}
  /**
   * Validates and persists a versioned organization security policy.
   * @param input - Organization, policy replacement, observed version, and actor.
   * @returns The persisted policy snapshot.
   * @throws {AuthenticationFailure} When the policy is invalid, unauthorized, or stale.
   */
  async execute(
    input: StoredCredentialSecurityPolicy & {
      readonly expectedVersion: number;
      readonly actorUserId: string;
    },
  ): Promise<StoredCredentialSecurityPolicy> {
    return this.repository.update(
      { ...input, policy: credentialSecurityPolicy(input.policy) },
      input.expectedVersion,
      input.actorUserId,
    );
  }
}

/** Persists an authorized recovery without modifying the provider's password-change timestamp. */
export interface AccountSecurityRecoveryRepository {
  /**
   * Authorizes the administrator and clears lockout/inactivity in the same transaction.
   * @param input - Verified administrator and target organizational account.
   * @returns Recovered account state, retaining the real password age.
   * @throws {AuthenticationFailure} If access is denied or persistence fails.
   */
  unlock(
    input: AccountSecurityScope & { readonly actorUserId: string },
  ): Promise<AccountSecurityState>;
}

/** Performs explicit authorized account recovery; password changes are observed in provider persistence. */
export class AdministerAccountSecurity {
  /**
   * Connects recovery to an atomic authorization and persistence boundary.
   * @param repository - Trusted account recovery persistence.
   * @returns A recovery service.
   */
  constructor(private readonly repository: AccountSecurityRecoveryRepository) {}
  /**
   * Clears an authorized account lock while retaining password-age evidence.
   * @param input - Verified administrator and target organizational account.
   * @returns The recovered durable account state.
   * @throws {AuthenticationFailure} When authorization or persistence fails.
   */
  unlock(
    input: AccountSecurityScope & { readonly actorUserId: string },
  ): Promise<AccountSecurityState> {
    return this.repository.unlock(input);
  }
}

/** Supported enterprise federation backed by the current Supabase provider. */
export type FederatedIdentityProvider = "azure";

/** Redirect-based identity-provider boundary. Azure Entra ID can federate Active Directory tenants. */
export interface FederatedSignInPort {
  /**
   * Starts a provider-managed authorization redirect.
   * @param input - Federation provider and already trusted callback URL.
   * @returns The provider redirect URL.
   * @throws {AuthenticationFailure} When the provider cannot start authorization.
   */
  startSignIn(input: {
    readonly provider: FederatedIdentityProvider;
    readonly redirectTo: string;
  }): Promise<{ readonly redirectUrl: string }>;
}

/** Validates callback destinations that an enterprise federation flow may use. */
export class FederatedRedirectPolicy {
  private readonly origins: ReadonlySet<string>;

  /**
   * Creates a callback allow-list. Origins must be configured by the application,
   * matching a redirect URL also registered with the identity provider.
   * @param trustedOrigins - Exact callback origins, such as `https://app.kontave.com`.
   * @throws {AuthenticationFailure} When the configured allow-list is unsafe or empty.
   */
  constructor(trustedOrigins: readonly string[]) {
    const origins = trustedOrigins.map(normalizeOrigin);
    if (origins.length === 0)
      throw new AuthenticationFailure(
        "INVALID_INPUT",
        "Configura al menos un origen de retorno confiable.",
      );
    this.origins = new Set(origins);
  }

  /**
   * Ensures a callback URL belongs to the configured application origins.
   * @param redirectTo - Complete callback URL requested by the client.
   * @returns Nothing when the URL is trusted.
   * @throws {AuthenticationFailure} When the callback is malformed or untrusted.
   */
  assertTrusted(redirectTo: string): void {
    let url: URL;
    try {
      url = new URL(redirectTo);
    } catch {
      throw new AuthenticationFailure(
        "INVALID_INPUT",
        "La URL de retorno de autenticación no es válida.",
      );
    }
    if (!this.origins.has(url.origin))
      throw new AuthenticationFailure(
        "INVALID_INPUT",
        "La URL de retorno no pertenece a un origen confiable.",
      );
  }
}

/** Starts an enterprise identity-provider sign-in without exposing provider SDKs to consumers. */
export class StartFederatedSignIn {
  /** @param federation - Redirect federation adapter. @param redirects - Trusted callback allow-list. */
  constructor(
    private readonly federation: FederatedSignInPort,
    private readonly redirects: FederatedRedirectPolicy,
  ) {}

  /**
   * Starts Azure Entra ID authentication for an Active Directory-connected tenant.
   * @param input - Provider and application callback URL.
   * @returns The URL to navigate the user to.
   * @throws {AuthenticationFailure} When the callback URL is absent or invalid.
   */
  async execute(input: {
    readonly provider: FederatedIdentityProvider;
    readonly redirectTo: string;
  }): Promise<{ readonly redirectUrl: string }> {
    this.redirects.assertTrusted(input.redirectTo);
    return this.federation.startSignIn({
      provider: input.provider,
      redirectTo: input.redirectTo,
    });
  }
}

function normalizeOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AuthenticationFailure(
      "INVALID_INPUT",
      "El origen confiable de autenticación no es válido.",
    );
  }
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && url.hostname === "localhost")
  ) {
    throw new AuthenticationFailure(
      "INVALID_INPUT",
      "El origen confiable debe usar HTTPS.",
    );
  }
  return url.origin;
}
