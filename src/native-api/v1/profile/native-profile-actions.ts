import { GetCurrentProfile } from "@kontave/profile-application";
import { createSupabaseProfileDetailsReader } from "@kontave/profile-supabase";

export function createNativeProfileActions(accessToken: string): {
  readonly getCurrentProfile: GetCurrentProfile;
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Native profile access is not configured.");

  const profiles = createSupabaseProfileDetailsReader({ url, anonKey, accessToken });
  return { getCurrentProfile: new GetCurrentProfile(profiles) };
}
