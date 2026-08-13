import { compareDecimal, exactDecimal, type ExactDecimal, type Money } from "@kontave/monetary-domain";
import type { PayrollBalanceCode, PayrollElementCode, PayrollElementEntryId, PayrollRelationshipId } from "./identifiers.js";
import { requireLocalDate } from "./period.js";
import { PayrollFailure } from "./payroll-failure.js";

export type PayrollElementClassification =
  | "regular_earning" | "supplemental_earning" | "employee_deduction" | "employer_contribution" | "tax" | "reimbursement" | "informational";
export type PayrollProcessingPhase = "base_earnings" | "supplemental_earnings" | "taxable_bases" | "employee_deductions" | "employer_contributions" | "net_pay" | "informational";
export type PayrollUnit = "money" | "hours" | "days" | "number";
export type PayrollBalanceDimension = "run" | "period_to_date" | "month_to_date" | "quarter_to_date" | "year_to_date" | "employment_to_date";

export interface PayrollBalanceFeed { readonly balanceCode: PayrollBalanceCode; readonly direction: "add" | "subtract"; readonly resultValue: "amount" | "quantity"; }
export interface PayrollElementDefinition {
  readonly code: PayrollElementCode; readonly name: string; readonly classification: PayrollElementClassification;
  readonly phase: PayrollProcessingPhase; readonly priority: number; readonly unit: PayrollUnit;
  readonly recurrence: "recurring" | "non_recurring"; readonly effectiveFrom: string; readonly effectiveUntil: string | null;
  readonly dependsOn: readonly PayrollElementCode[]; readonly evaluator: PayrollElementEvaluator; readonly balanceFeeds: readonly PayrollBalanceFeed[];
}

export type PayrollElementEvaluator =
  | { readonly kind: "fixed_amount"; readonly amountInput: string }
  | { readonly kind: "quantity_by_rate"; readonly quantityInput: string; readonly rateInput: string }
  | { readonly kind: "percentage_of_element"; readonly elementCode: PayrollElementCode; readonly percentageInput: string }
  | { readonly kind: "sum_elements"; readonly elementCodes: readonly PayrollElementCode[] };

export type PayrollInputValue =
  | { readonly kind: "money"; readonly name: string; readonly value: Money }
  | { readonly kind: "decimal"; readonly name: string; readonly value: ExactDecimal };

export interface PayrollElementEntry {
  readonly id: PayrollElementEntryId; readonly relationshipId: PayrollRelationshipId; readonly elementCode: PayrollElementCode;
  readonly effectiveFrom: string; readonly effectiveUntil: string | null;
  readonly origin: "compensation" | "time" | "absence" | "benefit" | "manual" | "retroactive" | "legislation";
  readonly values: readonly PayrollInputValue[];
}

export function payrollElementDefinition(input: PayrollElementDefinition): PayrollElementDefinition {
  requireLocalDate(input.effectiveFrom); if (input.effectiveUntil) requireLocalDate(input.effectiveUntil);
  if (!input.name.trim() || !Number.isInteger(input.priority) || input.priority < 0 || (input.effectiveUntil && input.effectiveUntil < input.effectiveFrom)) {
    throw new PayrollFailure("PAYROLL_ELEMENT_INVALID", "Payroll element definition is invalid.");
  }
  if (new Set(input.dependsOn).size !== input.dependsOn.length || input.dependsOn.includes(input.code)) throw new PayrollFailure("PAYROLL_ELEMENT_INVALID", "Payroll element dependencies are invalid.");
  return { ...input, name: input.name.trim() };
}

export function payrollElementEntry(input: PayrollElementEntry): PayrollElementEntry {
  requireLocalDate(input.effectiveFrom); if (input.effectiveUntil) requireLocalDate(input.effectiveUntil);
  if (input.effectiveUntil && input.effectiveUntil < input.effectiveFrom) throw new PayrollFailure("PAYROLL_ELEMENT_ENTRY_INVALID", "Payroll element entry period is invalid.");
  const names = input.values.map((value) => value.name.trim());
  if (names.some((name) => !name) || new Set(names).size !== names.length) throw new PayrollFailure("PAYROLL_ELEMENT_ENTRY_INVALID", "Payroll input names must be unique and non-empty.");
  return input;
}

export const decimalInput = (name: string, value: string): PayrollInputValue => ({ kind: "decimal", name, value: exactDecimal(value) });
export const moneyInput = (name: string, value: Money): PayrollInputValue => ({ kind: "money", name, value });
export function positiveDecimalInput(entry: PayrollElementEntry, name: string): ExactDecimal {
  const value = entry.values.find((candidate): candidate is Extract<PayrollInputValue, { kind: "decimal" }> => candidate.name === name && candidate.kind === "decimal")?.value;
  if (!value || compareDecimal(value, exactDecimal("0")) < 0) throw new PayrollFailure("PAYROLL_ELEMENT_ENTRY_INVALID", `Missing non-negative decimal input: ${name}`);
  return value;
}
