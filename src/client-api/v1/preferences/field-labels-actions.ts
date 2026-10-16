import { GetEffectiveUserFieldLabels, UpdateUserFieldLabels } from "@kontave/preferences/application";
import { createSupabaseUserProcessDefaultsRepository } from "@kontave/preferences/supabase";

/** Composes user-owned field-label actions for an authenticated Web token.
 * @param accessToken - Verified Supabase access token.
 * @returns Read and revisioned update use cases.
 * @throws {Error} When public Supabase configuration is unavailable.
 */
export function createUserFieldLabelsActions(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("User field preferences are not configured.");
  const repository = createSupabaseUserProcessDefaultsRepository({ url, anonKey, accessToken });
  const clock = { now: () => new Date().toISOString() };
  return { get: new GetEffectiveUserFieldLabels(repository, clock), update: new UpdateUserFieldLabels(repository, clock) };
}
