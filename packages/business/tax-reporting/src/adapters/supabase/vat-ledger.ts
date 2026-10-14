import type { SupabaseClient } from "@supabase/supabase-js";
import { BuildVatLedger } from "../../application/build-vat-ledger";
import { SupabaseTaxReportingRepository } from "./tax-reporting-repository";

/** Creates the historical VAT ledger action backed by reporting facts in Supabase.
 * @param client - Server-only Supabase client.
 * @returns A ledger action with its scoped persistence adapter.
 */
export function createSupabaseVatLedger(client: SupabaseClient): BuildVatLedger {
  return new BuildVatLedger(new SupabaseTaxReportingRepository(client));
}
