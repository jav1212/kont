import {
  ChangePassword,
  ListAuthenticatedSessions,
  RevokeAuthenticatedSession,
  RevokeOtherAuthenticatedSessions,
} from "@kontave/auth-application";
import { createSupabaseCredentialSecurity, createSupabaseNativeSessionRegistry } from "@kontave/auth-supabase";

export function createNativeSecurityActions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) throw new Error("Native security is not configured.");

  const registry = createSupabaseNativeSessionRegistry({ url, serviceRoleKey });
  return {
    list: new ListAuthenticatedSessions(registry),
    revoke: new RevokeAuthenticatedSession(registry),
    revokeOthers: new RevokeOtherAuthenticatedSessions(registry),
    changePassword: new ChangePassword(createSupabaseCredentialSecurity({ url, anonKey }), registry),
  };
}
