import {
  AuthenticationFailure,
  assertPasswordAccepted,
  type AuthenticatedIdentity,
  type AuthenticatedSession,
  type RefreshedAuthenticatedSession,
  type AuthenticatedDeviceSession,
  type AuthenticatedSessionId,
  type NativeSessionClient,
} from "@kontave/auth-domain";

export const authenticationCodeLength = 8;

export interface SignInCommand {
  readonly email: string;
  readonly password: string;
}

export interface RegisterCredentialsCommand {
  readonly email: string;
  readonly password: string;
}

export interface VerifyRegistrationCodeCommand {
  readonly email: string;
  readonly code: string;
}

export interface RequestPasswordRecoveryCommand {
  readonly email: string;
}

export interface VerifyPasswordRecoveryCodeCommand {
  readonly email: string;
  readonly code: string;
}

export interface CompletePasswordRecoveryCommand {
  readonly password: string;
}

export interface CredentialSignInPort {
  signIn(command: SignInCommand): Promise<AuthenticatedSession>;
}

export interface SessionPort {
  restoreSession(): Promise<AuthenticatedSession | null>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  refreshSession(): Promise<RefreshedAuthenticatedSession>;
  clearSession(): Promise<void>;
}

export interface RegistrationPort {
  register(command: RegisterCredentialsCommand): Promise<void>;
  verifyRegistrationCode(command: VerifyRegistrationCodeCommand): Promise<AuthenticatedSession>;
  resendRegistrationCode(email: string): Promise<void>;
}

export interface PasswordRecoveryPort {
  requestPasswordRecovery(email: string): Promise<void>;
  verifyPasswordRecoveryCode(command: VerifyPasswordRecoveryCodeCommand): Promise<void>;
  completePasswordRecovery(password: string): Promise<void>;
}

export interface AccessTokenVerifier {
  verify(accessToken: string): Promise<AuthenticatedIdentity | null>;
}

export interface NativeSessionRegistry {
  observe(input: {
    readonly id: AuthenticatedSessionId;
    readonly userId: string;
    readonly client: NativeSessionClient;
    readonly deviceName: string | null;
    readonly operatingSystem: string | null;
  }): Promise<void>;
  list(userId: string): Promise<readonly Omit<AuthenticatedDeviceSession, "current">[]>;
  revoke(input: { readonly userId: string; readonly sessionId: AuthenticatedSessionId }): Promise<void>;
  revokeOthers(input: { readonly userId: string; readonly currentSessionId: AuthenticatedSessionId }): Promise<void>;
}

export interface CredentialSecurityPort {
  changePassword(accessToken: string, newPassword: string): Promise<void>;
}

export class ObserveNativeSession {
  constructor(private readonly registry: NativeSessionRegistry) {}

  execute(input: Parameters<NativeSessionRegistry["observe"]>[0]): Promise<void> {
    return this.registry.observe(input);
  }
}

export class ListAuthenticatedSessions {
  constructor(private readonly registry: NativeSessionRegistry) {}

  async execute(userId: string, currentSessionId: AuthenticatedSessionId): Promise<readonly AuthenticatedDeviceSession[]> {
    return (await this.registry.list(userId)).map((session) => ({
      ...session,
      current: session.id === currentSessionId,
    }));
  }
}

export class RevokeAuthenticatedSession {
  constructor(private readonly registry: NativeSessionRegistry) {}

  execute(input: {
    readonly userId: string;
    readonly sessionId: AuthenticatedSessionId;
    readonly currentSessionId: AuthenticatedSessionId;
  }): Promise<void> {
    if (input.sessionId === input.currentSessionId) {
      throw new AuthenticationFailure("INVALID_INPUT", "Usa cerrar sesión para revocar la sesión actual.");
    }
    return this.registry.revoke(input);
  }
}

export class RevokeOtherAuthenticatedSessions {
  constructor(private readonly registry: NativeSessionRegistry) {}

  execute(input: { readonly userId: string; readonly currentSessionId: AuthenticatedSessionId }): Promise<void> {
    return this.registry.revokeOthers(input);
  }
}

export class ChangePassword {
  constructor(
    private readonly credentials: CredentialSecurityPort,
    private readonly sessions: NativeSessionRegistry,
  ) {}

  async execute(input: {
    readonly userId: string;
    readonly accessToken: string;
    readonly currentSessionId: AuthenticatedSessionId;
    readonly newPassword: string;
    readonly revokeOtherSessions: boolean;
  }): Promise<void> {
    assertPasswordAccepted(input.newPassword);
    await this.credentials.changePassword(input.accessToken, input.newPassword);
    if (input.revokeOtherSessions) {
      await this.sessions.revokeOthers({ userId: input.userId, currentSessionId: input.currentSessionId });
    }
  }
}

export type AuthenticationGateway = CredentialSignInPort & SessionPort;
export type AuthenticationProvider = AuthenticationGateway & RegistrationPort & PasswordRecoveryPort;

export class AuthenticationService {
  constructor(private readonly gateway: AuthenticationGateway) {}

  signIn(command: SignInCommand): Promise<AuthenticatedSession> {
    const email = normalizeEmail(command.email);
    if (!email || !command.password || command.password.length > 1024) {
      throw new AuthenticationFailure("INVALID_INPUT", "Ingresa un correo y una contraseña válidos.");
    }
    return this.gateway.signIn({ email, password: command.password });
  }

