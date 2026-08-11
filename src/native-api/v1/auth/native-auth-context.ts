import { createSupabaseAccessTokenVerifier } from "@kontave/auth-supabase";
import type { AuthenticatedIdentity } from "@kontave/auth-domain";

export async function authenticateNativeRequest(request: Request): Promise<AuthenticatedIdentity | null> {
  const accessToken = readBearerToken(request.headers.get("authorization"));
  if (!accessToken) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Native authentication is not configured.");
  return createSupabaseAccessTokenVerifier({ url, anonKey }).verify(accessToken);
}

export function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  return /^Bearer ([^\s]+)$/i.exec(header)?.[1] ?? null;
}
