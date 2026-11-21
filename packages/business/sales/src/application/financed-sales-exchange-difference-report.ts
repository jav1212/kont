import {
  addDecimal,
  compareDecimal,
  exactDecimal,
  multiplyDecimal,
  quantizeDecimal,
  type ExactDecimal,
} from "@kontave/monetary/domain";
import {
  SalesFailure,
  financedSaleJournalEntries,
  salesDate,
  settleFinancedSale,
  summarizeFinancedSaleJournalByMonth,
  type FinancedSaleCollection,
  type FinancedSaleJournalEntry,
  type FinancedSaleSettlement,
  type SalesDate,
} from "../domain";

/** Published VES-per-USD rate and the date it takes effect. */
export interface UsdVesRatePoint {
  readonly effectiveDate: SalesDate;
  readonly vesPerUsd: ExactDecimal;
}

/** Read-only source of historical official USD rates. */
export interface UsdVesRateHistory {
  /**
   * Lists every published rate whose effective date falls within the range.
   * @param start - First date, inclusive.
   * @param end - Last date, inclusive.
   * @returns Rate points in any order; days without publication are simply absent.
   * @throws {Error} When the rate source cannot be reached.
   */
  ratesBetween(start: SalesDate, end: SalesDate): Promise<readonly UsdVesRatePoint[]>;
}

/** One financed sale submitted for the report, usually a daily total. */
export interface FinancedSaleReportLine {
  readonly reference: string;
  readonly saleDate: SalesDate;
  readonly saleAmountVes: ExactDecimal;
  /** Overrides the report-wide upfront percentage. */
  readonly upfrontPercent?: ExactDecimal;
  /** Overrides the official rate of the sale date. */
  readonly saleVesPerUsd?: ExactDecimal;
  /** Actual financier deposits; when empty, the report may estimate one. */
  readonly collections?: readonly FinancedSaleCollection[];
}

/** Report-wide assumptions. */
export interface FinancedSalesReportPolicy {
  readonly upfrontPercent: ExactDecimal;
  /** Days after the sale on which the financier is assumed to settle when no deposit is given. */
  readonly estimatedSettlementDays: number;
  /** Estimated settlements after this date stay outstanding. */
  readonly asOf: SalesDate;
}

/** Where the figures of a report row come from. */
export type FinancedSaleCollectionMode = "actual" | "estimated" | "pending";

/** Result for one submitted sale; failures are reported per row instead of aborting the report. */
export type FinancedSaleReportRow =
  | {
    readonly status: "calculated";
    readonly line: FinancedSaleReportLine;
    readonly settlement: FinancedSaleSettlement;
    readonly saleRateSource: "official" | "override";
    readonly collectionMode: FinancedSaleCollectionMode;
  }
  | { readonly status: "failed"; readonly line: FinancedSaleReportLine; readonly reason: string };

/** Totals for one calendar month. */
export interface FinancedSalesMonthTotals {
  /** `YYYY-MM`. */
  readonly month: string;
  readonly saleAmountVes: ExactDecimal;
  readonly upfrontVes: ExactDecimal;
  readonly financedVes: ExactDecimal;
  /** Bolivars collected during the month. */
  readonly collectedVes: ExactDecimal;
  /** Exchange difference realized by collections dated in the month. */
  readonly realizedGainVes: ExactDecimal;
  readonly realizedLossVes: ExactDecimal;
  /** Historical VES still receivable from sales of the month. */
  readonly outstandingCarriedVes: ExactDecimal;
}

/** Complete financed-sales exchange-difference report. */
export interface FinancedSalesExchangeDifferenceReport {
  readonly rows: readonly FinancedSaleReportRow[];
  /** Months that have sales or collections, in ascending order. */
  readonly months: readonly FinancedSalesMonthTotals[];
  readonly totals: Omit<FinancedSalesMonthTotals, "month">;
}

/** Selection of report rows that become journal entries. */
export interface FinancedSalesJournalOptions {
  /** `daily` keeps one entry per sale and collection; `monthly` summarizes them by month and kind. */
  readonly granularity: "daily" | "monthly";
  /**
   * Whether estimated collections produce entries. They are projections, not bank
   * facts, so they are normally excluded from the books.
   */
  readonly includeEstimated: boolean;
  /** Builds the description of a monthly summary entry. */
  readonly describeMonth: (kind: FinancedSaleJournalEntry["kind"], month: string) => string;
}

const ZERO = exactDecimal("0");
/** Covers weekends and holidays before the first sale, when BCV does not publish. */
const RATE_LOOKBACK_DAYS = 10;

