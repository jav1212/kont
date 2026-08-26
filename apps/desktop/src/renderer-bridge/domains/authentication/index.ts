import type { AuthenticationFailureCode } from "@kontave/auth/domain";

/** Minimal authenticated identity exposed to the renderer. */
export interface DesktopAuthUser {
  readonly id: string;
  readonly email: string | null;
}

/** Renderer-safe authenticated session state. */
export type DesktopAuthState =
  | { readonly status: "loading" }
  | { readonly status: "anonymous" }
  | { readonly status: "authenticated"; readonly user: DesktopAuthUser };

/** Expected authentication failure exposed across IPC. */
export interface DesktopAuthError {
  readonly code: AuthenticationFailureCode | "UNEXPECTED";
  readonly message: string;
}

/** Result returned by authentication commands. */
export type DesktopAuthResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DesktopAuthError };

/** Credentials supplied to registration and sign-in. */
export interface DesktopEmailPasswordCommand {
  readonly email: string;
  readonly password: string;
}

/** Email verification command. */
export interface DesktopEmailCodeCommand {
  readonly email: string;
  readonly code: string;
}

/** Email-only authentication command. */
export interface DesktopEmailCommand {
  readonly email: string;
}

/** Password supplied when completing recovery. */
export interface DesktopPasswordCommand {
  readonly password: string;
}

/** Email awaiting completion of a verification workflow. */
export interface DesktopPendingEmail {
  readonly email: string;
}

/** Authentication capability exposed by preload. */
export interface DesktopAuthenticationApi {
  getState(): Promise<DesktopAuthState>;
  signIn(
    command: DesktopEmailPasswordCommand,
  ): Promise<DesktopAuthResult<DesktopAuthState>>;
  register(
    command: DesktopEmailPasswordCommand,
  ): Promise<DesktopAuthResult<DesktopPendingEmail>>;
  verifyRegistration(
    command: DesktopEmailCodeCommand,
  ): Promise<DesktopAuthResult<DesktopAuthState>>;
  resendRegistration(
    command: DesktopEmailCommand,
  ): Promise<DesktopAuthResult<null>>;
  requestPasswordRecovery(
    command: DesktopEmailCommand,
  ): Promise<DesktopAuthResult<DesktopPendingEmail>>;
  verifyPasswordRecovery(
    command: DesktopEmailCodeCommand,
  ): Promise<DesktopAuthResult<DesktopPendingEmail>>;
  completePasswordRecovery(
    command: DesktopPasswordCommand,
  ): Promise<DesktopAuthResult<DesktopAuthState>>;
  signOut(): Promise<DesktopAuthResult<DesktopAuthState>>;
  subscribe(listener: (state: DesktopAuthState) => void): () => void;
}
