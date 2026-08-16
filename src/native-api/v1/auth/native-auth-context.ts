import { createSupabaseAccessTokenVerifier } from "@kontave/auth-supabase";
import { AuthenticationFailure, authenticatedSessionId, type AuthenticatedIdentity } from "@kontave/auth-domain";
import { ObserveNativeSession } from "@kontave/auth-application";
import { createSupabaseNativeSessionRegistry } from "@kontave/auth-supabase";

export async function authenticateNativeRequest(request: Request): Promise<AuthenticatedIdentity | null> {
  const accessToken = readBearerToken(request.headers.get("authorization"));
  if (!accessToken) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Native authentication is not configured.");
  const identity = await createSupabaseAccessTokenVerifier({ url, anonKey }).verify(accessToken);
  if (!identity?.sessionId) return null;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Native session registry is not configured.");
  const clientHeader = request.headers.get("x-kontave-client");
  const client = clientHeader === "mobile" || clientHeader === "web" ? clientHeader : "desktop";
  try {
    await new ObserveNativeSession(createSupabaseNativeSessionRegistry({ url, serviceRoleKey })).execute({
      id: authenticatedSessionId(identity.sessionId),
      userId: identity.userId,
      client,
      deviceName: readMetadata(request.headers.get("x-kontave-device-name")),
      operatingSystem: readMetadata(request.headers.get("x-kontave-operating-system")),
    });
  } catch (cause) {
    if (
      cause instanceof AuthenticationFailure
      && (cause.code === "SESSION_NOT_FOUND" || cause.code === "SESSION_REVOKED")
    ) {
      return null;
    }
    throw cause;
  }
  return identity;
}

function readMetadata(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 160) : null;
}

export function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  return /^Bearer ([^\s]+)$/i.exec(header)?.[1] ?? null;
}
