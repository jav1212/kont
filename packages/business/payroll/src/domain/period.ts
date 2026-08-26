import { PayrollFailure } from "./payroll-failure";

export type PayrollFrequency = "weekly" | "biweekly" | "monthly" | "custom";
export interface PayrollPeriod { readonly start: string; readonly end: string; readonly paymentDate: string; readonly frequency: PayrollFrequency; readonly sequence: string; }

/**
 * Validates and normalizes an immutable payroll period.
 * @param input - Period dates, frequency, and business sequence.
 * @returns A normalized copy of the period.
 * @throws {PayrollFailure} When a date is invalid, the range is inverted, or the sequence is empty.
 */
export function payrollPeriod(input: PayrollPeriod): PayrollPeriod {
  for (const value of [input.start, input.end, input.paymentDate]) requireLocalDate(value);
  if (input.start > input.end || !input.sequence.trim()) throw new PayrollFailure("PAYROLL_PERIOD_INVALID", "Payroll period is invalid.");
  return { ...input, sequence: input.sequence.trim() };
}

/**
 * Determines whether a local date belongs to a payroll period, inclusively.
 * @param period - Valid payroll period.
 * @param date - ISO local date to test.
 * @returns `true` when the date falls between the period boundaries.
 * @throws {PayrollFailure} When `date` is not a valid ISO local date.
 */
export function periodContains(period: PayrollPeriod, date: string): boolean { requireLocalDate(date); return date >= period.start && date <= period.end; }

/**
 * Determines whether two payroll periods share at least one date.
 * @param left - First valid payroll period.
 * @param right - Second valid payroll period.
 * @returns `true` when the inclusive date ranges overlap.
 */
export function periodsOverlap(left: PayrollPeriod, right: PayrollPeriod): boolean { return left.start <= right.end && right.start <= left.end; }

/**
 * Asserts the lexical and calendar validity of an ISO local date.
 * @param value - Candidate `YYYY-MM-DD` value.
 * @returns Nothing when the value is valid.
 * @throws {PayrollFailure} When the value is not a valid ISO local date.
 */
export function requireLocalDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new PayrollFailure("PAYROLL_PERIOD_INVALID", `Invalid local date: ${value}`);
}
