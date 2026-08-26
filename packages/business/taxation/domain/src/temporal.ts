import { TaxationFailure } from "./taxation-failure";

declare const taxationDateBrand: unique symbol;
export type TaxationDate = string & { readonly [taxationDateBrand]: true };

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

export function includesDate(from: TaxationDate, to: TaxationDate | null, date: TaxationDate): boolean {
  return from <= date && (to === null || date <= to);
}

export function rangesOverlap(leftFrom: TaxationDate, leftTo: TaxationDate | null, rightFrom: TaxationDate, rightTo: TaxationDate | null): boolean {
  return (leftTo === null || rightFrom <= leftTo) && (rightTo === null || leftFrom <= rightTo);
}
