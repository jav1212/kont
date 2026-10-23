import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createExecutePayablesCommand, type PayablesIslrCalculatorPort, type PayablesValuationPort } from "@kontave/payables/application";
import { SupabasePayablesRepository } from "@kontave/payables/supabase";

/** Composes payables application actions with the trusted server-only Supabase adapter.
 * @param valuation - Server-side VES valuation; without it, document-creating and payment commands are rejected as unavailable.
 * @param islr - Server-side ISLR tariff calculator; without it, ISLR withholdings are rejected as unavailable.
 * @returns Payables repository and command use case for an authorized route boundary.
 * @throws {Error} When server database credentials are missing.
 */
export function createPayablesActions(valuation?: PayablesValuationPort, islr?: PayablesIslrCalculatorPort) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Payables server infrastructure is not configured.");
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const repository = new SupabasePayablesRepository(client);
  return { repository, execute: createExecutePayablesCommand(repository, valuation, islr) };
}
