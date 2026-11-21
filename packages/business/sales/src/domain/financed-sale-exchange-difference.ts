import {
  addDecimal,
  compareDecimal,
  divideDecimal,
  exactDecimal,
  multiplyDecimal,
  quantizeDecimal,
  subtractDecimal,
  type ExactDecimal,
} from "@kontave/monetary/domain";
import { SalesFailure } from "./sales-failure";
import { salesDate, type SalesDate } from "./temporal";

/*
 * A financed sale is a sale where a third-party financier (for example Cashea)
 * pays part of the price immediately and settles the rest later. The deferred
 * portion is carried in VES at the sale-date rate but is economically a USD
 * claim, so the financier settles it with more or fewer bolivars depending on
 * the rate at settlement. The difference is a realized exchange difference.
 */

const ZERO = exactDecimal("0");
const HUNDRED = exactDecimal("100");
const VES_SCALE = 2;
const USD_SCALE = 8;
const RATE_SCALE = 8;
/** Half a USD cent: a rate-derived partial payment within this margin settles the balance. */
const USD_SETTLEMENT_TOLERANCE = exactDecimal("0.005");

/** Commercial terms of one financed sale, expressed in VES at the sale date. */
export interface FinancedSaleTerms {
  /** Caller-owned label that identifies the sale in reports and journal entries. */
  readonly reference: string;
  readonly saleDate: SalesDate;
  /** Sale amount in VES; must be positive. */
  readonly saleAmountVes: ExactDecimal;
  /** Percentage of the sale paid at once, from 0 (inclusive) to 100 (exclusive). */
  readonly upfrontPercent: ExactDecimal;
  /** VES per USD on the sale date; fixes the USD value of the financed portion. */
  readonly saleVesPerUsd: ExactDecimal;
}

/** One deposit from the financier against the financed portion. */
export interface FinancedSaleCollection {
  readonly collectedOn: SalesDate;
  /** Bolivars actually received in the bank. */
  readonly receivedVes: ExactDecimal;
  /**
   * Rate at which the financier converted this deposit. When present, only
   * `receivedVes / vesPerUsd` USD of the balance is applied (partial payment).
   * When absent, the deposit settles the whole outstanding balance and the rate
   * is derived from it.
   */
  readonly vesPerUsd?: ExactDecimal;
  /**
   * Part of `receivedVes` the financier withheld as its fee. `receivedVes` is the
   * gross amount settled; only `receivedVes - commissionVes` reaches the bank.
   */
  readonly commissionVes?: ExactDecimal;
}

/** Direction of an exchange difference from the seller's point of view. */
export type ExchangeDifferenceDirection = "gain" | "loss" | "none";

/** Accounting effect of one collection against the financed balance. */
export interface FinancedSaleCollectionSettlement {
  readonly collectedOn: SalesDate;
  /** Gross VES settled, before the financier's commission. */
  readonly receivedVes: ExactDecimal;
  /** Financier fee withheld from `receivedVes`; zero when none. */
  readonly commissionVes: ExactDecimal;
  /** USD of the financed balance extinguished by this collection. */
  readonly appliedUsd: ExactDecimal;
  /** Historical VES removed from the receivable (sale-date rate). */
  readonly carriedVes: ExactDecimal;
  /** VES per USD implied by the deposit. */
  readonly impliedVesPerUsd: ExactDecimal;
  /** `receivedVes - carriedVes`; positive is a gain. */
  readonly exchangeDifference: ExactDecimal;
  readonly direction: ExchangeDifferenceDirection;
  /** Whether the collection left no outstanding balance. */
  readonly settlesBalance: boolean;
}

/** Complete calculation for one financed sale and its collections. */
export interface FinancedSaleSettlement {
  readonly terms: FinancedSaleTerms;
  /** USD value of the whole sale at the sale-date rate. */
  readonly saleAmountUsd: ExactDecimal;
  readonly upfrontVes: ExactDecimal;
  /** Receivable from the financier in historical VES. */
  readonly financedVes: ExactDecimal;
  readonly financedUsd: ExactDecimal;
  readonly collections: readonly FinancedSaleCollectionSettlement[];
  readonly outstandingUsd: ExactDecimal;
  readonly outstandingCarriedVes: ExactDecimal;
  /** Net realized exchange difference across all collections. */
  readonly exchangeDifference: ExactDecimal;
}

