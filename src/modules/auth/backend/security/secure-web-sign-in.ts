import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AuthenticationFailure,
  EvaluateAccountAuthentication,
  SecureSignIn,
} from "@kontave/auth";
import {
  createSupabaseAccountIdentityResolver,
  createSupabaseAccountSecurityRepository,
  createSupabaseCredentialSecurityPolicyRepository,
} from "@kontave/auth/supabase";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

type PendingCookie = {
  readonly name: string;
  readonly value: string;
  readonly options: CookieOptions;
};

/** The only result a password sign-in route needs to expose. */
export interface SecureWebSignInResult {
  /** Authenticated identity approved by every active organization policy. */
  readonly user: { readonly id: string; readonly email: string };
  /** Cookies produced by Supabase, withheld until the policy decision commits. */
  readonly cookies: readonly PendingCookie[];
}

/**
 * Authenticates a Web password sign-in without exposing the provider session until
 * every active organization membership has accepted its persisted policy.
 *
 * @param input - Browser cookies and untrusted credentials received by the route.
 * @returns The approved identity and the deferred SSR cookies.
 * @throws {AuthenticationFailure} When credentials, account policy, or auth infrastructure denies the sign-in.
 */
export async function secureWebSignIn(input: {
  readonly requestCookies: readonly {
    readonly name: string;
    readonly value: string;
  }[];
  readonly email: string;
  readonly password: string;
}): Promise<SecureWebSignInResult> {
  const url = requireEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const pendingCookies: PendingCookie[] = [];
  const auth = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...input.requestCookies],
      setAll: (cookies) => replacePendingCookies(pendingCookies, cookies),
    },
  });
  const service = new ServerSupabaseSource().instance;
  const configuration = { url, serviceRoleKey };
  const policies =
    createSupabaseCredentialSecurityPolicyRepository(configuration);
  const attempts = new EvaluateAccountAuthentication(
    createSupabaseAccountSecurityRepository(configuration),
  );
  const identities = createSupabaseAccountIdentityResolver(configuration);

  try {
    const session = await signInWithDeferredCookies(
      auth,
      input.email,
      input.password,
    );
    if (await isPlatformAdministrator(service, session.identity.userId)) {
      throw invalidCredentials();
    }
    const organizationIds = await activeOrganizationsForUser(
      service,
      session.identity.userId,
    );
    await evaluateActiveOrganizationPolicies(
      organizationIds,
      async (organizationId) => {
        const signIn = new SecureSignIn(
          { signIn: async () => session },
          { clearSession: () => clearDeferredSession(auth, pendingCookies) },
          policies,
          attempts,
          { now: () => new Date().toISOString() },
          identities,
        );
        await signIn.execute({
          organizationId,
          email: input.email,
          password: input.password,
        });
      },
    );
    const email = session.identity.email;
    if (!email) throw providerUnavailable();
    return {
      user: { id: session.identity.userId, email },
      cookies: pendingCookies,
    };
  } catch (error) {
    if (isInvalidCredentialFailure(error)) {
      await recordInvalidCredentials(
        input.email,
        policies,
        attempts,
        identities,
        service,
      ).catch(() => undefined);
    }
    await clearDeferredSession(auth, pendingCookies).catch(() => undefined);
    throw error;
  }
}

/**
 * Applies a deferred Supabase cookie set to an HTTP response.
 * @param response - Response that is about to leave the trusted server boundary.
 * @param cookies - Cookies produced after a successful account-policy decision.
 * @returns Nothing.
 */
export function applySecureWebSessionCookies(
  response: {
    cookies: { set(name: string, value: string, options: CookieOptions): void };
  },
  cookies: readonly PendingCookie[],
): void {
  for (const cookie of cookies)
    response.cookies.set(cookie.name, cookie.value, cookie.options);
}

/**
 * Evaluates each server-derived active organization without accepting a browser-selected scope.
 * @param organizationIds - Active organization memberships resolved by the trusted server.
 * @param evaluate - One persisted policy evaluation for an organization.
 * @returns Nothing after every organization allows the session.
 * @throws The first policy error, so a caller can discard deferred credentials.
 */
