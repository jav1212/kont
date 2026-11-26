import {
  addDecimal,
  compareDecimal,
  exactDecimal,
  negateDecimal,
  subtractDecimal,
  type ExactDecimal,
} from "@kontave/monetary/domain";
import {
  SalesFailure,
  exchangeDifferencePercentOf,
  salesDate,
  valueForeignCurrencyCollection,
  type ForeignCurrencyCollectionCurrency,
  type ForeignCurrencyCollectionValuation,
  type SalesDate,
} from "../domain";
import type { UsdVesRateHistory, UsdVesRatePoint } from "./financed-sales-exchange-difference-report";

/** One foreign-currency collection: a row of the IGTF perception report or of the collections template. */
export interface ForeignCurrencyCollectionLine {
  readonly reference: string;
  readonly collectedOn: SalesDate;
  /** Dollars collected, or their bolivar equivalent at the rate of the day (the IGTF base). */
  readonly amount: ExactDecimal;
  readonly currency: ForeignCurrencyCollectionCurrency;
  /** IGTF perceived on the day; informative only. */
  readonly igtfVes?: ExactDecimal;
  /** Overrides the official rate of the collection date. */
  readonly vesPerUsd?: ExactDecimal;
  /** Overrides the payment date derived from the payment term. */
  readonly paidOn?: SalesDate;
}

/** Result for one submitted day; failures are reported per row instead of aborting the report. */
export type ForeignCurrencyCollectionReportRow =
  | {
    readonly status: "calculated";
    readonly line: ForeignCurrencyCollectionLine;
    readonly valuation: ForeignCurrencyCollectionValuation;
    readonly rateSource: "official" | "override";
    /** Payment date applied before capping it at the cut-off. */
    readonly scheduledPaidOn: SalesDate;
    /** Whether the payment falls after the cut-off, so the row is valued at the cut-off. */
    readonly provisional: boolean;
  }
  | { readonly status: "failed"; readonly line: ForeignCurrencyCollectionLine; readonly reason: string };

/** Totals for one calendar month of collections; amounts are bolivars unless named USD. */
export interface ForeignCurrencyCollectionsMonthTotals {
  /** `YYYY-MM` of the collections. */
  readonly month: string;
  readonly days: number;
  readonly bookedVes: ExactDecimal;
  readonly igtfVes: ExactDecimal;
  readonly collectedUsd: ExactDecimal;
  /** Whether any of its days is valued at the cut-off because it was not yet paid. */
  readonly provisional: boolean;
  readonly paymentVes: ExactDecimal;
  readonly gainVes: ExactDecimal;
  readonly lossVes: ExactDecimal;
  /** Net exchange difference as a percentage of the bolivars booked for the calculated rows. */
  readonly exchangeDifferencePercent: ExactDecimal;
}

/** Complete exchange-difference report of foreign currency collected. */
export interface ForeignCurrencyCollectionsExchangeDifferenceReport {
  /** Days between each collection and the payment of its dollars, unless a line overrides it. */
  readonly paymentTermDays: number;
  readonly rows: readonly ForeignCurrencyCollectionReportRow[];
  /** Months with collections, ascending. */
  readonly months: readonly ForeignCurrencyCollectionsMonthTotals[];
  readonly totals: Omit<ForeignCurrencyCollectionsMonthTotals, "month" | "provisional">;
}

const ZERO = exactDecimal("0");
/** Covers weekends and holidays before the first collection, when BCV does not publish. */
const RATE_LOOKBACK_DAYS = 10;
/** Usual term between collecting dollars and paying invoices with them. */
export const DEFAULT_FOREIGN_CURRENCY_PAYMENT_TERM_DAYS = 7;

/**
 * Builds the exchange difference of foreign currency collected at the counter
 * and later paid out: each day is booked at the official rate of its date and
 * valued at the official rate in effect on the payment date, which is the
 * collection date plus a payment term unless the line sets its own. A payment
 * after `asOf` is valued provisionally at `asOf`.
 */
export class BuildForeignCurrencyCollectionsExchangeDifferenceReport {
  /**
   * Creates the report use case.
   * @param rates - Historical official USD rate source.
   */
  constructor(private readonly rates: UsdVesRateHistory) {}

  /**
   * Values every submitted day and aggregates months and totals. Rates are
   * fetched once for the whole range.
   * @param lines - Daily collections; references should be unique.
   * @param asOf - Cut-off date; later collections fail and later payments are valued here.
   * @param paymentTermDays - Days from collection to payment for lines without their own payment date.
   * @returns The report; rows that cannot be calculated carry a failure reason.
   * @throws {SalesFailure} `SALES_FINANCED_COLLECTION_INVALID` when the term is not a non-negative integer;
   * `SALES_REPOSITORY_UNAVAILABLE` when the rate source fails.
   */
  async execute(
    lines: readonly ForeignCurrencyCollectionLine[],
    asOf: SalesDate,
    paymentTermDays: number = DEFAULT_FOREIGN_CURRENCY_PAYMENT_TERM_DAYS,
  ): Promise<ForeignCurrencyCollectionsExchangeDifferenceReport> {
    if (!Number.isInteger(paymentTermDays) || paymentTermDays < 0) {
      throw new SalesFailure("SALES_FINANCED_COLLECTION_INVALID", "Payment term must be a non-negative whole number of days.");
    }
    const cutOff = salesDate(asOf);
    const paymentOf = (line: ForeignCurrencyCollectionLine) => line.paidOn ?? addDays(line.collectedOn, paymentTermDays);
    const rateOn = await this.loadRates(lines, cutOff, paymentOf);
    const rows = lines.map((line) => calculateRow(line, cutOff, paymentOf(line), rateOn));
    const months = monthTotals(rows);
    return Object.freeze({ paymentTermDays, rows: Object.freeze(rows), months, totals: sumTotals(months) });
  }

