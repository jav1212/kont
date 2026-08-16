import { PayrollFailure } from "./payroll-failure";

export type PayrollFrequency = "weekly" | "biweekly" | "monthly" | "custom";
export interface PayrollPeriod { readonly start: string; readonly end: string; readonly paymentDate: string; readonly frequency: PayrollFrequency; readonly sequence: string; }

export function payrollPeriod(input: PayrollPeriod): PayrollPeriod {
  for (const value of [input.start, input.end, input.paymentDate]) requireLocalDate(value);
  if (input.start > input.end || !input.sequence.trim()) throw new PayrollFailure("PAYROLL_PERIOD_INVALID", "Payroll period is invalid.");
  return { ...input, sequence: input.sequence.trim() };
}

export function periodContains(period: PayrollPeriod, date: string): boolean { requireLocalDate(date); return date >= period.start && date <= period.end; }
export function periodsOverlap(left: PayrollPeriod, right: PayrollPeriod): boolean { return left.start <= right.end && right.start <= left.end; }
export function requireLocalDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new PayrollFailure("PAYROLL_PERIOD_INVALID", `Invalid local date: ${value}`);
}
