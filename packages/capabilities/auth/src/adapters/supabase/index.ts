import {
  createClient,
  type AuthError,
  type Session,
  type SupabaseClient,
  type SupportedStorage,
} from "@supabase/supabase-js";
import type {
  AccessTokenVerifier,
  AuthenticationProvider,
  RegisterCredentialsCommand,
  SignInCommand,
  VerifyPasswordRecoveryCodeCommand,
  VerifyRegistrationCodeCommand,
  CredentialSecurityPort,
  AuthenticatedSessionRegistry,
  FederatedSignInPort,
  AccountSecurityRepository,
  CredentialSecurityPolicyRepository,
  AccountIdentityResolver,
  AccountSecurityRecoveryRepository,
} from "../../application";
import {
  AuthenticationFailure,
  authenticatedSessionId,
  type AccountSecurityState,
  type AuthenticationAttemptResult,
  type AuthenticatedIdentity,
  type AuthenticatedSession,
  type SessionClientKind,
  type StoredCredentialSecurityPolicy,
  type RefreshedAuthenticatedSession,
} from "../../domain";

export interface SupabaseAuthConfiguration {
  readonly url: string;
  readonly anonKey: string;
}

/** Server-only credentials for account-security policy and state RPCs. */
export interface SupabaseAccountSecurityConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
  /** Maximum local callback/CAS retries when another attempt wins the row version. */
  readonly maximumCasRetries?: number;
}

/**
 * Creates state persistence backed by service-role-only RPCs.
 * The callback passed to transact executes locally and is retried after a CAS conflict;
 * it is never represented as a database transaction callback.
 * @param configuration - Service credentials and optional bounded retry count.
 * @returns Account-security repository for trusted server composition.
 */
export function createSupabaseAccountSecurityRepository(
  configuration: SupabaseAccountSecurityConfiguration,
): AccountSecurityRepository {
  return new SupabaseAccountSecurityRepository(
    createServiceClient(configuration),
    configuration.maximumCasRetries ?? 4,
  );
}

/** @param configuration - Service credentials. @returns Server-owned policy repository. */
export function createSupabaseCredentialSecurityPolicyRepository(
  configuration: SupabaseAccountSecurityConfiguration,
): CredentialSecurityPolicyRepository {
  return new SupabaseCredentialSecurityPolicyRepository(
    createServiceClient(configuration),
  );
}
/** @param configuration - Service credentials. @returns Trusted organization member resolver. */
export function createSupabaseAccountIdentityResolver(
  configuration: SupabaseAccountSecurityConfiguration,
): AccountIdentityResolver {
  return new SupabaseAccountIdentityResolver(
    createServiceClient(configuration),
  );
}

/**
 * Creates administrative account recovery backed by an atomic permission check.
 * @param configuration - Trusted server connection and service credentials.
 * @returns A recovery repository which retains the provider's password age.
 */
export function createSupabaseAccountSecurityRecovery(
  configuration: SupabaseAccountSecurityConfiguration,
): AccountSecurityRecoveryRepository {
  return new SupabaseAccountSecurityRecovery(
    createServiceClient(configuration),
  );
}

/** Atomic permission-checked lockout and inactivity recovery. */
export class SupabaseAccountSecurityRecovery implements AccountSecurityRecoveryRepository {
  /**
   * Connects recovery to the service-only RPC.
   * @param client - Trusted server Supabase client.
   * @returns A persistent recovery repository.
   */
  constructor(private readonly client: SupabaseClient) {}
  /** {@inheritDoc AccountSecurityRecoveryRepository.unlock} */
  async unlock(
    input: Parameters<AccountSecurityRecoveryRepository["unlock"]>[0],
  ): Promise<AccountSecurityState> {
    const { data, error } = await this.client.rpc("account_security_unlock", {
      p_actor_user_id: input.actorUserId,
      p_organization_id: input.organizationId,
      p_user_id: input.userId,
    });
    if (error)
      throw securityPersistenceFailure(
        error,
        "No se pudo desbloquear la cuenta.",
      );
    return readState(data, input);
  }
}