/** Account roles a financed-sale entry needs; the caller maps them to its chart of accounts. */
export type FinancedSaleAccountRole = "bank" | "financier_receivable" | "sales" | "exchange_gain" | "exchange_loss" | "financier_commission";

/** One balanced debit or credit line in VES. Exactly one side is non-zero. */
export interface FinancedSaleJournalLine {
  readonly role: FinancedSaleAccountRole;
  readonly debit: ExactDecimal;
  readonly credit: ExactDecimal;
}

/** Proposed journal entry for a sale or a collection. */
export interface FinancedSaleJournalEntry {
  /**
   * Stable identity of the entry within its granularity: `sale:<reference>` and
   * `collection:<reference>:<date>:<n>` per sale, `<kind>:<YYYY-MM>` for monthly
   * summaries. Lets integrations update a previously exported entry instead of duplicating it.
   */
  readonly key: string;
  readonly kind: "sale" | "collection";
  readonly date: SalesDate;
  readonly description: string;
  readonly lines: readonly FinancedSaleJournalLine[];
}

/**
 * Splits a financed sale and applies the financier's collections in date order.
 * Partial collections convert through their own rate; the final settling
 * collection takes the exact remaining historical VES so rounding never leaves
 * residue in the receivable.
 * @param terms - Sale amount, upfront percentage and sale-date rate.
 * @param collections - Financier deposits in any order.
 * @returns The split, each collection's exchange difference and the remaining balance.
 * @throws {SalesFailure} `SALES_FINANCED_SALE_INVALID` when the terms are invalid, or
 * `SALES_FINANCED_COLLECTION_INVALID` when a collection predates the sale, follows full
 * settlement, has a non-positive amount or rate, or exceeds the outstanding balance.
 */
export function settleFinancedSale(
  terms: FinancedSaleTerms,
  collections: readonly FinancedSaleCollection[] = [],
): FinancedSaleSettlement {
  const validTerms = validateTerms(terms);
  const saleAmountUsd = quantizeDecimal(divideDecimal(validTerms.saleAmountVes, validTerms.saleVesPerUsd), { scale: USD_SCALE, mode: "half_up" });
  const upfrontVes = ves(divideDecimal(multiplyDecimal(validTerms.saleAmountVes, validTerms.upfrontPercent), HUNDRED));
  const financedVes = subtractDecimal(validTerms.saleAmountVes, upfrontVes);
  const financedUsd = quantizeDecimal(divideDecimal(financedVes, validTerms.saleVesPerUsd), { scale: USD_SCALE, mode: "half_up" });

  let outstandingUsd = financedUsd;
  let outstandingCarriedVes = financedVes;
  let exchangeDifference = ZERO;
  const settled: FinancedSaleCollectionSettlement[] = [];
  for (const collection of [...collections].sort((left, right) => left.collectedOn.localeCompare(right.collectedOn))) {
    const result = applyCollection(validTerms, collection, outstandingUsd, outstandingCarriedVes);
    settled.push(result);
    outstandingUsd = subtractDecimal(outstandingUsd, result.appliedUsd);
    outstandingCarriedVes = subtractDecimal(outstandingCarriedVes, result.carriedVes);
    exchangeDifference = addDecimal(exchangeDifference, result.exchangeDifference);
  }

  return Object.freeze({
    terms: validTerms,
    saleAmountUsd,
    upfrontVes,
    financedVes,
    financedUsd,
    collections: Object.freeze(settled),
    outstandingUsd,
    outstandingCarriedVes,
    exchangeDifference,
  });
}

/**
 * Builds the proposed journal entries for a settlement: one for the sale and
 * one per collection. Entries carry account roles, not account codes.
 * @param settlement - Result of {@link settleFinancedSale}.
 * @returns Balanced entries in chronological order; zero-amount lines are omitted.
 */
