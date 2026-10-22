import {
  GetEffectiveUserViewPreferences,
  UpdateUserViewPreferences,
} from "@kontave/preferences/application";
import { createSupabaseUserViewPreferencesRepository } from "@kontave/preferences/supabase";

/**
 * Composes user-owned view preferences for a verified Supabase access token.
 * @param accessToken - Access token resolved from the authenticated server session.
 * @returns Read and revisioned update use cases backed by user-scoped RLS.
 * @throws {Error} When public Supabase configuration is unavailable.
 */
export function createUserViewPreferencesActions(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("User view preferences are not configured.");
  const repository = createSupabaseUserViewPreferencesRepository({ url, anonKey, accessToken });
  const clock = { now: () => new Date().toISOString() };
  return {
    get: new GetEffectiveUserViewPreferences(repository, clock),
    update: new UpdateUserViewPreferences(repository, clock),
  };
}
