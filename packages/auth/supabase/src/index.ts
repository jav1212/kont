import { createClient, type AuthError, type Session, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";
import type {
  AccessTokenVerifier,
  AuthenticationProvider,
  RegisterCredentialsCommand,
  SignInCommand,
  VerifyPasswordRecoveryCodeCommand,
  VerifyRegistrationCodeCommand,
  CredentialSecurityPort,
  NativeSessionRegistry,
} from "@kontave/auth-application";
import { AuthenticationFailure, authenticatedSessionId, type AuthenticatedIdentity, type AuthenticatedSession, type NativeSessionClient, type RefreshedAuthenticatedSession } from "@kontave/auth-domain";

export interface SupabaseAuthConfiguration {
  readonly url: string;
  readonly anonKey: string;
}

export function createSupabaseAuthenticationGateway(
  configuration: SupabaseAuthConfiguration,
  storage: SupportedStorage,
): AuthenticationProvider {
  const client = createClient(configuration.url, configuration.anonKey, {
    auth: { storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabaseAuthenticationGateway(client);
}

export function createSupabaseAccessTokenVerifier(configuration: SupabaseAuthConfiguration): AccessTokenVerifier {
  const client = createClient(configuration.url, configuration.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabaseAccessTokenVerifier(client);
}

export function createSupabaseNativeSessionRegistry(configuration:{readonly url:string;readonly serviceRoleKey:string}):NativeSessionRegistry{return new SupabaseNativeSessionRegistry(createClient(configuration.url,configuration.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}))}
export function createSupabaseCredentialSecurity(configuration:SupabaseAuthConfiguration):CredentialSecurityPort{return new SupabaseCredentialSecurity(configuration)}

class SupabaseCredentialSecurity implements CredentialSecurityPort{
 constructor(private readonly configuration:SupabaseAuthConfiguration){}
 async changePassword(accessToken:string,newPassword:string){const client=createClient(this.configuration.url,this.configuration.anonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${accessToken}`}}});const{error}=await client.auth.updateUser({password:newPassword});if(error)throw mapProviderFailure(error,"PROVIDER_UNAVAILABLE","No se pudo cambiar la contraseña.")}
}
class SupabaseNativeSessionRegistry implements NativeSessionRegistry{
 constructor(private readonly client:SupabaseClient){}
 async observe(input:Parameters<NativeSessionRegistry["observe"]>[0]){const{error}=await this.client.rpc("observe_native_device_session",{p_session_id:input.id,p_user_id:input.userId,p_client:input.client,p_device_name:input.deviceName,p_operating_system:input.operatingSystem});if(error)throw sessionFailure(error)}
 async list(userId:string){const{data,error}=await this.client.rpc("list_native_device_sessions",{p_user_id:userId});if(error)throw sessionFailure(error);return((data??[])as Record<string,unknown>[]).map(row=>({id:authenticatedSessionId(String(row.id)),userId:String(row.user_id),client:readClient(row.client),deviceName:nullable(row.device_name),operatingSystem:nullable(row.operating_system),createdAt:String(row.created_at),lastSeenAt:String(row.last_seen_at),revokedAt:nullable(row.revoked_at)}))}
 async revoke(input:Parameters<NativeSessionRegistry["revoke"]>[0]){const{error}=await this.client.rpc("revoke_native_device_session",{p_user_id:input.userId,p_session_id:input.sessionId});if(error)throw sessionFailure(error)}
 async revokeOthers(input:Parameters<NativeSessionRegistry["revokeOthers"]>[0]){const{error}=await this.client.rpc("revoke_other_native_device_sessions",{p_user_id:input.userId,p_current_session_id:input.currentSessionId});if(error)throw sessionFailure(error)}
}
function nullable(value:unknown){return value===null||value===undefined?null:String(value)}
function readClient(value:unknown):NativeSessionClient{if(value==="web"||value==="desktop"||value==="mobile")return value;throw new AuthenticationFailure("PROVIDER_UNAVAILABLE","La metadata de sesión no es válida.")}
function sessionFailure(error:{message?:string}){const message=error.message??"";if(message.includes("SESSION_REVOKED"))return new AuthenticationFailure("SESSION_REVOKED","La sesión fue revocada.");if(message.includes("SESSION_NOT_FOUND"))return new AuthenticationFailure("SESSION_NOT_FOUND","La sesión no existe.");return new AuthenticationFailure("PROVIDER_UNAVAILABLE","No se pudo administrar la sesión.",{cause:error})}

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

  async refreshSession(): Promise<RefreshedAuthenticatedSession> {
    const { data: current, error: readError } = await this.client.auth.getSession();
    if (readError) {
      throw new AuthenticationFailure("PROVIDER_UNAVAILABLE", "No se pudo leer la sesión para renovarla.", { cause: readError });
    }
    const refreshToken = current.session?.refresh_token;
    if (!refreshToken) return this.expiredSession();

    const { data, error } = await this.client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session?.access_token || !data.session.refresh_token) {
      if (!error || isInvalidRefreshFailure(error)) return this.expiredSession(error ?? undefined);
      throw new AuthenticationFailure("PROVIDER_UNAVAILABLE", "No se pudo renovar la sesión.", { cause: error });
    }
    // Supabase persists refreshSession() results through the configured
    // SupportedStorage, which is DesktopSecureStorage in the native client.
    return {
      session: mapSession(data.session),
      credentials: { accessToken: data.session.access_token, refreshToken: data.session.refresh_token },
    };
  }

  async clearSession(): Promise<void> {
    const { error } = await this.client.auth.signOut({ scope: "local" });
    if (error) throw new AuthenticationFailure("PROVIDER_UNAVAILABLE", "No se pudo eliminar la sesión local.", { cause: error });
  }

  private async expiredSession(cause?: unknown): Promise<never> {
    try { await this.clearSession(); } catch { /* Expiration remains authoritative even if cleanup fails. */ }
    throw new AuthenticationFailure("SESSION_EXPIRED", "La sesión expiró. Inicia sesión nuevamente.", { cause });
  }
}

function isInvalidRefreshFailure(error: AuthError): boolean {
  return error.status === 400 || error.status === 401
    || error.code === "refresh_token_not_found"
    || error.code === "refresh_token_already_used"
    || error.code === "invalid_refresh_token"
    || error.code === "session_not_found";
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
    return { userId: data.user.id, email: data.user.email ?? null, sessionId: readSessionId(accessToken) };
  }
}

function readSessionId(accessToken:string):string|null{try{const payload=accessToken.split(".")[1];if(!payload)return null;const normalized=payload.replaceAll("-","+").replaceAll("_","/");const decoded=JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,"=")))as{session_id?:unknown};return typeof decoded.session_id==="string"?decoded.session_id:null}catch{return null}}

function mapSession(session: Session): AuthenticatedSession {
  return {
    identity: { userId: session.user.id, email: session.user.email ?? null },
    expiresAt: session.expires_at ?? null,
  };
}
