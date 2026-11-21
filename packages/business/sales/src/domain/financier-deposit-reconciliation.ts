import { compareDecimal, exactDecimal, quantizeDecimal, type ExactDecimal } from "@kontave/monetary/domain";
import { SalesFailure } from "./sales-failure";
import { salesDate, type SalesDate } from "./temporal";

/** Financier deposit as recorded in the ledger, with its current bank link. */
export interface ReconcilableFinancierDeposit {
  readonly id: string;
  readonly depositDate: SalesDate;
  readonly amountVes: ExactDecimal;
  /** Bank ledger entry already linked, or `null`. */
  readonly bankEntryId: string | null;
}

/** Incoming bank movement that may be a financier deposit. */
export interface BankCreditCandidate {
  readonly id: string;
  readonly date: SalesDate;
  readonly amountVes: ExactDecimal;
  readonly concept: string;
}

/** Proposed link between a recorded deposit and a bank credit. */
export interface FinancierDepositMatch {
  readonly depositId: string;
  readonly bankEntryId: string;
  /** Absolute difference in days between the deposit and the bank movement. */
  readonly dayGap: number;
}

/** Outcome of comparing the ledger with the bank. */
export interface FinancierDepositReconciliation {
  readonly matches: readonly FinancierDepositMatch[];
  /** Recorded deposits with neither an existing link nor a matching bank credit. */
  readonly unmatchedDepositIds: readonly string[];
  /** Bank credits that are not linked and match no recorded deposit. */
  readonly unmatchedCredits: readonly BankCreditCandidate[];
}

/**
 * Suggests one-to-one links between unlinked deposits and unlinked bank credits
 * with the same amount to the cent and dates at most `toleranceDays` apart.
 * Closest dates are linked first so a repeated amount pairs with its nearest
 * movement.
 * @param deposits - Ledger deposits, linked or not.
 * @param credits - Bank credits of the period, linked or not.
 * @param toleranceDays - Largest accepted date gap, from 0 to 31.
 * @returns Suggested matches plus what remains unmatched on each side.
 * @throws {SalesFailure} `SALES_FINANCED_COLLECTION_INVALID` when the tolerance is out of range.
 */
export function suggestFinancierDepositMatches(
  deposits: readonly ReconcilableFinancierDeposit[],
  credits: readonly BankCreditCandidate[],
  toleranceDays = 3,
): FinancierDepositReconciliation {
  if (!Number.isInteger(toleranceDays) || toleranceDays < 0 || toleranceDays > 31) {
    throw new SalesFailure("SALES_FINANCED_COLLECTION_INVALID", "Reconciliation tolerance must be between 0 and 31 days.");
  }
  const linkedEntries = new Set(deposits.flatMap((deposit) => deposit.bankEntryId ? [deposit.bankEntryId] : []));
  const openDeposits = deposits.filter((deposit) => !deposit.bankEntryId);
  const openCredits = credits.filter((credit) => !linkedEntries.has(credit.id));

  const candidates: FinancierDepositMatch[] = [];
  for (const deposit of openDeposits) {
    for (const credit of openCredits) {
      if (compareDecimal(cents(deposit.amountVes), cents(credit.amountVes)) !== 0) continue;
      const dayGap = Math.abs(dayNumber(salesDate(deposit.depositDate)) - dayNumber(salesDate(credit.date)));
      if (dayGap <= toleranceDays) candidates.push({ depositId: deposit.id, bankEntryId: credit.id, dayGap });
    }
  }
  candidates.sort((left, right) => left.dayGap - right.dayGap || left.depositId.localeCompare(right.depositId) || left.bankEntryId.localeCompare(right.bankEntryId));

  const usedDeposits = new Set<string>();
  const usedCredits = new Set<string>();
  const matches: FinancierDepositMatch[] = [];
  for (const candidate of candidates) {
    if (usedDeposits.has(candidate.depositId) || usedCredits.has(candidate.bankEntryId)) continue;
    usedDeposits.add(candidate.depositId);
    usedCredits.add(candidate.bankEntryId);
    matches.push(Object.freeze(candidate));
  }
  return Object.freeze({
    matches: Object.freeze(matches),
    unmatchedDepositIds: Object.freeze(openDeposits.filter((deposit) => !usedDeposits.has(deposit.id)).map((deposit) => deposit.id)),
    unmatchedCredits: Object.freeze(openCredits.filter((credit) => !usedCredits.has(credit.id))),
  });
}

function cents(value: ExactDecimal): ExactDecimal {
  return quantizeDecimal(exactDecimal(value), { scale: 2, mode: "half_up" });
}

function dayNumber(date: SalesDate): number {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}
