import {
  compareDecimal,
  divideDecimal,
  exactDecimal,
  multiplyDecimal,
  quantizeDecimal,
  subtractDecimal,
  type ExactDecimal,
} from "@kontave/monetary/domain";
import type { ExchangeDifferenceDirection } from "./financed-sale-exchange-difference";
import { SalesFailure } from "./sales-failure";
import { salesDate, type SalesDate } from "./temporal";

/*
 * Foreign currency collected at the counter (the IGTF perception base) is
 * booked in bolivars at the official rate of the collection date. The dollars
 * are spent within the month, so each day's dollars are valued once at the
 * official rate of the month close and the difference is recognized in that
 * month; nothing is carried into the next month.
 */

const ZERO = exactDecimal("0");
const CENTS = { scale: 2, mode: "half_up" } as const;

/** Foreign currency collected on one day, as booked in bolivars. */
export interface ForeignCurrencyCollection {
  readonly reference: string;
  readonly collectedOn: SalesDate;
  /** Bolivars booked for the collection: USD collected times the rate of the day. */
  readonly bookedVes: ExactDecimal;
  /** Official rate the collection was booked at. */
  readonly vesPerUsd: ExactDecimal;
}

/** Valuation of one day's collection at the month close. */
export interface ForeignCurrencyCollectionValuation {
  readonly collection: ForeignCurrencyCollection;
  /** Dollars collected, rounded to cents. */
  readonly collectedUsd: ExactDecimal;
  readonly closingDate: SalesDate;
  readonly closingVesPerUsd: ExactDecimal;
  /** Dollars valued at the closing rate. */
  readonly closingVes: ExactDecimal;
  /** `closingVes - bookedVes`; positive is a gain. */
  readonly exchangeDifference: ExactDecimal;
  readonly direction: ExchangeDifferenceDirection;
}

/**
 * Values one day's foreign-currency collection at the month-close rate.
 * Dollars are derived from the booked bolivars and rounded to cents, because
 * the booked amount is itself a rounded conversion of whole cents of dollars.
 * @param collection - Collection booked at the rate of its date.
 * @param closingDate - Month close (or report cut-off) the dollars are valued at.
 * @param closingVesPerUsd - Official rate in effect on `closingDate`.
 * @returns The valuation and its exchange difference.
 * @throws {SalesFailure} `SALES_FINANCED_COLLECTION_INVALID` when amounts or rates are not positive,
 * or when the closing date precedes the collection.
 */
export function valueForeignCurrencyCollection(
  collection: ForeignCurrencyCollection,
  closingDate: SalesDate,
  closingVesPerUsd: ExactDecimal,
): ForeignCurrencyCollectionValuation {
  const collectedOn = salesDate(collection.collectedOn);
  const closing = salesDate(closingDate);
  const bookedVes = exactDecimal(collection.bookedVes);
  const rate = exactDecimal(collection.vesPerUsd);
  const closingRate = exactDecimal(closingVesPerUsd);
  if (compareDecimal(bookedVes, ZERO) <= 0) throw invalid("Collected amount must be positive.");
  if (compareDecimal(rate, ZERO) <= 0 || compareDecimal(closingRate, ZERO) <= 0) throw invalid("Exchange rates must be positive.");
  if (closing < collectedOn) throw invalid("Closing date cannot precede the collection.");
  const collectedUsd = quantizeDecimal(divideDecimal(bookedVes, rate), CENTS);
  const closingVes = quantizeDecimal(multiplyDecimal(collectedUsd, closingRate), CENTS);
  const exchangeDifference = subtractDecimal(closingVes, bookedVes);
  const sign = compareDecimal(exchangeDifference, ZERO);
  return Object.freeze({
    collection: Object.freeze({ ...collection, collectedOn, bookedVes, vesPerUsd: rate }),
    collectedUsd,
    closingDate: closing,
    closingVesPerUsd: closingRate,
    closingVes,
    exchangeDifference,
    direction: sign > 0 ? "gain" : sign < 0 ? "loss" : "none",
  });
}

/**
 * Last calendar day of the month of a date.
 * @param date - Any date of the month.
 * @returns The month end.
 */
export function monthEndOf(date: SalesDate): SalesDate {
  const [year, month] = date.split("-").map(Number) as [number, number];
  return salesDate(new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10));
}

function invalid(message: string): SalesFailure {
  return new SalesFailure("SALES_FINANCED_COLLECTION_INVALID", message);
}