  private async loadRates(
    lines: readonly ForeignCurrencyCollectionLine[],
    asOf: SalesDate,
    paymentOf: (line: ForeignCurrencyCollectionLine) => SalesDate,
  ): Promise<(date: SalesDate) => ExactDecimal | null> {
    const first = lines.map((line) => line.collectedOn).sort()[0];
    const last = lines.map(paymentOf).sort().at(-1);
    if (!first || !last || first > asOf) return () => null;
    let points: readonly UsdVesRatePoint[];
    try {
      points = await this.rates.ratesBetween(addDays(first, -RATE_LOOKBACK_DAYS), minDate(last, asOf));
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

function calculateRow(
  line: ForeignCurrencyCollectionLine,
  asOf: SalesDate,
  paidOn: SalesDate,
  rateOn: (date: SalesDate) => ExactDecimal | null,
): ForeignCurrencyCollectionReportRow {
  try {
    if (line.collectedOn > asOf) return { status: "failed", line, reason: "La fecha es posterior al corte." };
    if (paidOn < line.collectedOn) return { status: "failed", line, reason: "La fecha de pago es anterior al cobro." };
    const vesPerUsd = line.vesPerUsd ?? rateOn(line.collectedOn);
    if (vesPerUsd === null) return { status: "failed", line, reason: "No hay tasa oficial para la fecha del cobro." };
    const valuedOn = minDate(paidOn, asOf);
    const paymentRate = rateOn(valuedOn);
    if (paymentRate === null) return { status: "failed", line, reason: "No hay tasa oficial para la fecha de pago." };
    const valuation = valueForeignCurrencyCollection(
      { reference: line.reference, collectedOn: line.collectedOn, amount: line.amount, currency: line.currency, vesPerUsd },
      valuedOn,
      paymentRate,
    );
    return {
      status: "calculated",
      line,
      valuation,
      rateSource: line.vesPerUsd === undefined ? "official" : "override",
      scheduledPaidOn: paidOn,
      provisional: valuedOn < paidOn,
    };
  } catch (error) {
    if (error instanceof SalesFailure) return { status: "failed", line, reason: error.message };
    throw error;
  }
}

function monthTotals(rows: readonly ForeignCurrencyCollectionReportRow[]): readonly ForeignCurrencyCollectionsMonthTotals[] {
  const months = new Map<string, Mutable<ForeignCurrencyCollectionsMonthTotals>>();
  for (const row of rows) {
    const key = row.line.collectedOn.slice(0, 7);
    let month = months.get(key);
    if (!month) {
      month = { month: key, provisional: false, ...emptyTotals() };
      months.set(key, month);
    }
    month.days += 1;
    if (row.line.igtfVes) month.igtfVes = addDecimal(month.igtfVes, row.line.igtfVes);
    if (row.status !== "calculated") {
      // A failed bolivar row still counts towards the booked base; a dollar row has no rate to book it.
      if (row.line.currency === "VES") month.bookedVes = addDecimal(month.bookedVes, row.line.amount);
      continue;
    }
    const valuation = row.valuation;
    month.bookedVes = addDecimal(month.bookedVes, valuation.bookedVes);
    month.provisional ||= row.provisional;
    month.collectedUsd = addDecimal(month.collectedUsd, valuation.collectedUsd);
    month.paymentVes = addDecimal(month.paymentVes, valuation.paymentVes);
    if (compareDecimal(valuation.exchangeDifference, ZERO) > 0) month.gainVes = addDecimal(month.gainVes, valuation.exchangeDifference);
    else month.lossVes = addDecimal(month.lossVes, negateDecimal(valuation.exchangeDifference));
  }
  return Object.freeze([...months.values()]
    .sort((left, right) => left.month.localeCompare(right.month))
    .map((item) => Object.freeze({ ...item, exchangeDifferencePercent: netPercent(item) })));
}

function sumTotals(months: readonly ForeignCurrencyCollectionsMonthTotals[]): ForeignCurrencyCollectionsExchangeDifferenceReport["totals"] {
  const totals = months.reduce((total, item) => ({
    ...total,
    days: total.days + item.days,
    bookedVes: addDecimal(total.bookedVes, item.bookedVes),
    igtfVes: addDecimal(total.igtfVes, item.igtfVes),
    collectedUsd: addDecimal(total.collectedUsd, item.collectedUsd),
    paymentVes: addDecimal(total.paymentVes, item.paymentVes),
    gainVes: addDecimal(total.gainVes, item.gainVes),
    lossVes: addDecimal(total.lossVes, item.lossVes),
  }), emptyTotals());
  return Object.freeze({ ...totals, exchangeDifferencePercent: netPercent(totals) });
}

/**
 * The booked bolivars of failed rows have no valuation, so the base is the
 * payment value of the calculated rows minus their net difference.
 */
function netPercent(totals: Pick<ForeignCurrencyCollectionsMonthTotals, "paymentVes" | "gainVes" | "lossVes">): ExactDecimal {
  const net = subtractDecimal(totals.gainVes, totals.lossVes);
  return exchangeDifferencePercentOf(net, subtractDecimal(totals.paymentVes, net));
}

function emptyTotals(): ForeignCurrencyCollectionsExchangeDifferenceReport["totals"] {
  return { days: 0, bookedVes: ZERO, igtfVes: ZERO, collectedUsd: ZERO, paymentVes: ZERO, gainVes: ZERO, lossVes: ZERO, exchangeDifferencePercent: ZERO };
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
