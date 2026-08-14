import {
  AuthenticationService,
  PasswordRecoveryService,
  RegistrationService,
  type AuthenticationProvider,
} from "@kontave/auth-application";
import { AuthenticationFailure, type AuthenticatedSession } from "@kontave/auth-domain";
import type { BrowserWindow } from "electron";
import {
  DESKTOP_IPC,
  type DesktopAuthState,
  type DesktopEmailCodeCommand,
  type DesktopEmailCommand,
  type DesktopEmailPasswordCommand,
  type DesktopPasswordCommand,
  type DesktopPendingEmail,
} from "../../shared/desktop-api.js";

export class DesktopAuthController {
  private readonly authentication: AuthenticationService;
  private readonly registration: RegistrationService;
  private readonly recovery: PasswordRecoveryService;
  private state: DesktopAuthState = { status: "loading" };

  constructor(provider: AuthenticationProvider, private readonly getWindow: () => BrowserWindow | undefined) {
    this.authentication = new AuthenticationService(provider);
    this.registration = new RegistrationService(provider);
    this.recovery = new PasswordRecoveryService(provider);
  }

  getState(): DesktopAuthState { return this.state; }

  async initialize(): Promise<DesktopAuthState> {
    const session = await this.authentication.restoreSession();
    return this.update(session ? mapSession(session) : { status: "anonymous" });
  }

  async signIn(input: unknown): Promise<DesktopAuthState> {
    return this.update(mapSession(await this.authentication.signIn(readEmailPassword(input))));
  }

  register(input: unknown): Promise<DesktopPendingEmail> {
    return this.registration.register(readEmailPassword(input));
  }

  async verifyRegistration(input: unknown): Promise<DesktopAuthState> {
    return this.update(mapSession(await this.registration.verifyCode(readEmailCode(input))));
  }

  async resendRegistration(input: unknown): Promise<null> {
    await this.registration.resendCode(readEmail(input).email);
    return null;
  }

  requestPasswordRecovery(input: unknown): Promise<DesktopPendingEmail> {
    return this.recovery.request(readEmail(input));
  }

  verifyPasswordRecovery(input: unknown): Promise<DesktopPendingEmail> {
    return this.recovery.verifyCode(readEmailCode(input));
  }

  async completePasswordRecovery(input: unknown): Promise<DesktopAuthState> {
    await this.recovery.complete(readPassword(input));
    return this.update({ status: "anonymous" });
  }

  async signOut(): Promise<DesktopAuthState> {
    await this.authentication.signOut();
    return this.update({ status: "anonymous" });
  }

  private update(state: DesktopAuthState): DesktopAuthState {
    this.state = state;
    this.getWindow()?.webContents.send(DESKTOP_IPC.authStateChanged, state);
    return state;
  }
}

function mapSession(session: AuthenticatedSession): DesktopAuthState {
  return { status: "authenticated", user: { id: session.identity.userId, email: session.identity.email } };
}

function readEmailPassword(input: unknown): DesktopEmailPasswordCommand {
  const candidate = readRecord(input);
  return { email: readBoundedString(candidate, "email", 254), password: readBoundedString(candidate, "password", 1024) };
}

function readEmailCode(input: unknown): DesktopEmailCodeCommand {
  const candidate = readRecord(input);
  return { email: readBoundedString(candidate, "email", 254), code: readBoundedString(candidate, "code", 64) };
}

function readEmail(input: unknown): DesktopEmailCommand {
  return { email: readBoundedString(readRecord(input), "email", 254) };
}

function readPassword(input: unknown): DesktopPasswordCommand {
  return { password: readBoundedString(readRecord(input), "password", 1024) };
}

function readRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") throw invalidRequest();
  return input as Record<string, unknown>;
}

function readBoundedString(input: Record<string, unknown>, field: string, maximumLength: number): string {
  const value = input[field];
  if (typeof value !== "string" || value.length > maximumLength) throw invalidRequest();
  return value;
}

function invalidRequest(): AuthenticationFailure {
  return new AuthenticationFailure("INVALID_INPUT", "Solicitud de autenticación inválida.");
}
