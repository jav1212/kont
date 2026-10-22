import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import { CompanyFailure, companyId, type CompanyId } from "./index";

/** Supported display orders for a date-only company value. */
export type CompanyDateOrder = "day_first" | "year_first" | "month_first";

/** Immutable company-owned date display configuration revision. */
export interface CompanyDateFormat {
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly version: number;
  readonly dateOrder: CompanyDateOrder;
  readonly configuredAt: string;
  readonly configuredBy: UserId;
}

/**
 * Validates and normalizes persisted company date-format evidence.
 * @param input - Persisted organization, company, revision, convention, and audit fields.
 * @returns An immutable valid date-format revision.
 * @throws {CompanyFailure} When the scope, revision, convention, or audit evidence is invalid.
 */
export function companyDateFormat(input: CompanyDateFormat): CompanyDateFormat {
  if (!input || typeof input !== "object" || !input.organizationId || !input.configuredBy || !Number.isSafeInteger(input.version) || input.version < 1) {
    invalid("The company date format revision is invalid.");
  }
  const configuredAt = validInstant(input.configuredAt);
  return Object.freeze({
    organizationId: input.organizationId,
    companyId: companyId(input.companyId),
    version: input.version,
    dateOrder: companyDateOrder(input.dateOrder),
    configuredAt,
    configuredBy: input.configuredBy,
  });
}

/**
 * Validates one supported display order.
 * @param value - Candidate persisted or requested order.
 * @returns The supported display order.
 * @throws {CompanyFailure} When the order is outside the portable contract.
 */
export function companyDateOrder(value: CompanyDateOrder): CompanyDateOrder {
  if (value !== "day_first" && value !== "year_first" && value !== "month_first") {
    invalid("The company date order is invalid.");
  }
  return value;
}

/**
 * Formats a strict ISO calendar date without converting it through a timezone-aware JavaScript Date.
 * @param isoDate - A real Gregorian date using exactly `YYYY-MM-DD`.
 * @param order - Company-owned display order.
 * @returns The zero-padded user-facing calendar date.
 * @throws {CompanyFailure} When the date or display order is invalid.
 */
export function formatCompanyDate(isoDate: string, order: CompanyDateOrder): string {
  const { year, month, day } = parseIsoCalendarDate(isoDate);
  switch (companyDateOrder(order)) {
    case "day_first": return `${day}/${month}/${year}`;
    case "year_first": return `${year}-${month}-${day}`;
    case "month_first": return `${month}/${day}/${year}`;
  }
}

/**
 * Parses an exact company-formatted calendar date into the canonical ISO representation.
 * This function treats the company-owned order as required input, so a visually ambiguous
 * value such as `03/04/2026` is never guessed or interpreted from the runtime locale.
 * @param input - A zero-padded calendar date using the separators required by `order`.
 * @param order - Company-owned display order that defines the component positions.
 * @returns The same real Gregorian calendar day as `YYYY-MM-DD`.
 * @throws {CompanyFailure} When the order, presentation, or Gregorian calendar date is invalid.
 */
export function parseCompanyDate(input: string, order: CompanyDateOrder): string {
  const validatedOrder = companyDateOrder(order);
  if (typeof input !== "string") invalid("The company date input is invalid.");

  const match = validatedOrder === "day_first"
    ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input)
    : validatedOrder === "month_first"
      ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input)
      : /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);

  if (!match) invalid("The company date input does not match its configured order.");

  const [year, month, day] = validatedOrder === "day_first"
    ? [match[3]!, match[2]!, match[1]!]
    : validatedOrder === "month_first"
      ? [match[3]!, match[1]!, match[2]!]
      : [match[1]!, match[2]!, match[3]!];

  parseIsoCalendarDate(`${year}-${month}-${day}`);
  return `${year}-${month}-${day}`;
}

/**
 * Validates a strict ISO date and exposes its zero-padded calendar components.
 * @param isoDate - A `YYYY-MM-DD` date-only value.
 * @returns The original padded Gregorian calendar components.
 * @throws {CompanyFailure} When the input is malformed or is not a real date.
 */
export function parseIsoCalendarDate(isoDate: string): Readonly<{ year: string; month: string; day: string }> {
  if (typeof isoDate !== "string") invalid("The date must use the YYYY-MM-DD calendar format.");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) invalid("The date must use the YYYY-MM-DD calendar format.");
  const year = match![1]!;
  const month = match![2]!;
  const day = match![3]!;
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  if (numericYear < 1 || numericMonth < 1 || numericMonth > 12 || numericDay < 1 || numericDay > daysInMonth(numericYear, numericMonth)) {
    invalid("The date is not a real Gregorian calendar date.");
  }
  return Object.freeze({ year, month, day });
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function validInstant(value: string): string {
  if (!Number.isFinite(Date.parse(value))) invalid("The date-format audit timestamp is invalid.");
  return value;
}

function invalid(message: string): never { throw new CompanyFailure("COMPANY_DATE_FORMAT_INVALID", message); }
