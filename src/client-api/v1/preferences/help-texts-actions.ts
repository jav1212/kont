import { GetEffectiveUserHelpTexts, UpdateUserHelpTexts } from "@kontave/preferences/application";
import { createSupabaseUserProcessDefaultsRepository } from "@kontave/preferences/supabase";
import { WEB_HELP_TOPIC_CATALOG } from "@/src/modules/help/application/help-topic-catalog";

/** Composes registered Web help text overrides for an authenticated actor.
 * @param accessToken - Verified Supabase access token.
 * @returns Read and revisioned update use cases.
 * @throws {Error} When public Supabase configuration is unavailable.
 */
export function createUserHelpTextsActions(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("User help preferences are not configured.");
  const repository = createSupabaseUserProcessDefaultsRepository({ url, anonKey, accessToken });
  const clock = { now: () => new Date().toISOString() };
  return {
    get: new GetEffectiveUserHelpTexts(repository, clock),
    update: new UpdateUserHelpTexts(repository, clock),
    catalog: WEB_HELP_TOPIC_CATALOG,
  };
}