export function createSupabaseAuthenticationGateway(
  configuration: SupabaseAuthConfiguration,
  storage: SupportedStorage,
): AuthenticationProvider {
  const client = createClient(configuration.url, configuration.anonKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return new SupabaseAuthenticationGateway(client);
}

export function createSupabaseAccessTokenVerifier(
  configuration: SupabaseAuthConfiguration,
): AccessTokenVerifier {
  const client = createClient(configuration.url, configuration.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return new SupabaseAccessTokenVerifier(client);
}

export function createSupabaseAuthenticatedSessionRegistry(configuration: {
  readonly url: string;
  readonly serviceRoleKey: string;
}): AuthenticatedSessionRegistry {
  return new SupabaseAuthenticatedSessionRegistry(
    createClient(configuration.url, configuration.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }),
  );
}
export function createSupabaseCredentialSecurity(
  configuration: SupabaseAuthConfiguration,
): CredentialSecurityPort {
  return new SupabaseCredentialSecurity(configuration);
}
/**
 * Creates Azure Entra ID federation through Supabase OAuth. The Supabase project
 * must enable and configure its Azure provider before this adapter is usable.
 * @param configuration - Supabase public endpoint and anonymous key.
 * @returns A redirect federation adapter.
 */
export function createSupabaseFederatedSignIn(
  configuration: SupabaseAuthConfiguration,
): FederatedSignInPort {
  return new SupabaseFederatedSignIn(
    createClient(configuration.url, configuration.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }),
  );
}

/** Supabase OAuth adapter for Azure Entra ID, including Active Directory federation. */
export class SupabaseFederatedSignIn implements FederatedSignInPort {
  /** @param client - Supabase client configured with the Azure OAuth provider. */
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Requests an Azure authorization redirect with the trusted callback selected by the application.
   * @param input - Azure provider and already-validated callback URL.
   * @returns The Supabase-generated provider redirect URL.
   * @throws {AuthenticationFailure} When Supabase rejects the OAuth request.
   */
  async startSignIn(input: {
    readonly provider: "azure";
    readonly redirectTo: string;
  }): Promise<{ readonly redirectUrl: string }> {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: input.provider,
      options: { redirectTo: input.redirectTo, scopes: "email", skipBrowserRedirect: true },
    });
    if (error || !data.url)
      throw mapProviderFailure(
        error,
        "PROVIDER_UNAVAILABLE",
        "No se pudo iniciar la autenticación empresarial.",
      );
    return { redirectUrl: data.url };
  }
}

class SupabaseCredentialSecurity implements CredentialSecurityPort {
  constructor(private readonly configuration: SupabaseAuthConfiguration) {}
  async changePassword(accessToken: string, newPassword: string) {
    const client = createClient(
      this.configuration.url,
      this.configuration.anonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      },
    );
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error)
      throw mapProviderFailure(
        error,
        "PROVIDER_UNAVAILABLE",
        "No se pudo cambiar la contraseña.",
      );
  }
}

/** Service-role adapter with local transitions plus compare-and-swap state commits. */
export class SupabaseAccountSecurityRepository implements AccountSecurityRepository {
  /** @param client - Service-role Supabase client. @param maximumCasRetries - Bounded conflict retries. */
  constructor(
    private readonly client: SupabaseClient,
    private readonly maximumCasRetries: number,
  ) {
    if (!Number.isSafeInteger(maximumCasRetries) || maximumCasRetries < 1)
      throw new AuthenticationFailure(
        "INVALID_INPUT",
        "El número de reintentos de seguridad no es válido.",
      );
  }

