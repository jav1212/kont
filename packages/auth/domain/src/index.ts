export interface AuthenticatedIdentity {
  readonly userId: string;
  readonly email: string | null;
  readonly sessionId?: string | null;
}

declare const authenticatedSessionIdBrand: unique symbol;
export type AuthenticatedSessionId = string & { readonly [authenticatedSessionIdBrand]: true };
export type NativeSessionClient = "web" | "desktop" | "mobile";
export interface AuthenticatedDeviceSession {
  readonly id: AuthenticatedSessionId;
  readonly userId: string;
  readonly client: NativeSessionClient;
  readonly deviceName: string | null;
  readonly operatingSystem: string | null;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly current: boolean;
  readonly revokedAt: string | null;
}
export function authenticatedSessionId(value: string): AuthenticatedSessionId {
  const normalized = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new AuthenticationFailure("INVALID_INPUT", "El identificador de sesión no es válido.");
  }
  return normalized as AuthenticatedSessionId;
}

export interface AuthenticatedSession {
  readonly identity: AuthenticatedIdentity;
  readonly expiresAt: number | null;
}

export interface AuthenticationCredentials {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface RefreshedAuthenticatedSession {
  readonly session: AuthenticatedSession;
  readonly credentials: AuthenticationCredentials;
}

export type AuthenticationFailureCode =
  | "EMAIL_NOT_VERIFIED"
  | "IDENTITY_ALREADY_EXISTS"
  | "INVALID_CREDENTIALS"
  | "INVALID_INPUT"
  | "PASSWORD_POLICY_VIOLATION"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "RECOVERY_NOT_VERIFIED"
  | "SESSION_EXPIRED"
  | "SESSION_NOT_FOUND"
  | "SESSION_REVOKED"
  | "VERIFICATION_CODE_INVALID";

export class AuthenticationFailure extends Error {
  constructor(
    readonly code: AuthenticationFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AuthenticationFailure";
  }
}

export const passwordPolicy = {
  minimumLength: 8,
  maximumLength: 1024,
} as const;

export interface PasswordRequirement {
  readonly code: "minimum-length" | "lowercase" | "uppercase" | "number" | "special-character";
  readonly label: string;
  readonly satisfied: boolean;
}

export function evaluatePassword(password: string): readonly PasswordRequirement[] {
  return [
    { code: "minimum-length", label: `${passwordPolicy.minimumLength}+ caracteres`, satisfied: password.length >= passwordPolicy.minimumLength },
    { code: "lowercase", label: "Una letra minúscula", satisfied: /[a-z]/.test(password) },
    { code: "uppercase", label: "Una letra mayúscula", satisfied: /[A-Z]/.test(password) },
    { code: "number", label: "Un número", satisfied: /[0-9]/.test(password) },
    { code: "special-character", label: "Un carácter especial", satisfied: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function assertPasswordAccepted(password: string): void {
  if (password.length > passwordPolicy.maximumLength || evaluatePassword(password).some((requirement) => !requirement.satisfied)) {
    throw new AuthenticationFailure(
      "PASSWORD_POLICY_VIOLATION",
      "La contraseña no cumple los requisitos de seguridad.",
    );
  }
}
