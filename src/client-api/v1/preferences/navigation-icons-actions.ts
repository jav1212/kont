import "server-only";
import { GetEffectiveUserNavigationIcons, UpdateUserNavigationIcons } from "@kontave/preferences/application";
import { createSupabaseUserProcessDefaultsRepository } from "@kontave/preferences/supabase";

/** Composes authenticated navigation icon actions.
 * @param accessToken - Verified Supabase access token.
 * @returns Read and revisioned update use cases.
 * @throws {Error} When public Supabase configuration is unavailable.
 */
export function createUserNavigationIconsActions(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("User navigation preferences are not configured.");
  const repository = createSupabaseUserProcessDefaultsRepository({ url, anonKey, accessToken });
  const clock = { now: () => new Date().toISOString() };
  return { get: new GetEffectiveUserNavigationIcons(repository, clock), update: new UpdateUserNavigationIcons(repository, clock) };
}
