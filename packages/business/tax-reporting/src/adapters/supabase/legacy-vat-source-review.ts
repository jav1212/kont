import type { SupabaseClient } from "@supabase/supabase-js";
import { RecordReviewedLegacyVatSource } from "../../application/record-reviewed-legacy-vat-source";
import { SupabaseTaxReportingRepository } from "./tax-reporting-repository";
import { SupabaseTaxationConfigurationRepository } from "@kontave/taxation/supabase";

/** Creates the source-review command with one server-only adapter for reads and appends.
 * @param client - Server Supabase client used by the scoped service-role RPCs.
 * @returns A command that rereads its source and appends the reviewed historical fact atomically by idempotency key.
 */
export function createSupabaseLegacyVatSourceReview(client: SupabaseClient): RecordReviewedLegacyVatSource {
  const repository = new SupabaseTaxReportingRepository(client);
  return new RecordReviewedLegacyVatSource(repository, repository, new SupabaseTaxationConfigurationRepository(client));
}
