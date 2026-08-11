import { createClient, type Session, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";
import type { AccessTokenVerifier, AuthenticationGateway, SignInCommand } from "@kontave/auth-application";
import { AuthenticationFailure, type AuthenticatedIdentity, type AuthenticatedSession } from "@kontave/auth-domain";

export interface SupabaseAuthConfiguration {
  readonly url: string;
  readonly anonKey: string;
}

export function createSupabaseAuthenticationGateway(
  configuration: SupabaseAuthConfiguration,
  storage: SupportedStorage,
): AuthenticationGateway {
  const client = createClient(configuration.url, configuration.anonKey, {
    auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return new SupabaseAuthenticationGateway(client);
}

export function createSupabaseAccessTokenVerifier(configuration: SupabaseAuthConfiguration): AccessTokenVerifier {
  const client = createClient(configuration.url, configuration.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabaseAccessTokenVerifier(client);
}

class SupabaseAuthenticationGateway implements AuthenticationGateway {
  constructor(private readonly client: SupabaseClient) {}

  async signIn(command: SignInCommand): Promise<AuthenticatedSession> {
    const { data, error } = await this.client.auth.signInWithPassword(command);
    if (error || !data.session) {
      throw new AuthenticationFailure("INVALID_CREDENTIALS", "El correo o la contraseña son incorrectos.", { cause: error });
    }
    return mapSession(data.session);
  }

  async restoreSession(): Promise<AuthenticatedSession | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw new AuthenticationFailure("PROVIDER_UNAVAILABLE", "No se pudo restaurar la sesión.", { cause: error });
    return data.session ? mapSession(data.session) : null;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw new AuthenticationFailure("PROVIDER_UNAVAILABLE", "No se pudo cerrar la sesión.", { cause: error });
  }

  async getAccessToken(): Promise<string | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw new AuthenticationFailure("PROVIDER_UNAVAILABLE", "No se pudo obtener la sesión.", { cause: error });
    return data.session?.access_token ?? null;
  }
}

class SupabaseAccessTokenVerifier implements AccessTokenVerifier {
  constructor(private readonly client: SupabaseClient) {}

  async verify(accessToken: string): Promise<AuthenticatedIdentity | null> {
    const { data, error } = await this.client.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return { userId: data.user.id, email: data.user.email ?? null };
  }
}

function mapSession(session: Session): AuthenticatedSession {
  return {
    identity: { userId: session.user.id, email: session.user.email ?? null },
    expiresAt: session.expires_at ?? null,
  };
}
