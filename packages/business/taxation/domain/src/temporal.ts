import { TaxationFailure } from "./taxation-failure";

declare const taxationDateBrand: unique symbol;
export type TaxationDate = string & { readonly [taxationDateBrand]: true };

/**
 * Validates and brands a real local taxation date.
 * @param value - Date in `YYYY-MM-DD` format.
 * @returns The unchanged branded date.
 * @throws {TaxationFailure} When malformed or impossible.
 */
export function taxationDate(value: string): TaxationDate {
  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) throw new TaxationFailure("TAXATION_DATE_INVALID", "Taxation date must use YYYY-MM-DD.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new TaxationFailure("TAXATION_DATE_INVALID", "Taxation date is invalid.");
  }
  return normalized as TaxationDate;
}

/**
 * Tests whether a date belongs to an inclusive effective interval.
 * @param from - Inclusive interval start.
 * @param to - Inclusive interval end, or `null` for an open interval.
 * @param date - Date to test.
 * @returns Whether the interval includes the date.
 */
export function includesDate(from: TaxationDate, to: TaxationDate | null, date: TaxationDate): boolean {
  return from <= date && (to === null || date <= to);
}

/**
 * Tests whether two inclusive effective intervals overlap.
 * @param leftFrom - First interval start.
 * @param leftTo - First interval end, or `null` when open.
 * @param rightFrom - Second interval start.
 * @param rightTo - Second interval end, or `null` when open.
 * @returns Whether the intervals overlap.
 */
export function rangesOverlap(leftFrom: TaxationDate, leftTo: TaxationDate | null, rightFrom: TaxationDate, rightTo: TaxationDate | null): boolean {
  return (leftTo === null || rightFrom <= leftTo) && (rightTo === null || leftFrom <= rightTo);
}