/**
 * Builds the realized exchange-difference report for sales financed by a third
 * party. Each sale is valued at the official rate effective on its date; a sale
 * without deposits is settled at the official rate `estimatedSettlementDays`
 * later, unless that date is after `asOf`.
 */
export class BuildFinancedSalesExchangeDifferenceReport {
  /**
   * Creates the report use case.
   * @param rates - Historical official USD rate source.
   */
  constructor(private readonly rates: UsdVesRateHistory) {}

  /**
   * Calculates every submitted sale and aggregates months, totals and journals.
   * Rates are fetched once for the whole date range.
   * @param lines - Financed sales; references should be unique for readable journals.
   * @param policy - Upfront percentage, estimate horizon and cut-off date.
   * @returns The report; rows that cannot be calculated carry a failure reason.
   * @throws {SalesFailure} `SALES_FINANCED_SALE_INVALID` when the policy is invalid, or
   * `SALES_REPOSITORY_UNAVAILABLE` when the rate source fails.
   */
  async execute(
    lines: readonly FinancedSaleReportLine[],
    policy: FinancedSalesReportPolicy,
  ): Promise<FinancedSalesExchangeDifferenceReport> {
    if (!Number.isInteger(policy.estimatedSettlementDays) || policy.estimatedSettlementDays < 0 || policy.estimatedSettlementDays > 365) {
      throw new SalesFailure("SALES_FINANCED_SALE_INVALID", "Estimated settlement days must be between 0 and 365.");
    }
    const asOf = salesDate(policy.asOf);
    const rateOn = await this.loadRates(lines, policy.estimatedSettlementDays, asOf);
    const rows = lines.map((line) => calculateRow(line, policy, asOf, rateOn));
    const settlements = rows.flatMap((row) => row.status === "calculated" ? [row.settlement] : []);
    const months = monthTotals(settlements);
    return Object.freeze({ rows: Object.freeze(rows), months, totals: sumTotals(months) });
  }

  private async loadRates(lines: readonly FinancedSaleReportLine[], settlementDays: number, asOf: SalesDate): Promise<(date: SalesDate) => ExactDecimal | null> {
    const dates = lines.map((line) => line.saleDate).sort();
    const first = dates[0];
    const last = dates[dates.length - 1];
    if (!first || !last) return () => null;
    const end = minDate(addDays(last, settlementDays), asOf);
    let points: readonly UsdVesRatePoint[];
    try {
      points = await this.rates.ratesBetween(addDays(first, -RATE_LOOKBACK_DAYS), end < first ? first : end);
    } catch (cause) {
      throw new SalesFailure("SALES_REPOSITORY_UNAVAILABLE", "Official exchange rates are unavailable.", { cause });
    }
    const sorted = [...points].sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate));
    // The applicable rate is the latest one already in effect on the requested date.
    return (date) => {
      let found: ExactDecimal | null = null;
      for (const point of sorted) {
        if (point.effectiveDate > date) break;
        found = point.vesPerUsd;
      }
      return found;
    };
  }
}

/**
 * Builds the proposed journal of a report: every sale entry plus the collection
 * entries allowed by the options, in chronological order (sales first on a tie).
 * @param rows - Rows of a calculated report; failed rows are ignored.
 * @param options - Granularity, estimated-collection policy and summary descriptions.
 * @returns Balanced entries with stable keys for idempotent export.
 */
export function buildFinancedSalesJournal(
  rows: readonly FinancedSaleReportRow[],
  options: FinancedSalesJournalOptions,
): readonly FinancedSaleJournalEntry[] {
  const daily = rows.flatMap((row) => {
    if (row.status !== "calculated") return [];
    const entries = financedSaleJournalEntries(row.settlement);
    return row.collectionMode === "estimated" && !options.includeEstimated ? entries.filter((entry) => entry.kind === "sale") : entries;
  }).sort((left, right) => left.date.localeCompare(right.date) || (left.kind === right.kind ? 0 : left.kind === "sale" ? -1 : 1));
  return options.granularity === "daily" ? Object.freeze(daily) : summarizeFinancedSaleJournalByMonth(daily, options.describeMonth);
}

