import { createClient, type AuthError, type Session, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";
import type {
  AccessTokenVerifier,
  AuthenticationProvider,
  RegisterCredentialsCommand,
  SignInCommand,
  VerifyPasswordRecoveryCodeCommand,
  VerifyRegistrationCodeCommand,
} from "@kontave/auth-application";
import { AuthenticationFailure, type AuthenticatedIdentity, type AuthenticatedSession } from "@kontave/auth-domain";

export interface SupabaseAuthConfiguration {
  readonly url: string;
  readonly anonKey: string;
}

export function createSupabaseAuthenticationGateway(
  configuration: SupabaseAuthConfiguration,
  storage: SupportedStorage,
): AuthenticationProvider {
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

class SupabaseAuthenticationGateway implements AuthenticationProvider {
  constructor(private readonly client: SupabaseClient) {}

  async signIn(command: SignInCommand): Promise<AuthenticatedSession> {
    const { data, error } = await this.client.auth.signInWithPassword(command);
    if (error || !data.session) {
      throw mapProviderFailure(error, "INVALID_CREDENTIALS", "El correo o la contraseña son incorrectos.");
    }
    return mapSession(data.session);
  }

  async register(command: RegisterCredentialsCommand): Promise<void> {
    const { error } = await this.client.auth.signUp({ email: command.email, password: command.password });
    if (error) throw mapProviderFailure(error, "PROVIDER_UNAVAILABLE", "No se pudo crear la cuenta.");
  }

  async verifyRegistrationCode(command: VerifyRegistrationCodeCommand): Promise<AuthenticatedSession> {
    const { data, error } = await this.client.auth.verifyOtp({
      email: command.email,
      token: command.code,
      type: "signup",
    });
    if (error || !data.session) {
      throw mapProviderFailure(error, "VERIFICATION_CODE_INVALID", "El código es inválido o venció.");
    }
    return mapSession(data.session);
  }

  async resendRegistrationCode(email: string): Promise<void> {
    const { error } = await this.client.auth.resend({ type: "signup", email });
    if (error) throw mapProviderFailure(error, "PROVIDER_UNAVAILABLE", "No se pudo reenviar el código.");
  }

  async requestPasswordRecovery(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email);
    if (error) throw mapProviderFailure(error, "PROVIDER_UNAVAILABLE", "No se pudo enviar el código de recuperación.");
  }

  async verifyPasswordRecoveryCode(command: VerifyPasswordRecoveryCodeCommand): Promise<void> {
    const { data, error } = await this.client.auth.verifyOtp({
      email: command.email,
      token: command.code,
      type: "recovery",
    });
    if (error || !data.session) {
      throw mapProviderFailure(error, "VERIFICATION_CODE_INVALID", "El código es inválido o venció.");
    }
  }

  async completePasswordRecovery(password: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw mapProviderFailure(error, "PROVIDER_UNAVAILABLE", "No se pudo actualizar la contraseña.");
    const { error: signOutError } = await this.client.auth.signOut();
    if (signOutError) throw mapProviderFailure(signOutError, "PROVIDER_UNAVAILABLE", "La contraseña cambió, pero no se pudo cerrar la sesión.");
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

function mapProviderFailure(
  error: AuthError | null,
  fallbackCode: ConstructorParameters<typeof AuthenticationFailure>[0],
  fallbackMessage: string,
): AuthenticationFailure {
  const providerCode = error?.code;
  if (providerCode === "email_not_confirmed") {
    return new AuthenticationFailure("EMAIL_NOT_VERIFIED", "Confirma tu correo antes de iniciar sesión.", { cause: error });
  }
  if (providerCode === "user_already_exists" || providerCode === "email_exists") {
    return new AuthenticationFailure("IDENTITY_ALREADY_EXISTS", "Ya existe una cuenta con ese correo.", { cause: error });
  }
  if (providerCode === "weak_password") {
    return new AuthenticationFailure("PASSWORD_POLICY_VIOLATION", "La contraseña no cumple los requisitos de seguridad.", { cause: error });
  }
  if (providerCode === "otp_expired" || providerCode === "otp_disabled" || providerCode === "bad_code_verifier") {
    return new AuthenticationFailure("VERIFICATION_CODE_INVALID", "El código es inválido o venció.", { cause: error });
  }
  if (providerCode?.includes("rate_limit")) {
    return new AuthenticationFailure("RATE_LIMITED", "Espera unos minutos antes de intentarlo nuevamente.", { cause: error });
  }
  return new AuthenticationFailure(fallbackCode, fallbackMessage, { cause: error ?? undefined });
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