  /** {@inheritDoc AccountSecurityRepository.transact} */
  async transact<T>(
    scope: {
      readonly organizationId: string;
      readonly userId: string;
      readonly policyVersion?: number;
    },
    operation: (state: AccountSecurityState) => {
      readonly state: AccountSecurityState;
      readonly result: T;
    },
  ): Promise<T> {
    for (let attempt = 0; attempt < this.maximumCasRetries; attempt += 1) {
      const current = await this.read(scope);
      const transition = operation(current);
      const evidence = authenticationEvidence(transition.result);
      const { data, error } = await this.client.rpc(
        "account_security_compare_and_swap",
        {
          p_organization_id: scope.organizationId,
          p_user_id: scope.userId,
          p_expected_version: current.version,
          p_policy_version: scope.policyVersion ?? current.policyVersion,
          p_password_changed_at: transition.state.passwordChangedAt,
          p_last_authenticated_at: transition.state.lastAuthenticatedAt,
          p_failed_attempts: [...transition.state.failedAttempts],
          p_locked_until: transition.state.lockedUntil,
          p_evidence_at: evidence?.occurredAt ?? null,
          p_evidence_outcome: evidence?.outcome ?? null,
        },
      );
      if (!error && data === true) return transition.result;
      if (isConflict(error, data)) continue;
      throw securityPersistenceFailure(
        error,
        "No se pudo guardar el estado de seguridad de la cuenta.",
      );
    }
    throw new AuthenticationFailure(
      "ACCOUNT_SECURITY_CONFLICT",
      "La cuenta cambió durante la autenticación. Intenta nuevamente.",
    );
  }

  private async read(scope: {
    readonly organizationId: string;
    readonly userId: string;
  }): Promise<
    AccountSecurityState & {
      readonly version: number;
      readonly policyVersion: number;
    }
  > {
    const { data, error } = await this.client.rpc(
      "account_security_read_state",
      { p_organization_id: scope.organizationId, p_user_id: scope.userId },
    );
    if (error)
      throw securityPersistenceFailure(
        error,
        "No se pudo leer el estado de seguridad de la cuenta.",
      );
    return readState(data, scope);
  }
}