export async function evaluateActiveOrganizationPolicies(
  organizationIds: readonly string[],
  evaluate: (organizationId: string) => Promise<void>,
): Promise<void> {
  for (const organizationId of organizationIds) await evaluate(organizationId);
}

async function signInWithDeferredCookies(
  client: SupabaseClient,
  email: string,
  password: string,
) {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session || !data.user) {
    if (error?.code === "invalid_credentials") throw invalidCredentials();
    throw providerUnavailable();
  }
  return {
    identity: { userId: data.user.id, email: data.user.email ?? null },
    expiresAt: data.session.expires_at ?? null,
  };
}

async function activeOrganizationsForUser(
  service: SupabaseClient,
  userId: string,
): Promise<readonly string[]> {
  const { data: memberships, error: membershipsError } = await service
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active");
  if (membershipsError) throw providerUnavailable();
  const organizationIds = [
    ...new Set(
      (memberships ?? [])
        .map((membership) => membership.organization_id)
        .filter(
          (organizationId): organizationId is string =>
            typeof organizationId === "string",
        ),
    ),
  ];
  if (organizationIds.length === 0) return [];
  const { data: organizations, error: organizationsError } = await service
    .from("organizations")
    .select("id")
    .in("id", organizationIds)
    .eq("status", "active");
  if (organizationsError) throw providerUnavailable();
  return (organizations ?? [])
    .map((organization) => organization.id)
    .filter(
      (organizationId): organizationId is string =>
        typeof organizationId === "string",
    );
}

async function recordInvalidCredentials(
  email: string,
  policies: ReturnType<typeof createSupabaseCredentialSecurityPolicyRepository>,
  attempts: EvaluateAccountAuthentication,
  identities: ReturnType<typeof createSupabaseAccountIdentityResolver>,
  service: SupabaseClient,
): Promise<void> {
  const { data, error } = await service.rpc(
    "account_security_list_active_organizations_for_email",
    {
      p_email: email.trim().toLowerCase(),
    },
  );
  if (error || !Array.isArray(data)) return;
  for (const organizationId of data) {
    if (typeof organizationId !== "string") continue;
    const identity = await identities.resolve({
      organizationId,
      email: email.trim().toLowerCase(),
    });
    if (!identity) continue;
    const stored = await policies.get(organizationId);
    await attempts.execute({
      organizationId,
      userId: identity.userId,
      policy: stored.policy,
      policyVersion: stored.version,
      occurredAt: new Date().toISOString(),
      credentialsValid: false,
    });
  }
}

async function isPlatformAdministrator(
  service: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await service
    .from("admin_users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw providerUnavailable();
  return data !== null;
}

async function clearDeferredSession(
  client: SupabaseClient,
  pendingCookies: PendingCookie[],
): Promise<void> {
  await client.auth.signOut({ scope: "local" });
  pendingCookies.length = 0;
}

function replacePendingCookies(
  target: PendingCookie[],
  source: readonly PendingCookie[],
): void {
  for (const cookie of source) {
    const index = target.findIndex((current) => current.name === cookie.name);
    const next = {
      name: cookie.name,
      value: cookie.value,
      options: cookie.options,
    };
    if (index === -1) target.push(next);
    else target[index] = next;
  }
}

function requireEnvironment(
  name:
    | "NEXT_PUBLIC_SUPABASE_URL"
    | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    | "SUPABASE_SERVICE_ROLE_KEY",
): string {
  const value = process.env[name];
  if (!value) throw providerUnavailable();
  return value;
}

function isInvalidCredentialFailure(error: unknown): boolean {
  return (
    error instanceof AuthenticationFailure &&
    error.code === "INVALID_CREDENTIALS"
  );
}

function invalidCredentials(): AuthenticationFailure {
  return new AuthenticationFailure(
    "INVALID_CREDENTIALS",
    "Correo o contraseña incorrectos.",
  );
}

function providerUnavailable(): AuthenticationFailure {
  return new AuthenticationFailure(
    "PROVIDER_UNAVAILABLE",
    "No se pudo verificar la autenticación.",
  );
}
