import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthenticationService, NativeSessionRefreshCoordinator, PasswordRecoveryService, RegistrationService, type AuthenticationProvider } from "@kontave/auth-application";
import { AuthenticationFailure, type AuthenticatedSession } from "@kontave/auth-domain";
import { createSupabaseAuthenticationGateway } from "@kontave/auth-supabase";
import Constants from "expo-constants";
import { MobileSecureStorage } from "./mobile-secure-storage";
import { MobileAuthenticatedRequest } from "./mobile-authenticated-request";

export type MobileAuthState =
  | { readonly status: "loading" }
  | { readonly status: "anonymous" }
  | { readonly status: "authenticated"; readonly user: { readonly id: string; readonly email: string | null } };

interface AuthContextValue {
  readonly state: MobileAuthState;
  readonly authenticatedFetch: (input: URL | string, init?: RequestInit) => Promise<Response>;
  readonly getAccessToken: () => Promise<string | null>;
  readonly signIn: (email: string, password: string) => Promise<void>;
  readonly register: (email: string, password: string) => Promise<void>;
  readonly verifyRegistration: (email: string, code: string) => Promise<void>;
  readonly resendRegistration: (email: string) => Promise<void>;
  readonly requestRecovery: (email: string) => Promise<void>;
  readonly verifyRecovery: (email: string, code: string) => Promise<void>;
  readonly completeRecovery: (password: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const provider = useMemo(() => createProvider(), []);
  const authentication = useMemo(() => new AuthenticationService(provider), [provider]);
  const registration = useMemo(() => new RegistrationService(provider), [provider]);
  const recovery = useMemo(() => new PasswordRecoveryService(provider), [provider]);
  const sessions = useMemo(() => new NativeSessionRefreshCoordinator(provider), [provider]);
  const authenticatedRequest = useMemo(() => new MobileAuthenticatedRequest(sessions), [sessions]);
  const [state, setState] = useState<MobileAuthState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    authentication.restoreSession().then((session) => {
      if (!active) return;
      if (session) sessions.markAuthenticated();
      setState(session ? mapSession(session) : { status: "anonymous" });
    })
      .catch(() => active && setState({ status: "anonymous" }));
    return () => { active = false; };
  }, [authentication, sessions]);

  useEffect(() => sessions.subscribeSessionExpired(() => setState({ status: "anonymous" })), [sessions]);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await authentication.signIn({ email, password });
    sessions.markAuthenticated();
    setState(mapSession(session));
  }, [authentication, sessions]);
  const register = useCallback(async (email: string, password: string) => { await registration.register({ email, password }); }, [registration]);
  const verifyRegistration = useCallback(async (email: string, code: string) => {
    const session = await registration.verifyCode({ email, code });
    sessions.markAuthenticated();
    setState(mapSession(session));
  }, [registration, sessions]);
  const resendRegistration = useCallback((email: string) => registration.resendCode(email), [registration]);
  const requestRecovery = useCallback(async (email: string) => { await recovery.request({ email }); }, [recovery]);
  const verifyRecovery = useCallback(async (email: string, code: string) => { await recovery.verifyCode({ email, code }); }, [recovery]);
  const completeRecovery = useCallback(async (password: string) => { await recovery.complete({ password }); setState({ status: "anonymous" }); }, [recovery]);
  const signOut = useCallback(async () => { await authentication.signOut(); setState({ status: "anonymous" }); }, [authentication]);
  const getAccessToken = useCallback(() => authentication.getAccessToken(), [authentication]);
  const authenticatedFetch = useCallback((input: URL | string, init?: RequestInit) => authenticatedRequest.fetch(input, init), [authenticatedRequest]);

  return <AuthContext.Provider value={{ state, authenticatedFetch, getAccessToken, signIn, register, verifyRegistration, resendRegistration, requestRecovery, verifyRecovery, completeRecovery, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe ejecutarse dentro de AuthProvider.");
  return value;
}

export function authErrorMessage(cause: unknown): string {
  return cause instanceof AuthenticationFailure ? cause.message : "Ocurrió un error inesperado. Intenta nuevamente.";
}

function createProvider(): AuthenticationProvider {
  const extra = Constants.expoConfig?.extra;
  const url = readConfiguration(extra?.supabaseUrl);
  const anonKey = readConfiguration(extra?.supabaseAnonKey);
  if (!url || !anonKey) throw new Error("No se encontraron NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en las variables globales.");
  const storage = new MobileSecureStorage();
  return createSupabaseAuthenticationGateway({ url, anonKey }, storage);
}

function readConfiguration(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

function mapSession(session: AuthenticatedSession): Extract<MobileAuthState, { status: "authenticated" }> {
  return { status: "authenticated", user: { id: session.identity.userId, email: session.identity.email } };
}