/** Service-role policy adapter. Browser roles must never receive this client. */
export class SupabaseCredentialSecurityPolicyRepository implements CredentialSecurityPolicyRepository {
  /** @param client - Service-role Supabase client. */
  constructor(private readonly client: SupabaseClient) {}
  /** {@inheritDoc CredentialSecurityPolicyRepository.get} */
  async get(organizationId: string): Promise<StoredCredentialSecurityPolicy> {
    const { data, error } = await this.client.rpc(
      "account_security_get_policy",
      { p_organization_id: organizationId },
    );
    if (error)
      throw securityPersistenceFailure(
        error,
        "No se pudo leer la política de seguridad.",
      );
    return readPolicy(data, organizationId);
  }
  /** {@inheritDoc CredentialSecurityPolicyRepository.update} */
  async update(
    policy: StoredCredentialSecurityPolicy,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<StoredCredentialSecurityPolicy> {
    const { data, error } = await this.client.rpc(
      "account_security_update_policy",
      {
        p_organization_id: policy.organizationId,
        p_expected_version: expectedVersion,
        p_actor_user_id: actorUserId,
        p_password_maximum_age_days: policy.policy.passwordMaximumAgeDays,
        p_inactivity_maximum_days: policy.policy.inactivityMaximumDays,
        p_failed_attempt_limit: policy.policy.failedAttemptLimit,
        p_failed_attempt_window_minutes:
          policy.policy.failedAttemptWindowMinutes,
        p_lockout_minutes: policy.policy.lockoutMinutes,
      },
    );
    if (isConflict(error, data))
      throw new AuthenticationFailure(
        "ACCOUNT_SECURITY_CONFLICT",
        "La política cambió en otro proceso.",
      );
    if (error)
      throw securityPersistenceFailure(
        error,
        "No se pudo actualizar la política de seguridad.",
      );
    return readPolicy(data, policy.organizationId);
  }
}
class SupabaseAccountIdentityResolver implements AccountIdentityResolver {
  constructor(private readonly client: SupabaseClient) {}
  async resolve(input: {
    readonly organizationId: string;
    readonly email: string;
  }): Promise<{ readonly userId: string } | null> {
    const { data, error } = await this.client.rpc(
      "account_security_resolve_identity",
      { p_organization_id: input.organizationId, p_email: input.email },
    );
    if (error)
      throw securityPersistenceFailure(
        error,
        "No se pudo resolver la cuenta de seguridad.",
      );
    if (data === null) return null;
    const row = record(data);
    return {
      userId: text(row.user_id, "La identidad de seguridad no es válida."),
    };
  }
}
class SupabaseAuthenticatedSessionRegistry implements AuthenticatedSessionRegistry {
  constructor(private readonly client: SupabaseClient) {}
  async observe(input: Parameters<AuthenticatedSessionRegistry["observe"]>[0]) {
    const { error } = await this.client.rpc("observe_native_device_session", {
      p_session_id: input.id,
      p_user_id: input.userId,
      p_client: input.client,
      p_device_name: input.deviceName,
      p_operating_system: input.operatingSystem,
    });
    if (error) throw sessionFailure(error);
  }
  async list(userId: string) {
    const { data, error } = await this.client.rpc(
      "list_native_device_sessions",
      { p_user_id: userId },
    );
    if (error) throw sessionFailure(error);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: authenticatedSessionId(String(row.id)),
      userId: String(row.user_id),
      client: readClient(row.client),
      deviceName: nullable(row.device_name),
      operatingSystem: nullable(row.operating_system),
      createdAt: String(row.created_at),
      lastSeenAt: String(row.last_seen_at),
      revokedAt: nullable(row.revoked_at),
    }));
  }
  async revoke(input: Parameters<AuthenticatedSessionRegistry["revoke"]>[0]) {
    const { error } = await this.client.rpc("revoke_native_device_session", {
      p_user_id: input.userId,
      p_session_id: input.sessionId,
    });
    if (error) throw sessionFailure(error);
  }
  async revokeOthers(
    input: Parameters<AuthenticatedSessionRegistry["revokeOthers"]>[0],
  ) {
    const { error } = await this.client.rpc(
      "revoke_other_native_device_sessions",
      { p_user_id: input.userId, p_current_session_id: input.currentSessionId },
    );
    if (error) throw sessionFailure(error);
  }
}
function nullable(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}
function readClient(value: unknown): SessionClientKind {
  if (value === "web" || value === "desktop" || value === "mobile")
    return value;
  throw new AuthenticationFailure(
    "PROVIDER_UNAVAILABLE",
    "La metadata de sesión no es válida.",
  );
}
function sessionFailure(error: { message?: string }) {
  const message = error.message ?? "";
  if (message.includes("SESSION_REVOKED"))
    return new AuthenticationFailure(
      "SESSION_REVOKED",
      "La sesión fue revocada.",
    );
  if (message.includes("SESSION_NOT_FOUND"))
    return new AuthenticationFailure(
      "SESSION_NOT_FOUND",
      "La sesión no existe.",
    );
  return new AuthenticationFailure(
    "PROVIDER_UNAVAILABLE",
    "No se pudo administrar la sesión.",
    { cause: error },
  );
}

class SupabaseAuthenticationGateway implements AuthenticationProvider {
  constructor(private readonly client: SupabaseClient) {}

  async signIn(command: SignInCommand): Promise<AuthenticatedSession> {
    const { data, error } = await this.client.auth.signInWithPassword(command);
    if (error || !data.session) {
      const invalidCredentials = error?.code === "invalid_credentials";
      throw mapProviderFailure(
        error,
        invalidCredentials ? "INVALID_CREDENTIALS" : "PROVIDER_UNAVAILABLE",
        invalidCredentials
          ? "El correo o la contraseña son incorrectos."
          : "No se pudo verificar la autenticación.",
      );
    }
    return mapSession(data.session);
  }

  async register(command: RegisterCredentialsCommand): Promise<void> {
    const { error } = await this.client.auth.signUp({
      email: command.email,
      password: command.password,
    });
    if (error)
      throw mapProviderFailure(
        error,
        "PROVIDER_UNAVAILABLE",
        "No se pudo crear la cuenta.",
      );
  }

