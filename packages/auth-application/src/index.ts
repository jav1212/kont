import { AuthenticationFailure, type AuthenticatedIdentity, type AuthenticatedSession } from "@kontave/auth-domain";

export interface SignInCommand {
  readonly email: string;
  readonly password: string;
}

export interface AuthenticationGateway {
  signIn(command: SignInCommand): Promise<AuthenticatedSession>;
  restoreSession(): Promise<AuthenticatedSession | null>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string | null>;
}

export interface AccessTokenVerifier {
  verify(accessToken: string): Promise<AuthenticatedIdentity | null>;
}

export class AuthenticationService {
  constructor(private readonly gateway: AuthenticationGateway) {}

  signIn(command: SignInCommand): Promise<AuthenticatedSession> {
    const email = command.email.trim().toLowerCase();
    if (!email || !email.includes("@") || !command.password) {
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
}
