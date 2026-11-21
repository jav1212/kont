import "server-only";

// Writes the financed-sales ledger journal into the Web accounting module as
// draft entries, using the same publication plan as the calculator screen.

import {
    countFinancedSalesPublication,
    planFinancedSalesJournalPublication,
    type FinancedSaleRoleAccounts,
    type FinancedSalesJournalSink,
    type FinancedSalesJournalSyncResult,
} from "@kontave/sales/application";
import type { FinancedSaleJournalEntry } from "@kontave/sales/domain";
import { getAccountingActions } from "@/src/modules/accounting/backend/infrastructure/accounting-factory";

// The journal source constraint only admits existing kinds; `sourceRef` identifies the ledger.
const ENTRY_SOURCE = "manual";

/** Accounting draft synchronization for the financed-sales ledger. */
export class AccountingFinancedSalesJournalSink implements FinancedSalesJournalSink {
    /**
     * Creates the sink.
     * @param tenantId - Tenant whose accounting module receives the drafts.
     */
    constructor(private readonly tenantId: string) {}

    /** {@inheritDoc FinancedSalesJournalSink.sync} */
    async sync(
        companyId: string,
        entries: readonly FinancedSaleJournalEntry[],
        granularity: "daily" | "monthly",
        accounts: FinancedSaleRoleAccounts,
    ): Promise<FinancedSalesJournalSyncResult> {
        const actions = getAccountingActions(this.tenantId);
        const [existing, periods] = await Promise.all([actions.getEntries.execute({ companyId }), actions.getPeriods.execute(companyId)]);
        if (existing.isFailure || periods.isFailure) {
            return failed(existing.isFailure ? existing.getError() : periods.getError());
        }

        const plan = planFinancedSalesJournalPublication(entries, { channel: "ledger", granularity }, accounts, periods.getValue(), existing.getValue());
        const counts = countFinancedSalesPublication(plan);
        const monthsWithoutPeriod = [...new Set(plan.items.filter((item) => item.action.kind === "no_open_period").map((item) => item.entry.date.slice(0, 7)))];
        const base = { alreadyPosted: counts.already_posted, monthsWithoutPeriod };
        if (plan.missingRoles.length) return { ...base, status: "skipped_missing_accounts", created: 0, updated: 0, removed: 0 };
        if (plan.conflictingEntries) {
            return { ...base, status: "blocked_conflict", created: 0, updated: 0, removed: 0, message: `${plan.conflictingEntries} asientos de ventas financiadas fueron publicados desde la calculadora o con otra granularidad.` };
        }

        let created = 0;
        let updated = 0;
        let removed = 0;
        const errors: string[] = [];
        for (const { entry, sourceRef, action } of plan.items) {
            if (action.kind !== "create" && action.kind !== "update") continue;
            const saved = await actions.saveEntry.execute({
                entry: {
                    ...(action.kind === "update" ? { id: action.entryId } : {}),
                    companyId,
                    periodId: action.periodId,
                    date: entry.date,
                    description: entry.description,
                    source: ENTRY_SOURCE,
                    sourceRef,
                },
                lines: entry.lines.map((line) => {
                    const debit = Number(line.debit);
                    return { accountId: accounts[line.role]!, type: debit > 0 ? "debit" : "credit", amount: debit > 0 ? debit : Number(line.credit), description: null };
                }),
            });
            if (saved.isFailure) { errors.push(`${entry.description}: ${saved.getError()}`); continue; }
            if (action.kind === "create") created += 1; else updated += 1;
        }
        for (const stale of plan.staleDrafts) {
            const deleted = await actions.deleteDraftEntryBySourceRef.execute({ companyId, source: ENTRY_SOURCE, sourceRef: stale.sourceRef! });
            if (deleted.isFailure) errors.push(`${stale.sourceRef}: ${deleted.getError()}`); else removed += 1;
        }
        return errors.length
            ? { ...base, status: "failed", created, updated, removed, message: errors.slice(0, 3).join(" · ") }
            : { ...base, status: "synced", created, updated, removed };
    }
}

function failed(message: string): FinancedSalesJournalSyncResult {
    return { status: "failed", created: 0, updated: 0, removed: 0, alreadyPosted: 0, monthsWithoutPeriod: [], message };
}