function calculateRow(
  line: FinancedSaleReportLine,
  policy: FinancedSalesReportPolicy,
  asOf: SalesDate,
  rateOn: (date: SalesDate) => ExactDecimal | null,
): FinancedSaleReportRow {
  try {
    const saleVesPerUsd = line.saleVesPerUsd ?? rateOn(line.saleDate);
    if (saleVesPerUsd === null) return { status: "failed", line, reason: "No hay tasa oficial para la fecha de la venta." };
    const terms = {
      reference: line.reference,
      saleDate: line.saleDate,
      saleAmountVes: line.saleAmountVes,
      upfrontPercent: line.upfrontPercent ?? policy.upfrontPercent,
      saleVesPerUsd,
    };
    const saleRateSource = line.saleVesPerUsd === undefined ? "official" as const : "override" as const;
    if (line.collections && line.collections.length > 0) {
      return { status: "calculated", line, settlement: settleFinancedSale(terms, line.collections), saleRateSource, collectionMode: "actual" };
    }
    const settlementDate = addDays(line.saleDate, policy.estimatedSettlementDays);
    const unsettled = settleFinancedSale(terms);
    if (settlementDate > asOf) return { status: "calculated", line, settlement: unsettled, saleRateSource, collectionMode: "pending" };
    const settlementRate = rateOn(settlementDate);
    if (settlementRate === null) return { status: "failed", line, reason: "No hay tasa oficial para la fecha estimada de cobro." };
    const receivedVes = quantizeDecimal(multiplyDecimal(unsettled.financedUsd, settlementRate), { scale: 2, mode: "half_up" });
    const settlement = settleFinancedSale(terms, [{ collectedOn: settlementDate, receivedVes }]);
    return { status: "calculated", line, settlement, saleRateSource, collectionMode: "estimated" };
  } catch (error) {
    if (error instanceof SalesFailure) return { status: "failed", line, reason: error.message };
    throw error;
  }
}

function monthTotals(settlements: readonly FinancedSaleSettlement[]): readonly FinancedSalesMonthTotals[] {
  const months = new Map<string, Mutable<FinancedSalesMonthTotals>>();
  const month = (key: string) => {
    const existing = months.get(key);
    if (existing) return existing;
    const created: Mutable<FinancedSalesMonthTotals> = { month: key, ...emptyTotals() };
    months.set(key, created);
    return created;
  };
  for (const settlement of settlements) {
    const sale = month(settlement.terms.saleDate.slice(0, 7));
    sale.saleAmountVes = addDecimal(sale.saleAmountVes, settlement.terms.saleAmountVes);
    sale.upfrontVes = addDecimal(sale.upfrontVes, settlement.upfrontVes);
    sale.financedVes = addDecimal(sale.financedVes, settlement.financedVes);
    sale.outstandingCarriedVes = addDecimal(sale.outstandingCarriedVes, settlement.outstandingCarriedVes);
    for (const collection of settlement.collections) {
      const target = month(collection.collectedOn.slice(0, 7));
      target.collectedVes = addDecimal(target.collectedVes, collection.receivedVes);
      if (compareDecimal(collection.exchangeDifference, ZERO) > 0) target.realizedGainVes = addDecimal(target.realizedGainVes, collection.exchangeDifference);
      else target.realizedLossVes = addDecimal(target.realizedLossVes, multiplyDecimal(collection.exchangeDifference, exactDecimal("-1")));
    }
  }
  return Object.freeze([...months.values()].sort((left, right) => left.month.localeCompare(right.month)).map((item) => Object.freeze(item)));
}

function sumTotals(months: readonly FinancedSalesMonthTotals[]): Omit<FinancedSalesMonthTotals, "month"> {
  return Object.freeze(months.reduce((total, item) => ({
    saleAmountVes: addDecimal(total.saleAmountVes, item.saleAmountVes),
    upfrontVes: addDecimal(total.upfrontVes, item.upfrontVes),
    financedVes: addDecimal(total.financedVes, item.financedVes),
    collectedVes: addDecimal(total.collectedVes, item.collectedVes),
    realizedGainVes: addDecimal(total.realizedGainVes, item.realizedGainVes),
    realizedLossVes: addDecimal(total.realizedLossVes, item.realizedLossVes),
    outstandingCarriedVes: addDecimal(total.outstandingCarriedVes, item.outstandingCarriedVes),
  }), emptyTotals()));
}

function emptyTotals(): Omit<FinancedSalesMonthTotals, "month"> {
  return { saleAmountVes: ZERO, upfrontVes: ZERO, financedVes: ZERO, collectedVes: ZERO, realizedGainVes: ZERO, realizedLossVes: ZERO, outstandingCarriedVes: ZERO };
}

function addDays(date: SalesDate, days: number): SalesDate {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return salesDate(value.toISOString().slice(0, 10));
}

function minDate(left: SalesDate, right: SalesDate): SalesDate {
  return left < right ? left : right;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