export function financedSaleJournalEntries(settlement: FinancedSaleSettlement): readonly FinancedSaleJournalEntry[] {
  const { terms } = settlement;
  const entries: FinancedSaleJournalEntry[] = [entry(`sale:${terms.reference}`, "sale", terms.saleDate, `Venta financiada ${terms.reference}`, [
    debit("bank", settlement.upfrontVes),
    debit("financier_receivable", settlement.financedVes),
    credit("sales", terms.saleAmountVes),
  ])];
  settlement.collections.forEach((collection, index) => {
    const difference = collection.exchangeDifference;
    entries.push(entry(`collection:${terms.reference}:${collection.collectedOn}:${index + 1}`, "collection", collection.collectedOn, `Cobro venta financiada ${terms.reference}`, [
      debit("bank", subtractDecimal(collection.receivedVes, collection.commissionVes)),
      debit("financier_commission", collection.commissionVes),
      ...(collection.direction === "loss" ? [debit("exchange_loss", subtractDecimal(ZERO, difference))] : []),
      credit("financier_receivable", collection.carriedVes),
      ...(collection.direction === "gain" ? [credit("exchange_gain", difference)] : []),
    ]));
  });
  return Object.freeze(entries);
}

/**
 * Merges entries of the same kind within each calendar month into one summary
 * entry dated on the latest entry of that month and kind.
 * @param entries - Entries from one or more financed sales.
 * @param describe - Builds the summary description from the kind and `YYYY-MM` month.
 * @returns Summary entries ordered by month, then sales before collections.
 */
export function summarizeFinancedSaleJournalByMonth(
  entries: readonly FinancedSaleJournalEntry[],
  describe: (kind: FinancedSaleJournalEntry["kind"], month: string) => string,
): readonly FinancedSaleJournalEntry[] {
  const groups = new Map<string, { kind: FinancedSaleJournalEntry["kind"]; month: string; date: SalesDate; totals: Map<FinancedSaleAccountRole, { debit: ExactDecimal; credit: ExactDecimal }> }>();
  for (const item of entries) {
    const month = item.date.slice(0, 7);
    const key = `${month}:${item.kind}`;
    const group = groups.get(key) ?? { kind: item.kind, month, date: item.date, totals: new Map() };
    if (item.date > group.date) group.date = item.date;
    for (const line of item.lines) {
      const total = group.totals.get(line.role) ?? { debit: ZERO, credit: ZERO };
      group.totals.set(line.role, { debit: addDecimal(total.debit, line.debit), credit: addDecimal(total.credit, line.credit) });
    }
    groups.set(key, group);
  }
  const roleOrder: readonly FinancedSaleAccountRole[] = ["bank", "financier_commission", "exchange_loss", "financier_receivable", "sales", "exchange_gain"];
  return Object.freeze([...groups.values()]
    .sort((left, right) => left.month.localeCompare(right.month) || (left.kind === right.kind ? 0 : left.kind === "sale" ? -1 : 1))
    .map((group) => entry(`${group.kind}:${group.month}`, group.kind, group.date, describe(group.kind, group.month), roleOrder.flatMap((role) => {
      const total = group.totals.get(role);
      if (!total) return [];
      // Opposite-side amounts for one role net out so a summary line keeps a single side.
      const net = subtractDecimal(total.debit, total.credit);
      return compareDecimal(net, ZERO) >= 0 ? [debit(role, net)] : [credit(role, subtractDecimal(ZERO, net))];
    }))));
}

