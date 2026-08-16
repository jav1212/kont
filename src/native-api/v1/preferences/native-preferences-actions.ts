import { GetEffectiveUserPreferences, UpdateUserPreferences } from "@kontave/preferences-application";
import { createSupabaseUserPreferencesRepository } from "@kontave/preferences-supabase";

export function createNativePreferencesActions(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Native preferences access is not configured.");
  const repository = createSupabaseUserPreferencesRepository({ url, anonKey, accessToken });
  const clock = { now: () => new Date().toISOString() };
  return { get: new GetEffectiveUserPreferences(repository, clock), update: new UpdateUserPreferences(repository, clock) };
}