  async verifyRegistrationCode(
    command: VerifyRegistrationCodeCommand,
  ): Promise<AuthenticatedSession> {
    const { data, error } = await this.client.auth.verifyOtp({
      email: command.email,
      token: command.code,
      type: "signup",
    });
    if (error || !data.session) {
      throw mapProviderFailure(
        error,
        "VERIFICATION_CODE_INVALID",
        "El código es inválido o venció.",
      );
    }
    return mapSession(data.session);
  }

  async resendRegistrationCode(email: string): Promise<void> {
    const { error } = await this.client.auth.resend({ type: "signup", email });
    if (error)
      throw mapProviderFailure(
        error,
        "PROVIDER_UNAVAILABLE",
        "No se pudo reenviar el código.",
      );
  }

  async requestPasswordRecovery(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email);
    if (error)
      throw mapProviderFailure(
        error,
        "PROVIDER_UNAVAILABLE",
        "No se pudo enviar el código de recuperación.",
      );
  }

  async verifyPasswordRecoveryCode(
    command: VerifyPasswordRecoveryCodeCommand,
  ): Promise<void> {
    const { data, error } = await this.client.auth.verifyOtp({
      email: command.email,
      token: command.code,
      type: "recovery",
    });
    if (error || !data.session) {
      throw mapProviderFailure(
        error,
        "VERIFICATION_CODE_INVALID",
        "El código es inválido o venció.",
      );
    }
  }

  async completePasswordRecovery(password: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password });
    if (error)
      throw mapProviderFailure(
        error,
        "PROVIDER_UNAVAILABLE",
        "No se pudo actualizar la contraseña.",
      );
    const { error: signOutError } = await this.client.auth.signOut();
    if (signOutError)
      throw mapProviderFailure(
        signOutError,
        "PROVIDER_UNAVAILABLE",
        "La contraseña cambió, pero no se pudo cerrar la sesión.",
      );
  }

  async restoreSession(): Promise<AuthenticatedSession | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) {
      if (isInvalidRefreshFailure(error)) {
        await this.clearSession().catch(() => undefined);
        return null;
      }
      throw new AuthenticationFailure(
        "PROVIDER_UNAVAILABLE",
        "No se pudo restaurar la sesión.",
        { cause: error },
      );
    }
    return data.session ? mapSession(data.session) : null;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) {
      if (isInvalidRefreshFailure(error)) {
        await this.clearSession().catch(() => undefined);
        return;
      }
      throw new AuthenticationFailure(
        "PROVIDER_UNAVAILABLE",
        "No se pudo cerrar la sesión.",
        { cause: error },
      );
    }
  }

  async getAccessToken(): Promise<string | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) {
      if (isInvalidRefreshFailure(error)) {
        await this.clearSession().catch(() => undefined);
        return null;
      }
      throw new AuthenticationFailure(
        "PROVIDER_UNAVAILABLE",
        "No se pudo obtener la sesión.",
        { cause: error },
      );
    }
    return data.session?.access_token ?? null;
  }

  async refreshSession(): Promise<RefreshedAuthenticatedSession> {
    const { data: current, error: readError } =
      await this.client.auth.getSession();
    if (readError) {
      if (isInvalidRefreshFailure(readError))
        return this.expiredSession(readError);
      throw new AuthenticationFailure(
        "PROVIDER_UNAVAILABLE",
        "No se pudo leer la sesión para renovarla.",
        { cause: readError },
      );
    }
    const refreshToken = current.session?.refresh_token;
    if (!refreshToken) return this.expiredSession();

    const { data, error } = await this.client.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data.session?.access_token || !data.session.refresh_token) {
      if (!error || isInvalidRefreshFailure(error))
        return this.expiredSession(error ?? undefined);
      throw new AuthenticationFailure(
        "PROVIDER_UNAVAILABLE",
        "No se pudo renovar la sesión.",
        { cause: error },
      );
    }
    // Supabase persists refreshSession() results through the configured
    // SupportedStorage, which is DesktopSecureStorage in the installed desktop client.
    return {
      session: mapSession(data.session),
      credentials: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      },
    };
  }

  async clearSession(): Promise<void> {
    const { error } = await this.client.auth.signOut({ scope: "local" });
    if (error)
      throw new AuthenticationFailure(
        "PROVIDER_UNAVAILABLE",
        "No se pudo eliminar la sesión local.",
        { cause: error },
      );
  }

  private async expiredSession(cause?: unknown): Promise<never> {
    try {
      await this.clearSession();
    } catch {
      /* Expiration remains authoritative even if cleanup fails. */
    }
    throw new AuthenticationFailure(
      "SESSION_EXPIRED",
      "La sesión expiró. Inicia sesión nuevamente.",
      { cause },
    );
  }
}

