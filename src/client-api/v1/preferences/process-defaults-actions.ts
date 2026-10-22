import "server-only";
import { GetEffectiveUserProcessDefaults, UpdateUserProcessDefaults } from "@kontave/preferences/application";
import { createSupabaseUserProcessDefaultsRepository } from "@kontave/preferences/supabase";

/**
 * Creates process-default use cases backed by the authenticated Supabase session.
 * @param accessToken - Current user's Supabase access token; RLS derives ownership.
 * @returns Read and optimistic-update use cases for user-owned process defaults.
 * @throws {Error} When Supabase public configuration is unavailable.
 */
export function createUserProcessDefaultsActions(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("User process preferences are not configured.");
  const repository = createSupabaseUserProcessDefaultsRepository({ url, anonKey, accessToken });
  const clock = { now: () => new Date().toISOString() };
  return {
    get: new GetEffectiveUserProcessDefaults(repository, clock),
    update: new UpdateUserProcessDefaults(repository, clock),
  };
}
