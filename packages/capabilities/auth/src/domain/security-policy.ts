import { AuthenticationFailure } from "./index";

/** Configurable credential lifetime and lockout controls for one tenant. */
export interface CredentialSecurityPolicy {
  readonly passwordMaximumAgeDays: number | null;
  readonly inactivityMaximumDays: number | null;
  readonly failedAttemptLimit: number;
  readonly failedAttemptWindowMinutes: number;
  readonly lockoutMinutes: number;
}

/** Immutable account-security facts stored by an adapter. */
export interface AccountSecurityState {
  /** Organization whose policy governs this state. */
  readonly organizationId: string;
  readonly userId: string;
  readonly passwordChangedAt: string;
  readonly lastAuthenticatedAt: string;
  readonly failedAttempts: readonly string[];
  readonly lockedUntil: string | null;
}

/** Versioned server-owned policy snapshot for one organization. */
export interface StoredCredentialSecurityPolicy {
  readonly organizationId: string;
  readonly policy: CredentialSecurityPolicy;
  readonly version: number;
  readonly updatedAt: string;
}

/** Result after accepting one authentication attempt. */
export interface AuthenticationAttemptResult {
  readonly state: AccountSecurityState;
  /** Instant at which the authentication attempt was evaluated. */
  readonly occurredAt: string;
  readonly allowed: boolean;
  readonly reason:
    | "accepted"
    | "locked"
    | "password_expired"
    | "inactive"
    | "invalid_credentials";
}

/** Clears lockout evidence after a trusted administrator unlocks an account. */
export function unlockAccountSecurityState(
  state: AccountSecurityState,
): AccountSecurityState {
  return Object.freeze({
    ...state,
    failedAttempts: Object.freeze([]),
    lockedUntil: null,
  });
}

/** Marks a password change made through a trusted credential provider. */
export function passwordChangedAccountSecurityState(
  state: AccountSecurityState,
  occurredAt: string,
): AccountSecurityState {
  const changedAt = instant(occurredAt);
  if (changedAt < instant(state.passwordChangedAt)) {
    throw new AuthenticationFailure(
      "INVALID_INPUT",
      "La fecha de cambio de contraseña no puede retroceder.",
    );
  }
  return Object.freeze({
    ...state,
    passwordChangedAt: changedAt.toISOString(),
    lastAuthenticatedAt: changedAt.toISOString(),
    failedAttempts: Object.freeze([]),
    lockedUntil: null,
  });
}

/**
 * Validates one configurable credential-security policy.
 * @param policy - Tenant-owned password, inactivity, and lockout settings.
 * @returns A normalized immutable policy.
 * @throws {AuthenticationFailure} When a security limit is inconsistent.
 */
export function credentialSecurityPolicy(
  policy: CredentialSecurityPolicy,
): CredentialSecurityPolicy {
  const positiveOrNull = (value: number | null): boolean =>
    value === null || (Number.isSafeInteger(value) && value > 0);
  if (
    !positiveOrNull(policy.passwordMaximumAgeDays) ||
    !positiveOrNull(policy.inactivityMaximumDays) ||
    !Number.isSafeInteger(policy.failedAttemptLimit) ||
    policy.failedAttemptLimit < 1 ||
    !Number.isSafeInteger(policy.failedAttemptWindowMinutes) ||
    policy.failedAttemptWindowMinutes < 1 ||
    !Number.isSafeInteger(policy.lockoutMinutes) ||
    policy.lockoutMinutes < 1
  ) {
    throw new AuthenticationFailure(
      "INVALID_INPUT",
      "La política de seguridad de credenciales no es válida.",
    );
  }
  return Object.freeze({ ...policy });
}

/**
 * Evaluates login security without coupling the domain to a credential provider.
 * @param state - Persisted account-security facts.
 * @param policy - Effective tenant security policy.
 * @param occurredAt - ISO instant at which the attempt is being evaluated.
 * @param credentialsValid - Whether the delegated identity provider accepted credentials.
 * @returns An immutable decision and the state the persistence port must commit atomically.
 * @throws {AuthenticationFailure} When security timestamps are invalid.
 */
export function evaluateAuthenticationAttempt(
  state: AccountSecurityState,
  policy: CredentialSecurityPolicy,
  occurredAt: string,
  credentialsValid: boolean,
): AuthenticationAttemptResult {
  const normalizedPolicy = credentialSecurityPolicy(policy);
  const now = instant(occurredAt);
  const passwordChangedAt = instant(state.passwordChangedAt);
  const lastAuthenticatedAt = instant(state.lastAuthenticatedAt);
  const lockedUntil =
    state.lockedUntil === null ? null : instant(state.lockedUntil);
  const failureInstants = state.failedAttempts.map(instant);
  for (const timestamp of [
    passwordChangedAt,
    lastAuthenticatedAt,
    ...failureInstants,
  ]) {
    if (timestamp > now)
      throw new AuthenticationFailure(
        "INVALID_INPUT",
        "La fecha de seguridad no puede estar en el futuro.",
      );
  }
  const failures = failureInstants
    .filter(
      (attempt) =>
        now.getTime() - attempt.getTime() <=
        normalizedPolicy.failedAttemptWindowMinutes * 60_000,
    )
    .map((attempt) => attempt.toISOString());
  const snapshot = (
    next: Partial<AccountSecurityState>,
  ): AccountSecurityState =>
    Object.freeze({
      ...state,
      ...next,
      failedAttempts: Object.freeze(next.failedAttempts ?? failures),
    });
  if (lockedUntil && lockedUntil > now)
    return {
      state: snapshot({}),
      occurredAt: now.toISOString(),
      allowed: false,
      reason: "locked",
    };
  if (
    normalizedPolicy.passwordMaximumAgeDays !== null &&
    now.getTime() - passwordChangedAt.getTime() >=
      normalizedPolicy.passwordMaximumAgeDays * 86_400_000
  )
    return {
      state: snapshot({}),
      occurredAt: now.toISOString(),
      allowed: false,
      reason: "password_expired",
    };
  if (
    normalizedPolicy.inactivityMaximumDays !== null &&
    now.getTime() - lastAuthenticatedAt.getTime() >=
      normalizedPolicy.inactivityMaximumDays * 86_400_000
  )
    return {
      state: snapshot({}),
      occurredAt: now.toISOString(),
      allowed: false,
      reason: "inactive",
    };
  if (credentialsValid)
    return {
      state: snapshot({
        failedAttempts: [],
        lockedUntil: null,
        lastAuthenticatedAt: occurredAt,
      }),
      occurredAt: now.toISOString(),
      allowed: true,
      reason: "accepted",
    };
  const nextFailures = [...failures, occurredAt];
  const shouldLock = nextFailures.length >= normalizedPolicy.failedAttemptLimit;
  const nextLock = new Date(
    now.getTime() + normalizedPolicy.lockoutMinutes * 60_000,
  );
  if (shouldLock && Number.isNaN(nextLock.getTime())) {
    throw new AuthenticationFailure(
      "INVALID_INPUT",
      "La duración del bloqueo excede el rango de fechas admitido.",
    );
  }
  return {
    state: snapshot({
      failedAttempts: nextFailures,
      lockedUntil: shouldLock ? nextLock.toISOString() : null,
    }),
    occurredAt: now.toISOString(),
    allowed: false,
    reason: "invalid_credentials",
  };
}

function instant(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new AuthenticationFailure(
      "INVALID_INPUT",
      "La fecha de seguridad no es válida.",
    );
  return parsed;
}
