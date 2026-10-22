import "server-only";
import { GetEffectiveUserSystemLabels, UpdateUserSystemLabels } from "@kontave/preferences/application";
import { createSupabaseUserProcessDefaultsRepository } from "@kontave/preferences/supabase";
import { PRODUCT_SYSTEM_LABELS } from "@/src/modules/inventory/domain/product-system-labels";
import type { SystemLabelDefinition, SystemLabelCatalogId } from "@kontave/preferences/application";

/** Composes Web system-label preferences for an authenticated actor.
 * @param accessToken - Verified Supabase access token.
 * @param catalog - Stable labels owned by the consuming capability.
 * @param catalogId - Optional stable storage namespace for an independent catalog.
 * @returns Read and revisioned update use cases with the selected label catalog.
 * @throws {Error} When public Supabase configuration is unavailable.
 */
export function createUserSystemLabelsActions(
  accessToken: string,
  catalog: readonly SystemLabelDefinition[] = PRODUCT_SYSTEM_LABELS,
  catalogId?: SystemLabelCatalogId,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("User system-label preferences are not configured.");
  const repository = createSupabaseUserProcessDefaultsRepository({ url, anonKey, accessToken });
  const clock = { now: () => new Date().toISOString() };
  return {
    get: new GetEffectiveUserSystemLabels(repository, clock),
    update: new UpdateUserSystemLabels(repository, clock),
    catalog,
    catalogId,
  };
}
