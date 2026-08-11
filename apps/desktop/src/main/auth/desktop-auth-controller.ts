import { AuthenticationService, type AuthenticationGateway } from "@kontave/auth-application";
import type { AuthenticatedSession } from "@kontave/auth-domain";
import type { BrowserWindow } from "electron";
import { DESKTOP_IPC, type DesktopAuthState, type DesktopSignInCommand } from "../../shared/desktop-api.js";

export class DesktopAuthController {
  private readonly service: AuthenticationService;
  private state: DesktopAuthState = { status: "loading" };

  constructor(gateway: AuthenticationGateway, private readonly getWindow: () => BrowserWindow | undefined) {
    this.service = new AuthenticationService(gateway);
  }

  getState(): DesktopAuthState { return this.state; }

  async initialize(): Promise<DesktopAuthState> {
    const session = await this.service.restoreSession();
    return this.update(session ? mapSession(session) : { status: "anonymous" });
  }

  async signIn(input: unknown): Promise<DesktopAuthState> {
    return this.update(mapSession(await this.service.signIn(validateSignInCommand(input))));
  }

  async signOut(): Promise<DesktopAuthState> {
    await this.service.signOut();
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

function validateSignInCommand(input: unknown): DesktopSignInCommand {
  if (!input || typeof input !== "object") throw new Error("Solicitud de autenticación inválida.");
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.email !== "string" || typeof candidate.password !== "string") {
    throw new Error("Solicitud de autenticación inválida.");
  }
  if (candidate.email.length > 254 || candidate.password.length > 1024) throw new Error("Credenciales inválidas.");
  return { email: candidate.email, password: candidate.password };
}
