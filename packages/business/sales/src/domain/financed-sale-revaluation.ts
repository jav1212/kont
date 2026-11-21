import {
  addDecimal,
  compareDecimal,
  exactDecimal,
  multiplyDecimal,
  quantizeDecimal,
  subtractDecimal,
  type ExactDecimal,
} from "@kontave/monetary/domain";
import type { ExchangeDifferenceDirection, FinancedSaleJournalEntry, FinancedSaleJournalLine, FinancedSaleSettlement } from "./financed-sale-exchange-difference";
import { SalesFailure } from "./sales-failure";
import { salesDate, type SalesDate } from "./temporal";

/*
 * At each month end the USD still owed by the financier is revalued at the
 * official rate of that date. The resulting unrealized difference is booked on
 * the month end and reversed on the first day of the next month, so realized
 * differences booked at settlement stay correct and are never counted twice.
 */

const ZERO = exactDecimal("0");

/** Official rate in effect on a month end. */
export interface MonthEndRate {
  /** `YYYY-MM`. */
  readonly month: string;
  /** Last calendar day of the month. */
  readonly date: SalesDate;
  readonly vesPerUsd: ExactDecimal;
}

/** Unrealized exchange difference of the open financed balance at one month end. */
export interface FinancedSaleRevaluation {
  readonly month: string;
  readonly date: SalesDate;
  readonly vesPerUsd: ExactDecimal;
  /** USD still owed at the end of the month. */
  readonly outstandingUsd: ExactDecimal;
  /** Historical VES of that balance (sale-date rates). */
  readonly carriedVes: ExactDecimal;
  /** Balance valued at the month-end rate. */
  readonly revaluedVes: ExactDecimal;
  /** `revaluedVes - carriedVes`; positive is a gain. */
  readonly difference: ExactDecimal;
  readonly direction: ExchangeDifferenceDirection;
}

/**
 * Revalues the financed balance outstanding at each month end. Only sales dated
 * on or before the month end and collections dated on or before it count.
 * @param settlements - Settled financed sales with all their collections.
 * @param monthEnds - Month ends to revalue, in any order.
 * @returns One revaluation per month end with an open balance, in month order.
 * @throws {SalesFailure} `SALES_FINANCED_SALE_INVALID` when a month-end rate is not positive or a month is repeated.
 */
export function revalueFinancedSalesAtMonthEnds(
  settlements: readonly FinancedSaleSettlement[],
  monthEnds: readonly MonthEndRate[],
): readonly FinancedSaleRevaluation[] {
  if (new Set(monthEnds.map((item) => item.month)).size !== monthEnds.length) throw invalid("Month ends must be unique.");
  return Object.freeze([...monthEnds].sort((left, right) => left.month.localeCompare(right.month)).flatMap((monthEnd) => {
    const date = salesDate(monthEnd.date);
    const rate = exactDecimal(monthEnd.vesPerUsd);
    if (compareDecimal(rate, ZERO) <= 0) throw invalid("Month-end rate must be positive.");
    let outstandingUsd = ZERO;
    let carriedVes = ZERO;
    for (const settlement of settlements) {
      if (settlement.terms.saleDate > date) continue;
      let usd = settlement.financedUsd;
      let ves = settlement.financedVes;
      for (const collection of settlement.collections) {
        if (collection.collectedOn > date) continue;
        usd = subtractDecimal(usd, collection.appliedUsd);
        ves = subtractDecimal(ves, collection.carriedVes);
      }
      outstandingUsd = addDecimal(outstandingUsd, usd);
      carriedVes = addDecimal(carriedVes, ves);
    }
    if (compareDecimal(outstandingUsd, ZERO) <= 0) return [];
    const revaluedVes = quantizeDecimal(multiplyDecimal(outstandingUsd, rate), { scale: 2, mode: "half_up" });
    const difference = subtractDecimal(revaluedVes, carriedVes);
    const comparison = compareDecimal(difference, ZERO);
    return [Object.freeze({
      month: monthEnd.month,
      date,
      vesPerUsd: rate,
      outstandingUsd,
      carriedVes,
      revaluedVes,
      difference,
      direction: comparison === 0 ? "none" as const : comparison > 0 ? "gain" as const : "loss" as const,
    })];
  }));
}

/**
 * Builds the month-end revaluation entry and, when the next month has started,
 * its reversal on the first day of that month.
 * @param revaluations - Results of {@link revalueFinancedSalesAtMonthEnds}.
 * @param asOf - Reversals dated after this day are not produced yet.
 * @param describe - Description of each entry from its kind and `YYYY-MM` month.
 * @returns Balanced entries with stable `revaluation:<month>` and `revaluation_reversal:<month>` keys.
 */
export function financedSaleRevaluationJournalEntries(
  revaluations: readonly FinancedSaleRevaluation[],
  asOf: SalesDate,
  describe: (kind: "revaluation" | "revaluation_reversal", month: string) => string,
): readonly FinancedSaleJournalEntry[] {
  return Object.freeze(revaluations.flatMap((revaluation) => {
    if (revaluation.direction === "none") return [];
    const amount = revaluation.direction === "gain" ? revaluation.difference : subtractDecimal(ZERO, revaluation.difference);
    const adjustment: readonly FinancedSaleJournalLine[] = revaluation.direction === "gain"
      ? [line("financier_receivable", amount, ZERO), line("exchange_gain", ZERO, amount)]
      : [line("exchange_loss", amount, ZERO), line("financier_receivable", ZERO, amount)];
    const reversal = adjustment.map((item) => line(item.role, item.credit, item.debit));
    const nextMonthStart = firstDayOfNextMonth(revaluation.date);
    const entries: FinancedSaleJournalEntry[] = [Object.freeze({
      key: `revaluation:${revaluation.month}`,
      kind: "revaluation",
      date: revaluation.date,
      description: describe("revaluation", revaluation.month),
      lines: Object.freeze(adjustment),
    })];
    if (nextMonthStart <= asOf) {
      entries.push(Object.freeze({
        key: `revaluation_reversal:${revaluation.month}`,
        kind: "revaluation_reversal",
        date: nextMonthStart,
        description: describe("revaluation_reversal", revaluation.month),
        lines: Object.freeze(reversal),
      }));
    }
    return entries;
  }));
}

/**
 * Lists the last day of every month from `from`'s month through the last month
 * that ended on or before `asOf`.
 * @param from - Any date in the first month.
 * @param asOf - Cut-off date.
 * @returns Month keys with their last calendar day, oldest first.
 */
export function completedMonthEnds(from: SalesDate, asOf: SalesDate): readonly { readonly month: string; readonly date: SalesDate }[] {
  const result: { month: string; date: SalesDate }[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  for (;;) {
    const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    if (last > asOf) break;
    result.push({ month: last.slice(0, 7), date: salesDate(last) });
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return Object.freeze(result);
}

function firstDayOfNextMonth(date: SalesDate): SalesDate {
  const value = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 1));
  return salesDate(value.toISOString().slice(0, 10));
}

function line(role: FinancedSaleJournalLine["role"], debit: ExactDecimal, credit: ExactDecimal): FinancedSaleJournalLine {
  return Object.freeze({ role, debit, credit });
}

function invalid(message: string): SalesFailure {
  return new SalesFailure("SALES_FINANCED_SALE_INVALID", message);
}
