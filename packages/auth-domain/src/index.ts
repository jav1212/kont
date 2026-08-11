export interface AuthenticatedIdentity {
  readonly userId: string;
  readonly email: string | null;
}

export interface AuthenticatedSession {
  readonly identity: AuthenticatedIdentity;
  readonly expiresAt: number | null;
}

export type AuthenticationFailureCode =
  | "INVALID_CREDENTIALS"
  | "INVALID_INPUT"
  | "SESSION_EXPIRED"
  | "PROVIDER_UNAVAILABLE";

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
