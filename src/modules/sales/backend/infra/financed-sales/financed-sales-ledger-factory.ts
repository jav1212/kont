import "server-only";
// Composition root of the financed-sales ledger for Web API routes.

import { FinancedSalesLedger } from "@kontave/sales/application";
import { salesDate } from "@kontave/sales/domain";
import { SupabaseFinancedSalesLedgerRepository } from "@kontave/sales/supabase";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { describeFinancedSalesMonth } from "@/src/modules/sales/shared/financed-sales-labels";
import { AccountingFinancedSalesJournalSink } from "./accounting-journal-sink";
import { BcvServerUsdRateHistory } from "./bcv-usd-rate-history";

/**
 * Creates the ledger service for one authenticated request.
 * @param tenantId - Tenant from the authenticated server context.
 * @param actorId - User recorded as creator of new rows.
 * @returns The ledger service wired to Supabase, BCV and Accounting.
 */
export function getFinancedSalesLedger(tenantId: string, actorId: string | null): FinancedSalesLedger {
    return new FinancedSalesLedger(
        new SupabaseFinancedSalesLedgerRepository(new ServerSupabaseSource().instance, tenantId, actorId),
        new BcvServerUsdRateHistory(),
        new AccountingFinancedSalesJournalSink(tenantId),
        () => crypto.randomUUID(),
        describeFinancedSalesMonth,
        // Business dates follow Venezuela, whatever the server time zone is.
        () => salesDate(new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" })),
    );
}
