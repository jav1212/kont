import "server-only";
import { AccountingQueries, ExecuteAccountingCommand, type AccountingAuthorization } from "@kontave/accounting/application";
import { SupabaseAccountingRepository, type AccountingSupabaseClient } from "@kontave/accounting/supabase";
import type { AccountingScope } from "@kontave/accounting/domain";

/** Builds the portable chart and account use cases for an authenticated server request.
 * @param client - Trusted Supabase client that can invoke the accounting RPCs.
 * @param requirePermission - Server authorization boundary for a company scope.
 * @returns Portable command/query use cases and their shared RPC repository.
 * @throws Never during construction.
 */
export function createAccountingActions(
  client: AccountingSupabaseClient,
  requirePermission: (scope: AccountingScope, permission: "accounting.read" | "accounting.chart.manage") => Promise<void>,
): { readonly repository: SupabaseAccountingRepository; readonly command: ExecuteAccountingCommand; readonly queries: AccountingQueries } {
  const authorization: AccountingAuthorization = { require: requirePermission };
  const repository = new SupabaseAccountingRepository(client);
  return Object.freeze({
    repository,
    command: new ExecuteAccountingCommand(authorization, repository),
    queries: new AccountingQueries(authorization, repository),
  });
}