function isInvalidRefreshFailure(error: AuthError): boolean {
  return (
    error.status === 400 ||
    error.status === 401 ||
    error.code === "refresh_token_not_found" ||
    error.code === "refresh_token_already_used" ||
    error.code === "invalid_refresh_token" ||
    error.code === "session_not_found"
  );
}

function mapProviderFailure(
  error: AuthError | null,
  fallbackCode: ConstructorParameters<typeof AuthenticationFailure>[0],
  fallbackMessage: string,
): AuthenticationFailure {
  const providerCode = error?.code;
  if (providerCode === "email_not_confirmed") {
    return new AuthenticationFailure(
      "EMAIL_NOT_VERIFIED",
      "Confirma tu correo antes de iniciar sesión.",
      { cause: error },
    );
  }
  if (
    providerCode === "user_already_exists" ||
    providerCode === "email_exists"
  ) {
    return new AuthenticationFailure(
      "IDENTITY_ALREADY_EXISTS",
      "Ya existe una cuenta con ese correo.",
      { cause: error },
    );
  }
  if (providerCode === "weak_password") {
    return new AuthenticationFailure(
      "PASSWORD_POLICY_VIOLATION",
      "La contraseña no cumple los requisitos de seguridad.",
      { cause: error },
    );
  }
  if (
    providerCode === "otp_expired" ||
    providerCode === "otp_disabled" ||
    providerCode === "bad_code_verifier"
  ) {
    return new AuthenticationFailure(
      "VERIFICATION_CODE_INVALID",
      "El código es inválido o venció.",
      { cause: error },
    );
  }
  if (providerCode?.includes("rate_limit")) {
    return new AuthenticationFailure(
      "RATE_LIMITED",
      "Espera unos minutos antes de intentarlo nuevamente.",
      { cause: error },
    );
  }
  return new AuthenticationFailure(fallbackCode, fallbackMessage, {
    cause: error ?? undefined,
  });
}

class SupabaseAccessTokenVerifier implements AccessTokenVerifier {
  constructor(private readonly client: SupabaseClient) {}

  async verify(accessToken: string): Promise<AuthenticatedIdentity | null> {
    const { data, error } = await this.client.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return {
      userId: data.user.id,
      email: data.user.email ?? null,
      sessionId: readSessionId(accessToken),
    };
  }
}

function readSessionId(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const decoded = JSON.parse(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    ) as { session_id?: unknown };
    return typeof decoded.session_id === "string" ? decoded.session_id : null;
  } catch {
    return null;
  }
}

function mapSession(session: Session): AuthenticatedSession {
  return {
    identity: { userId: session.user.id, email: session.user.email ?? null },
    expiresAt: session.expires_at ?? null,
  };
}

