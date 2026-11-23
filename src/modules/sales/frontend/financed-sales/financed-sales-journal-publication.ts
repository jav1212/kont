// Publishes the calculator's financed-sales journal to Accounting as draft
// entries. Planning lives in @kontave/sales so the persisted ledger and this
// screen apply the same idempotency and conflict rules.

import type { FinancedSalesPublicationPlan, FinancedSaleRoleAccounts } from "@kontave/sales/application";
import type { FinancedSaleJournalEntry } from "@kontave/sales/domain";
import type { JournalEntry } from "@/src/modules/accounting/backend/domain/journal-entry";
import type { SaveEntryInput } from "@/src/modules/accounting/backend/domain/repository/journal-entry.repository";
import { fetchJson } from "@/src/shared/frontend/utils/api-fetch";

export interface PublicationResult {
    created: number;
    updated: number;
    failures: Array<{ entry: FinancedSaleJournalEntry; error: string }>;
}

/**
 * Saves every creatable or updatable entry of a plan as a draft. Entries are
 * saved one at a time so a failure is reported per entry and the rest proceed.
 * @param plan - Plan without missing roles or conflicts.
 * @param companyId - Company that owns the journal.
 * @param accounts - Posting account chosen for each role.
 * @returns Counts of saved entries and the failures with their server message.
 * @throws {Error} When the plan still has missing roles or conflicting entries.
 */
export async function publishFinancedSalesJournal(plan: FinancedSalesPublicationPlan, companyId: string, accounts: FinancedSaleRoleAccounts): Promise<PublicationResult> {
    if (plan.missingRoles.length || plan.conflictingEntries) throw new Error("La publicación tiene cuentas sin asignar o asientos en conflicto.");
    const result: PublicationResult = { created: 0, updated: 0, failures: [] };
    for (const { entry, sourceRef, action } of plan.items) {
        if (action.kind !== "create" && action.kind !== "update") continue;
        const body: SaveEntryInput = {
            entry: {
                ...(action.kind === "update" ? { id: action.entryId } : {}),
                companyId,
                periodId: action.periodId,
                date: entry.date,
                description: entry.description,
                source: "sales",
                sourceRef,
            },
            lines: entry.lines.map((line) => {
                const debit = Number(line.debit);
                return { accountId: accounts[line.role]!, type: debit > 0 ? "debit" : "credit", amount: debit > 0 ? debit : Number(line.credit), description: null };
            }),
        };
        try {
            const { ok, json } = await fetchJson("/api/accounting/entries", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!ok) { result.failures.push({ entry, error: json.error ?? "Error desconocido" }); continue; }
            if (action.kind === "create") result.created += 1; else result.updated += 1;
        } catch (caught) {
            result.failures.push({ entry, error: caught instanceof Error ? caught.message : String(caught) });
        }
    }
    return result;
}

/**
 * Loads the company journal so a plan can detect entries published before.
 * @param companyId - Company that owns the journal.
 * @returns Every journal entry of the company.
 * @throws {Error} When the journal cannot be read.
 */
export async function loadCompanyJournal(companyId: string): Promise<JournalEntry[]> {
    const { ok, json } = await fetchJson(`/api/accounting/entries?companyId=${encodeURIComponent(companyId)}`);
    if (!ok) throw new Error(json.error ?? "No se pudieron leer los asientos contables.");
    return (json.data as JournalEntry[] | undefined) ?? [];
}
