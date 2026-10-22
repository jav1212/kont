import "server-only";
import { GetEffectiveUserNavigationLabels, UpdateUserNavigationLabels } from "@kontave/preferences/application";
import { createSupabaseUserProcessDefaultsRepository } from "@kontave/preferences/supabase";

/** Composes authenticated-user navigation label actions.
 * @param accessToken - Verified session token forwarded to Supabase.
 * @returns Read and revisioned update use cases.
 * @throws {Error} When public Supabase configuration is unavailable.
 */
export function createUserNavigationLabelsActions(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("User navigation preferences are not configured.");
  const repository = createSupabaseUserProcessDefaultsRepository({ url, anonKey, accessToken });
  const clock = { now: () => new Date().toISOString() };
  return {
    get: new GetEffectiveUserNavigationLabels(repository, clock),
    update: new UpdateUserNavigationLabels(repository, clock),
  };
}
