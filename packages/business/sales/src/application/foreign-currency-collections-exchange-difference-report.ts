import {
  addDecimal,
  compareDecimal,
  exactDecimal,
  negateDecimal,
  type ExactDecimal,
} from "@kontave/monetary/domain";
import {
  SalesFailure,
  monthEndOf,
  salesDate,
  valueForeignCurrencyCollection,
  type ForeignCurrencyCollectionValuation,
  type SalesDate,
} from "../domain";
import type { UsdVesRateHistory, UsdVesRatePoint } from "./financed-sales-exchange-difference-report";

/** One day of foreign currency collected, usually a row of the IGTF perception report. */
export interface ForeignCurrencyCollectionLine {
  readonly reference: string;
  readonly collectedOn: SalesDate;
  /** Bolivar equivalent booked for the day (the IGTF base). */
  readonly bookedVes: ExactDecimal;
  /** IGTF perceived on the day; informative only. */
  readonly igtfVes?: ExactDecimal;
  /** Overrides the official rate of the collection date. */
  readonly vesPerUsd?: ExactDecimal;
}

/** Result for one submitted day; failures are reported per row instead of aborting the report. */
export type ForeignCurrencyCollectionReportRow =
  | {
    readonly status: "calculated";
    readonly line: ForeignCurrencyCollectionLine;
    readonly valuation: ForeignCurrencyCollectionValuation;
    readonly rateSource: "official" | "override";
  }
  | { readonly status: "failed"; readonly line: ForeignCurrencyCollectionLine; readonly reason: string };

/** Totals for one calendar month. */
export interface ForeignCurrencyCollectionsMonthTotals {
  /** `YYYY-MM`. */
  readonly month: string;
  readonly days: number;
  readonly bookedVes: ExactDecimal;
  readonly igtfVes: ExactDecimal;
  readonly collectedUsd: ExactDecimal;
  /** Month end, or the cut-off when the month has not ended. */
  readonly closingDate: SalesDate | null;
  readonly closingVesPerUsd: ExactDecimal | null;
  /** Whether the month had not ended at the cut-off, so its close is not final. */
  readonly provisional: boolean;
  readonly closingVes: ExactDecimal;
  readonly gainVes: ExactDecimal;
  readonly lossVes: ExactDecimal;
}

/** Complete exchange-difference report of foreign currency collected. */
export interface ForeignCurrencyCollectionsExchangeDifferenceReport {
  readonly rows: readonly ForeignCurrencyCollectionReportRow[];
  /** Months with collections, ascending. */
  readonly months: readonly ForeignCurrencyCollectionsMonthTotals[];
  readonly totals: Omit<ForeignCurrencyCollectionsMonthTotals, "month" | "closingDate" | "closingVesPerUsd" | "provisional">;
}

const ZERO = exactDecimal("0");
/** Covers weekends and holidays before the first collection, when BCV does not publish. */
const RATE_LOOKBACK_DAYS = 10;

