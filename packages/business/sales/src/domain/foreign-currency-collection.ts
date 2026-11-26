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
 * Foreign currency collected (for example the IGTF perception base) is booked
 * in bolivars at the official rate of the collection date. The dollars are
 * later spent paying invoices; SENIAT treats the change of the official rate
 * between the collection and the payment as an exchange difference, which may
 * be a gain or a loss.
 */

const ZERO = exactDecimal("0");
const HUNDRED = exactDecimal("100");
const CENTS = { scale: 2, mode: "half_up" } as const;

/** Currency an amount of foreign currency collected was reported in. */
export type ForeignCurrencyCollectionCurrency = "VES" | "USD";

/** Foreign currency collected on one day. */
export interface ForeignCurrencyCollection {
  readonly reference: string;
  readonly collectedOn: SalesDate;
  /**
   * Amount reported for the collection: dollars, or their bolivar equivalent
   * booked at the rate of the day (the IGTF base).
   */
  readonly amount: ExactDecimal;
  readonly currency: ForeignCurrencyCollectionCurrency;
  /** Official rate the collection was booked at. */
  readonly vesPerUsd: ExactDecimal;
}

/** Valuation of one collection on the date its dollars were paid out. */
export interface ForeignCurrencyCollectionValuation {
  readonly collection: ForeignCurrencyCollection;
  /** Dollars collected, rounded to cents. */
  readonly collectedUsd: ExactDecimal;
  /** Bolivars booked at the collection rate, rounded to cents. */
  readonly bookedVes: ExactDecimal;
  /** Date the dollars were valued at: the payment, or the report cut-off when that is earlier. */
  readonly paidOn: SalesDate;
  readonly paymentVesPerUsd: ExactDecimal;
  /** Dollars valued at the payment rate. */
  readonly paymentVes: ExactDecimal;
  /** `paymentVes - bookedVes`; positive is a gain. */
  readonly exchangeDifference: ExactDecimal;
  /** Exchange difference as a percentage of `bookedVes`, rounded to two decimals. */
  readonly exchangeDifferencePercent: ExactDecimal;
  readonly direction: ExchangeDifferenceDirection;
}

/**
 * Values one foreign-currency collection at the official rate of the date its
 * dollars were paid out. A bolivar amount is converted to dollars and rounded
 * to cents, because it is itself a rounded conversion of whole cents of
 * dollars; a dollar amount is booked at the collection rate.
 * @param collection - Collection and the rate of its date.
 * @param paidOn - Date the dollars were paid out (or the report cut-off).
 * @param paymentVesPerUsd - Official rate in effect on `paidOn`.
 * @returns The valuation and its exchange difference.
 * @throws {SalesFailure} `SALES_FINANCED_COLLECTION_INVALID` when amounts or rates are not positive,
 * or when the payment precedes the collection.
 */
export function valueForeignCurrencyCollection(
  collection: ForeignCurrencyCollection,
  paidOn: SalesDate,
  paymentVesPerUsd: ExactDecimal,
): ForeignCurrencyCollectionValuation {
  const collectedOn = salesDate(collection.collectedOn);
  const payment = salesDate(paidOn);
  const amount = exactDecimal(collection.amount);
  const rate = exactDecimal(collection.vesPerUsd);
  const paymentRate = exactDecimal(paymentVesPerUsd);
  if (compareDecimal(amount, ZERO) <= 0) throw invalid("Collected amount must be positive.");
  if (compareDecimal(rate, ZERO) <= 0 || compareDecimal(paymentRate, ZERO) <= 0) throw invalid("Exchange rates must be positive.");
  if (payment < collectedOn) throw invalid("Payment date cannot precede the collection.");
  const inDollars = collection.currency === "USD";
  const collectedUsd = quantizeDecimal(inDollars ? amount : divideDecimal(amount, rate), CENTS);
  const bookedVes = inDollars ? quantizeDecimal(multiplyDecimal(collectedUsd, rate), CENTS) : amount;
  const paymentVes = quantizeDecimal(multiplyDecimal(collectedUsd, paymentRate), CENTS);
  const exchangeDifference = subtractDecimal(paymentVes, bookedVes);
  const sign = compareDecimal(exchangeDifference, ZERO);
  return Object.freeze({
    collection: Object.freeze({ ...collection, collectedOn, amount, vesPerUsd: rate }),
    collectedUsd,
    bookedVes,
    paidOn: payment,
    paymentVesPerUsd: paymentRate,
    paymentVes,
    exchangeDifference,
    exchangeDifferencePercent: exchangeDifferencePercentOf(exchangeDifference, bookedVes),
    direction: sign > 0 ? "gain" : sign < 0 ? "loss" : "none",
  });
}

/**
 * Expresses an exchange difference as a percentage of the bolivars booked.
 * @param difference - Exchange difference in bolivars.
 * @param bookedVes - Bolivars booked; a zero base yields zero.
 * @returns The percentage rounded to two decimals.
 */
export function exchangeDifferencePercentOf(difference: ExactDecimal, bookedVes: ExactDecimal): ExactDecimal {
  if (compareDecimal(bookedVes, ZERO) === 0) return ZERO;
  return quantizeDecimal(multiplyDecimal(divideDecimal(difference, bookedVes), HUNDRED), CENTS);
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
