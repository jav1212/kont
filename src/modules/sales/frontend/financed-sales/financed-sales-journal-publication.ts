// Publishes the financed-sales exchange-difference journal to Accounting as
// draft entries. Each entry carries a stable `sourceRef`, so publishing again
// updates the same drafts instead of duplicating them and never touches entries
// that an accountant already posted.

import type { FinancedSaleAccountRole, FinancedSaleJournalEntry } from "@kontave/sales/domain";
import type { AccountingPeriod } from "@/src/modules/accounting/backend/domain/accounting-period";
import type { JournalEntry } from "@/src/modules/accounting/backend/domain/journal-entry";
import type { SaveEntryInput } from "@/src/modules/accounting/backend/domain/repository/journal-entry.repository";
import { fetchJson } from "@/src/shared/frontend/utils/api-fetch";

/** Prefix that identifies entries owned by this report inside the journal. */
const SOURCE_REF_PREFIX = "financed-sales";

export type JournalGranularity = "daily" | "monthly";
export type RoleAccounts = Partial<Record<FinancedSaleAccountRole, string>>;

/** What publishing would do with one proposed entry. */
export type PublicationAction =
    | { kind: "create"; periodId: string }
    | { kind: "update"; periodId: string; entryId: string }
    | { kind: "already_posted"; entryId: string }
    | { kind: "no_open_period" };

export interface PublicationItem {
    entry: FinancedSaleJournalEntry;
    sourceRef: string;
    action: PublicationAction;
}

export interface PublicationPlan {
    items: PublicationItem[];
    /** Roles used by the entries that have no account assigned. */
    missingRoles: FinancedSaleAccountRole[];
    /**
     * Entries of this report previously published with the other granularity.
     * Publishing both would book the same facts twice, so the plan is blocked.
     */
    conflictingEntries: number;
}

/**
 * Decides, without side effects, how each proposed entry maps onto the journal.
 * @param entries - Proposed entries from `buildFinancedSalesJournal`.
 * @param granularity - Granularity those entries were built with.
 * @param accounts - Posting account chosen for each role.
 * @param periods - Company accounting periods.
 * @param existing - Current company journal entries.
 * @returns The per-entry actions plus blocking conditions.
 */
export function planFinancedSalesJournalPublication(
    entries: readonly FinancedSaleJournalEntry[],
    granularity: JournalGranularity,
    accounts: RoleAccounts,
    periods: readonly AccountingPeriod[],
    existing: readonly JournalEntry[],
): PublicationPlan {
    const owned = existing.filter((entry) => entry.sourceRef?.startsWith(`${SOURCE_REF_PREFIX}:`));
    const byRef = new Map(owned.map((entry) => [entry.sourceRef!, entry]));
    const otherPrefix = `${SOURCE_REF_PREFIX}:${granularity === "daily" ? "monthly" : "daily"}:`;
    const usedRoles = new Set(entries.flatMap((entry) => entry.lines.map((line) => line.role)));

    return {
        items: entries.map((entry) => {
            const sourceRef = `${SOURCE_REF_PREFIX}:${granularity}:${entry.key}`;
            const current = byRef.get(sourceRef);
            if (current?.status === "posted") return { entry, sourceRef, action: { kind: "already_posted", entryId: current.id } };
            const period = periods.find((candidate) => candidate.status === "open" && candidate.startDate <= entry.date && entry.date <= candidate.endDate);
            if (!period) return { entry, sourceRef, action: { kind: "no_open_period" } };
            return {
                entry,
                sourceRef,
                action: current ? { kind: "update", periodId: period.id, entryId: current.id } : { kind: "create", periodId: period.id },
            };
        }),
        missingRoles: [...usedRoles].filter((role) => !accounts[role]),
        conflictingEntries: owned.filter((entry) => entry.sourceRef!.startsWith(otherPrefix)).length,
    };
}

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
export async function publishFinancedSalesJournal(plan: PublicationPlan, companyId: string, accounts: RoleAccounts): Promise<PublicationResult> {
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
                // The journal only accepts its existing source kinds; `sourceRef` carries the origin.
                source: "manual",
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
