import { FiscalFailure } from "./fiscal-failure";

declare const fiscalDateBrand: unique symbol;
declare const fiscalInstantBrand: unique symbol;
export type FiscalDate = string & { readonly [fiscalDateBrand]: true };
export type FiscalInstant = string & { readonly [fiscalInstantBrand]: true };

/**
 * Creates a calendar-valid fiscal date without applying a runtime timezone.
 *
 * @param value - Date encoded as `YYYY-MM-DD`.
 * @returns The validated branded fiscal date.
 * @throws {@link FiscalFailure} When the value is not a real ISO calendar date.
 */
export function fiscalDate(value: string): FiscalDate {
  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) throw new FiscalFailure("FISCAL_DATE_INVALID", "Fiscal date must use YYYY-MM-DD.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new FiscalFailure("FISCAL_DATE_INVALID", "Fiscal date is invalid.");
  }
  return normalized as FiscalDate;
}

/**
 * Creates a fiscal instant from a parseable date-time value.
 *
 * @param value - Date-time text containing an explicit time component.
 * @returns The validated branded fiscal instant.
 * @throws {@link FiscalFailure} When the value is not a parseable date-time.
 */
export function fiscalInstant(value: string): FiscalInstant {
  const normalized = value.trim();
  if (!normalized.includes("T") || Number.isNaN(Date.parse(normalized))) {
    throw new FiscalFailure("FISCAL_DATE_INVALID", "Fiscal instant is invalid.");
  }
  return normalized as FiscalInstant;
}