function applyCollection(
  terms: FinancedSaleTerms,
  collection: FinancedSaleCollection,
  outstandingUsd: ExactDecimal,
  outstandingCarriedVes: ExactDecimal,
): FinancedSaleCollectionSettlement {
  const collectedOn = salesDate(collection.collectedOn);
  const receivedVes = positive(collection.receivedVes, "Collection amount must be positive.", "SALES_FINANCED_COLLECTION_INVALID");
  const commissionVes = collection.commissionVes === undefined ? ZERO : exactDecimal(collection.commissionVes);
  if (compareDecimal(commissionVes, ZERO) < 0 || compareDecimal(commissionVes, receivedVes) >= 0) {
    throw collectionInvalid("Commission must be at least zero and below the collected amount.");
  }
  if (collectedOn < terms.saleDate) throw collectionInvalid("A collection cannot precede its sale.");
  if (compareDecimal(outstandingUsd, ZERO) <= 0) throw collectionInvalid("The financed balance is already settled.");

  let appliedUsd = outstandingUsd;
  let carriedVes = outstandingCarriedVes;
  if (collection.vesPerUsd !== undefined) {
    const rate = positive(collection.vesPerUsd, "Collection rate must be positive.", "SALES_FINANCED_COLLECTION_INVALID");
    const convertedUsd = quantizeDecimal(divideDecimal(receivedVes, rate), { scale: USD_SCALE, mode: "half_up" });
    const excess = subtractDecimal(convertedUsd, outstandingUsd);
    if (compareDecimal(excess, USD_SETTLEMENT_TOLERANCE) > 0) throw collectionInvalid("Collection exceeds the outstanding financed balance.");
    if (compareDecimal(subtractDecimal(outstandingUsd, convertedUsd), USD_SETTLEMENT_TOLERANCE) > 0) {
      appliedUsd = convertedUsd;
      carriedVes = ves(multiplyDecimal(convertedUsd, terms.saleVesPerUsd));
      if (compareDecimal(carriedVes, outstandingCarriedVes) > 0) carriedVes = outstandingCarriedVes;
    }
  }

  const settlesBalance = appliedUsd === outstandingUsd;
  const exchangeDifference = subtractDecimal(receivedVes, carriedVes);
  const comparison = compareDecimal(exchangeDifference, ZERO);
  return Object.freeze({
    collectedOn,
    receivedVes,
    commissionVes,
    appliedUsd,
    carriedVes,
    impliedVesPerUsd: quantizeDecimal(divideDecimal(receivedVes, appliedUsd), { scale: RATE_SCALE, mode: "half_up" }),
    exchangeDifference,
    direction: comparison === 0 ? "none" : comparison > 0 ? "gain" : "loss",
    settlesBalance,
  });
}

function validateTerms(terms: FinancedSaleTerms): FinancedSaleTerms {
  const reference = terms.reference.trim();
  if (!reference || reference.length > 128) throw termsInvalid("Financed sale reference is invalid.");
  const upfrontPercent = exactDecimal(terms.upfrontPercent);
  if (compareDecimal(upfrontPercent, ZERO) < 0 || compareDecimal(upfrontPercent, HUNDRED) >= 0) {
    throw termsInvalid("Upfront percentage must be at least 0 and below 100.");
  }
  return Object.freeze({
    reference,
    saleDate: salesDate(terms.saleDate),
    saleAmountVes: ves(positive(terms.saleAmountVes, "Sale amount must be positive.", "SALES_FINANCED_SALE_INVALID")),
    upfrontPercent,
    saleVesPerUsd: positive(terms.saleVesPerUsd, "Sale rate must be positive.", "SALES_FINANCED_SALE_INVALID"),
  });
}

function positive(value: ExactDecimal, message: string, code: "SALES_FINANCED_SALE_INVALID" | "SALES_FINANCED_COLLECTION_INVALID"): ExactDecimal {
  const decimal = exactDecimal(value);
  if (compareDecimal(decimal, ZERO) <= 0) throw new SalesFailure(code, message);
  return decimal;
}

function ves(value: ExactDecimal): ExactDecimal {
  return quantizeDecimal(value, { scale: VES_SCALE, mode: "half_up" });
}

function entry(key: string, kind: FinancedSaleJournalEntry["kind"], date: SalesDate, description: string, lines: readonly FinancedSaleJournalLine[]): FinancedSaleJournalEntry {
  return Object.freeze({ key, kind, date, description, lines: Object.freeze(lines.filter((line) => compareDecimal(line.debit, ZERO) !== 0 || compareDecimal(line.credit, ZERO) !== 0)) });
}

function debit(role: FinancedSaleAccountRole, amount: ExactDecimal): FinancedSaleJournalLine {
  return Object.freeze({ role, debit: amount, credit: ZERO });
}

function credit(role: FinancedSaleAccountRole, amount: ExactDecimal): FinancedSaleJournalLine {
  return Object.freeze({ role, debit: ZERO, credit: amount });
}

function termsInvalid(message: string): SalesFailure {
  return new SalesFailure("SALES_FINANCED_SALE_INVALID", message);
}

function collectionInvalid(message: string): SalesFailure {
  return new SalesFailure("SALES_FINANCED_COLLECTION_INVALID", message);
}