/**
 * Builds the exchange difference of foreign currency collected at the counter,
 * assuming the dollars of each day are used within the month: each day is
 * booked at the official rate of its date and valued at the official rate in
 * effect at the month close. A month that has not ended at `asOf` closes
 * provisionally at `asOf`.
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
   * @param asOf - Cut-off date; later collections fail and an open month closes here.
   * @returns The report; rows that cannot be calculated carry a failure reason.
   * @throws {SalesFailure} `SALES_REPOSITORY_UNAVAILABLE` when the rate source fails.
   */
  async execute(
    lines: readonly ForeignCurrencyCollectionLine[],
    asOf: SalesDate,
  ): Promise<ForeignCurrencyCollectionsExchangeDifferenceReport> {
    const cutOff = salesDate(asOf);
    const rateOn = await this.loadRates(lines, cutOff);
    const closingOf = (date: SalesDate) => minDate(monthEndOf(date), cutOff);
    const rows = lines.map((line) => calculateRow(line, cutOff, closingOf, rateOn));
    const months = monthTotals(rows, cutOff, closingOf, rateOn);
    return Object.freeze({ rows: Object.freeze(rows), months, totals: sumTotals(months) });
  }

  private async loadRates(lines: readonly ForeignCurrencyCollectionLine[], asOf: SalesDate): Promise<(date: SalesDate) => ExactDecimal | null> {
    const dates = lines.map((line) => line.collectedOn).sort();
    const first = dates[0];
    const last = dates[dates.length - 1];
    if (!first || !last || first > asOf) return () => null;
    let points: readonly UsdVesRatePoint[];
    try {
      points = await this.rates.ratesBetween(addDays(first, -RATE_LOOKBACK_DAYS), minDate(monthEndOf(last), asOf));
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
  closingOf: (date: SalesDate) => SalesDate,
  rateOn: (date: SalesDate) => ExactDecimal | null,
): ForeignCurrencyCollectionReportRow {
  try {
    if (line.collectedOn > asOf) return { status: "failed", line, reason: "La fecha es posterior al corte." };
    const vesPerUsd = line.vesPerUsd ?? rateOn(line.collectedOn);
    if (vesPerUsd === null) return { status: "failed", line, reason: "No hay tasa oficial para la fecha del cobro." };
    const closingDate = closingOf(line.collectedOn);
    const closingRate = rateOn(closingDate);
    if (closingRate === null) return { status: "failed", line, reason: "No hay tasa oficial para el cierre del mes." };
    const valuation = valueForeignCurrencyCollection(
      { reference: line.reference, collectedOn: line.collectedOn, bookedVes: line.bookedVes, vesPerUsd },
      closingDate,
      closingRate,
    );
    return { status: "calculated", line, valuation, rateSource: line.vesPerUsd === undefined ? "official" : "override" };
  } catch (error) {
    if (error instanceof SalesFailure) return { status: "failed", line, reason: error.message };
    throw error;
  }
}

function monthTotals(
  rows: readonly ForeignCurrencyCollectionReportRow[],
  asOf: SalesDate,
  closingOf: (date: SalesDate) => SalesDate,
  rateOn: (date: SalesDate) => ExactDecimal | null,
): readonly ForeignCurrencyCollectionsMonthTotals[] {
  const months = new Map<string, Mutable<ForeignCurrencyCollectionsMonthTotals>>();
  for (const row of rows) {
    const key = row.line.collectedOn.slice(0, 7);
    let month = months.get(key);
    if (!month) {
      const closingDate = row.line.collectedOn > asOf ? null : closingOf(row.line.collectedOn);
      month = {
        month: key,
        closingDate,
        closingVesPerUsd: closingDate ? rateOn(closingDate) : null,
        provisional: closingDate !== null && closingDate < monthEndOf(row.line.collectedOn),
        ...emptyTotals(),
      };
      months.set(key, month);
    }
    month.days += 1;
    month.bookedVes = addDecimal(month.bookedVes, row.line.bookedVes);
    if (row.line.igtfVes) month.igtfVes = addDecimal(month.igtfVes, row.line.igtfVes);
    if (row.status !== "calculated") continue;
    const valuation = row.valuation;
    month.collectedUsd = addDecimal(month.collectedUsd, valuation.collectedUsd);
    month.closingVes = addDecimal(month.closingVes, valuation.closingVes);
    if (compareDecimal(valuation.exchangeDifference, ZERO) > 0) month.gainVes = addDecimal(month.gainVes, valuation.exchangeDifference);
    else month.lossVes = addDecimal(month.lossVes, negateDecimal(valuation.exchangeDifference));
  }
  return Object.freeze([...months.values()].sort((left, right) => left.month.localeCompare(right.month)).map((item) => Object.freeze(item)));
}

function sumTotals(months: readonly ForeignCurrencyCollectionsMonthTotals[]): ForeignCurrencyCollectionsExchangeDifferenceReport["totals"] {
  return Object.freeze(months.reduce((total, item) => ({
    days: total.days + item.days,
    bookedVes: addDecimal(total.bookedVes, item.bookedVes),
    igtfVes: addDecimal(total.igtfVes, item.igtfVes),
    collectedUsd: addDecimal(total.collectedUsd, item.collectedUsd),
    closingVes: addDecimal(total.closingVes, item.closingVes),
    gainVes: addDecimal(total.gainVes, item.gainVes),
    lossVes: addDecimal(total.lossVes, item.lossVes),
  }), emptyTotals()));
}

function emptyTotals(): ForeignCurrencyCollectionsExchangeDifferenceReport["totals"] {
  return { days: 0, bookedVes: ZERO, igtfVes: ZERO, collectedUsd: ZERO, closingVes: ZERO, gainVes: ZERO, lossVes: ZERO };
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