  restoreSession(): Promise<AuthenticatedSession | null> {
    return this.gateway.restoreSession();
  }

  signOut(): Promise<void> {
    return this.gateway.signOut();
  }

  getAccessToken(): Promise<string | null> {
    return this.gateway.getAccessToken();
  }
}

/** Adapter-facing signal that the current access token was rejected. */
export class AccessTokenRejectedFailure extends Error {
  constructor() {
    super("The access token was rejected.");
    this.name = "AccessTokenRejectedFailure";
  }
}

export type SessionExpiredSubscriber = (failure: AuthenticationFailure) => void;

/** Coordinates token renewal for every authenticated native operation. */
export class NativeSessionRefreshCoordinator {
  private refreshFlight: Promise<RefreshedAuthenticatedSession> | null = null;
  private expirationFlight: Promise<AuthenticationFailure> | null = null;
  private readonly subscribers = new Set<SessionExpiredSubscriber>();

  constructor(private readonly gateway: AuthenticationGateway) {}

  subscribeSessionExpired(subscriber: SessionExpiredSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => { this.subscribers.delete(subscriber); };
  }

  markAuthenticated(): void {
    this.expirationFlight = null;
  }

  async execute<T>(operation: (accessToken: string) => Promise<T>): Promise<T> {
    const accessToken = await this.gateway.getAccessToken();
    if (!accessToken) throw await this.expire();
    try {
      return await operation(accessToken);
    } catch (cause: unknown) {
      if (!(cause instanceof AccessTokenRejectedFailure)) throw cause;
    }

    const refreshed = await this.refresh();
    try {
      return await operation(refreshed.credentials.accessToken);
    } catch (cause: unknown) {
      if (!(cause instanceof AccessTokenRejectedFailure)) throw cause;
      throw await this.expire(cause);
    }
  }

  private refresh(): Promise<RefreshedAuthenticatedSession> {
    if (this.refreshFlight) return this.refreshFlight;
    const flight = this.gateway.refreshSession().catch(async (cause: unknown) => {
      if (cause instanceof AuthenticationFailure && cause.code === "SESSION_EXPIRED") {
        throw await this.expire(cause);
      }
      throw cause;
    }).finally(() => {
      if (this.refreshFlight === flight) this.refreshFlight = null;
    });
    this.refreshFlight = flight;
    return flight;
  }

  private expire(cause?: unknown): Promise<AuthenticationFailure> {
    if (this.expirationFlight) return this.expirationFlight;
    const failure = cause instanceof AuthenticationFailure && cause.code === "SESSION_EXPIRED"
      ? cause
      : new AuthenticationFailure("SESSION_EXPIRED", "La sesión expiró. Inicia sesión nuevamente.", { cause });
    const flight = this.gateway.clearSession()
      .catch(() => undefined)
      .then(() => {
        for (const subscriber of this.subscribers) subscriber(failure);
        return failure;
      });
    this.expirationFlight = flight;
    return flight;
  }
}

export class RegistrationService {
  constructor(private readonly registration: RegistrationPort) {}

  async register(command: RegisterCredentialsCommand): Promise<{ readonly email: string }> {
    const email = requireEmail(command.email);
    assertPasswordAccepted(command.password);
    await this.registration.register({ email, password: command.password });
    return { email };
  }

  verifyCode(command: VerifyRegistrationCodeCommand): Promise<AuthenticatedSession> {
    return this.registration.verifyRegistrationCode({
      email: requireEmail(command.email),
      code: requireVerificationCode(command.code),
    });
  }

  resendCode(email: string): Promise<void> {
    return this.registration.resendRegistrationCode(requireEmail(email));
  }
}

export class PasswordRecoveryService {
  private verifiedEmail: string | undefined;

  constructor(private readonly recovery: PasswordRecoveryPort) {}

  async request(command: RequestPasswordRecoveryCommand): Promise<{ readonly email: string }> {
    const email = requireEmail(command.email);
    this.verifiedEmail = undefined;
    await this.recovery.requestPasswordRecovery(email);
    return { email };
  }

  async verifyCode(command: VerifyPasswordRecoveryCodeCommand): Promise<{ readonly email: string }> {
    const email = requireEmail(command.email);
    await this.recovery.verifyPasswordRecoveryCode({ email, code: requireVerificationCode(command.code) });
    this.verifiedEmail = email;
    return { email };
  }

  async complete(command: CompletePasswordRecoveryCommand): Promise<void> {
    if (!this.verifiedEmail) {
      throw new AuthenticationFailure("RECOVERY_NOT_VERIFIED", "Verifica el código antes de cambiar la contraseña.");
    }
    assertPasswordAccepted(command.password);
    await this.recovery.completePasswordRecovery(command.password);
    this.verifiedEmail = undefined;
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function requireEmail(value: string): string {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new AuthenticationFailure("INVALID_INPUT", "Ingresa un correo válido.");
  }
  return email;
}

function requireVerificationCode(value: string): string {
  const code = value.replace(/\D/g, "");
  if (code.length !== authenticationCodeLength) {
    throw new AuthenticationFailure("INVALID_INPUT", `El código debe tener ${authenticationCodeLength} dígitos.`);
  }
  return code;
}
