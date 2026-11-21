import type { FinancedSaleAccountRole, FinancedSaleJournalEntry } from "../domain";

/** Root of every `sourceRef` written by the financed-sales integrations. */
export const FINANCED_SALES_SOURCE_ROOT = "financed-sales";

/** Journal entry fields the publication plan needs, independent of the accounting module. */
export interface JournalEntrySnapshot {
  readonly id: string;
  readonly sourceRef: string | null;
  readonly status: "draft" | "posted";
}

/** Accounting period fields the publication plan needs. */
export interface AccountingPeriodSnapshot {
  readonly id: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: "open" | "closed";
}

/** Posting account chosen for each journal role. */
export type FinancedSaleRoleAccounts = Partial<Record<FinancedSaleAccountRole, string>>;

/** Identifies one publishing stream: who writes the entries and at which granularity. */
export interface FinancedSalesPublicationScope {
  /** `calculator` for the spreadsheet report, `ledger` for the persisted ledger. */
  readonly channel: "calculator" | "ledger";
  readonly granularity: "daily" | "monthly";
}

/** What publishing would do with one proposed entry. */
export type FinancedSalesPublicationAction =
  | { readonly kind: "create"; readonly periodId: string }
  | { readonly kind: "update"; readonly periodId: string; readonly entryId: string }
  | { readonly kind: "already_posted"; readonly entryId: string }
  | { readonly kind: "no_open_period" };

export interface FinancedSalesPublicationItem {
  readonly entry: FinancedSaleJournalEntry;
  readonly sourceRef: string;
  readonly action: FinancedSalesPublicationAction;
}

/** Side-effect-free decision of how proposed entries map onto the journal. */
export interface FinancedSalesPublicationPlan {
  readonly items: readonly FinancedSalesPublicationItem[];
  /** Roles used by the entries that have no account assigned. */
  readonly missingRoles: readonly FinancedSaleAccountRole[];
  /**
   * Entries written by another channel or granularity. Publishing over them
   * would book the same facts twice, so the plan must not be executed.
   */
  readonly conflictingEntries: number;
  /** Drafts of this scope whose facts no longer exist and should be removed. */
  readonly staleDrafts: readonly JournalEntrySnapshot[];
}

/**
 * Builds the `sourceRef` prefix of a publishing scope.
 * @param scope - Channel and granularity.
 * @returns Prefix ending in `:` shared by every entry of the scope.
 */
export function financedSalesSourcePrefix(scope: FinancedSalesPublicationScope): string {
  // The calculator kept the shorter historical prefix used by its first release.
  return scope.channel === "calculator"
    ? `${FINANCED_SALES_SOURCE_ROOT}:${scope.granularity}:`
    : `${FINANCED_SALES_SOURCE_ROOT}:ledger:${scope.granularity}:`;
}

/**
 * Decides how each proposed entry maps onto the journal: create a draft, update
 * this scope's draft, leave a posted entry alone, or skip a date without an open
 * period.
 * @param entries - Proposed entries with stable keys.
 * @param scope - Channel and granularity those entries belong to.
 * @param accounts - Posting account chosen for each role.
 * @param periods - Company accounting periods.
 * @param existing - Current company journal entries.
 * @returns The per-entry actions, blocking conditions and stale drafts.
 */
export function planFinancedSalesJournalPublication(
  entries: readonly FinancedSaleJournalEntry[],
  scope: FinancedSalesPublicationScope,
  accounts: FinancedSaleRoleAccounts,
  periods: readonly AccountingPeriodSnapshot[],
  existing: readonly JournalEntrySnapshot[],
): FinancedSalesPublicationPlan {
  const prefix = financedSalesSourcePrefix(scope);
  const owned = existing.filter((entry) => entry.sourceRef?.startsWith(`${FINANCED_SALES_SOURCE_ROOT}:`));
  const ownedByScope = new Map(owned.filter((entry) => entry.sourceRef!.startsWith(prefix)).map((entry) => [entry.sourceRef!, entry]));
  const usedRoles = new Set(entries.flatMap((entry) => entry.lines.map((line) => line.role)));
  const proposedRefs = new Set(entries.map((entry) => `${prefix}${entry.key}`));

  const items = entries.map((entry): FinancedSalesPublicationItem => {
    const sourceRef = `${prefix}${entry.key}`;
    const current = ownedByScope.get(sourceRef);
    if (current?.status === "posted") return { entry, sourceRef, action: { kind: "already_posted", entryId: current.id } };
    const period = periods.find((candidate) => candidate.status === "open" && candidate.startDate <= entry.date && entry.date <= candidate.endDate);
    if (!period) return { entry, sourceRef, action: { kind: "no_open_period" } };
    return { entry, sourceRef, action: current ? { kind: "update", periodId: period.id, entryId: current.id } : { kind: "create", periodId: period.id } };
  });

  return {
    items,
    missingRoles: [...usedRoles].filter((role) => !accounts[role]),
    conflictingEntries: owned.filter((entry) => !entry.sourceRef!.startsWith(prefix) && isOtherFinancedScope(entry.sourceRef!, scope)).length,
    staleDrafts: [...ownedByScope.values()].filter((entry) => entry.status === "draft" && !proposedRefs.has(entry.sourceRef!)),
  };
}

/**
 * Counts how many plan items fall into each action.
 * @param plan - Publication plan.
 * @returns Item count per action kind.
 */
export function countFinancedSalesPublication(plan: FinancedSalesPublicationPlan): Record<FinancedSalesPublicationAction["kind"], number> {
  const counts = { create: 0, update: 0, already_posted: 0, no_open_period: 0 };
  for (const item of plan.items) counts[item.action.kind] += 1;
  return counts;
}

// Both channels describe the same facts, and so do both granularities of one channel.
function isOtherFinancedScope(sourceRef: string, scope: FinancedSalesPublicationScope): boolean {
  const scopes: FinancedSalesPublicationScope[] = [
    { channel: "calculator", granularity: "daily" },
    { channel: "calculator", granularity: "monthly" },
    { channel: "ledger", granularity: "daily" },
    { channel: "ledger", granularity: "monthly" },
  ];
  return scopes.some((candidate) => (candidate.channel !== scope.channel || candidate.granularity !== scope.granularity)
    && sourceRef.startsWith(financedSalesSourcePrefix(candidate)));
}