function createServiceClient(
  configuration: SupabaseAccountSecurityConfiguration,
): SupabaseClient {
  return createClient(configuration.url, configuration.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function readState(
  value: unknown,
  scope: { readonly organizationId: string; readonly userId: string },
): AccountSecurityState & {
  readonly version: number;
  readonly policyVersion: number;
} {
  const row = record(value);
  const failedAttempts = arrayOfStrings(
    row.failed_attempts,
    "Los intentos de seguridad no son válidos.",
  );
  const version = integer(row.version, "La versión de seguridad no es válida.");
  const organizationId = text(
    row.organization_id,
    "La organización de seguridad no es válida.",
  );
  const userId = text(row.user_id, "El usuario de seguridad no es válido.");
  if (organizationId !== scope.organizationId || userId !== scope.userId)
    throw new AuthenticationFailure(
      "PROVIDER_UNAVAILABLE",
      "La respuesta de seguridad no corresponde a la cuenta solicitada.",
    );
  return {
    organizationId,
    userId,
    version,
    policyVersion: integer(
      row.policy_version,
      "La versión de política no es válida.",
    ),
    passwordChangedAt: text(
      row.password_changed_at,
      "La fecha de contraseña no es válida.",
    ),
    lastAuthenticatedAt: text(
      row.last_authenticated_at,
      "La fecha de actividad no es válida.",
    ),
    failedAttempts: Object.freeze(failedAttempts),
    lockedUntil: nullableText(
      row.locked_until,
      "La fecha de bloqueo no es válida.",
    ),
  };
}

function readPolicy(
  value: unknown,
  organizationId: string,
): StoredCredentialSecurityPolicy {
  const row = record(value);
  if (
    text(row.organization_id, "La organización de política no es válida.") !==
    organizationId
  )
    throw new AuthenticationFailure(
      "PROVIDER_UNAVAILABLE",
      "La respuesta de política no corresponde a la organización solicitada.",
    );
  return {
    organizationId,
    version: integer(row.version, "La versión de política no es válida."),
    updatedAt: text(row.updated_at, "La fecha de política no es válida."),
    policy: {
      passwordMaximumAgeDays: nullableInteger(
        row.password_maximum_age_days,
        "La antigüedad máxima no es válida.",
      ),
      inactivityMaximumDays: nullableInteger(
        row.inactivity_maximum_days,
        "La inactividad máxima no es válida.",
      ),
      failedAttemptLimit: integer(
        row.failed_attempt_limit,
        "El límite de intentos no es válido.",
      ),
      failedAttemptWindowMinutes: integer(
        row.failed_attempt_window_minutes,
        "La ventana de intentos no es válida.",
      ),
      lockoutMinutes: integer(
        row.lockout_minutes,
        "La duración de bloqueo no es válida.",
      ),
    },
  };
}

function authenticationEvidence(
  value: unknown,
): { readonly occurredAt: string; readonly outcome: string } | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("reason" in value) ||
    !("state" in value)
  )
    return null;
  const result = value as AuthenticationAttemptResult;
  if (
    typeof result.reason !== "string" ||
    typeof result.occurredAt !== "string"
  )
    return null;
  return { occurredAt: result.occurredAt, outcome: result.reason };
}

function isConflict(
  error: { message?: string; code?: string } | null,
  data: unknown,
): boolean {
  return (
    data === false ||
    (error?.code === "P0001" &&
      error.message?.includes("ACCOUNT_SECURITY_VERSION_CONFLICT") === true)
  );
}

function securityPersistenceFailure(
  error: unknown,
  message: string,
): AuthenticationFailure {
  return new AuthenticationFailure("PROVIDER_UNAVAILABLE", message, {
    cause: error,
  });
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AuthenticationFailure(
      "PROVIDER_UNAVAILABLE",
      "La respuesta de seguridad no es válida.",
    );
  return value as Record<string, unknown>;
}
function text(value: unknown, message: string): string {
  if (typeof value !== "string" || !value)
    throw new AuthenticationFailure("PROVIDER_UNAVAILABLE", message);
  return value;
}
function nullableText(value: unknown, message: string): string | null {
  return value === null ? null : text(value, message);
}
function integer(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new AuthenticationFailure("PROVIDER_UNAVAILABLE", message);
  return value;
}
function nullableInteger(value: unknown, message: string): number | null {
  return value === null ? null : integer(value, message);
}
function arrayOfStrings(value: unknown, message: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new AuthenticationFailure("PROVIDER_UNAVAILABLE", message);
  return value as string[];
}
export * from "./provision-user";
