import { compareDecimal, exactDecimal, type ExactDecimal, type Money } from "@kontave/monetary-domain";
import type { PayrollBalanceCode, PayrollElementCode, PayrollElementEntryId, PayrollRelationshipId } from "./identifiers";
import { requireLocalDate } from "./period";
import { PayrollFailure } from "./payroll-failure";

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

/**
 * Validates a versioned payroll element definition and its dependency declarations.
 * @param input - Element definition to validate.
 * @returns A normalized immutable definition copy.
 * @throws {PayrollFailure} When dates, priority, name, or dependencies are invalid.
 */
export function payrollElementDefinition(input: PayrollElementDefinition): PayrollElementDefinition {
  requireLocalDate(input.effectiveFrom); if (input.effectiveUntil) requireLocalDate(input.effectiveUntil);
  if (!input.name.trim() || !Number.isInteger(input.priority) || input.priority < 0 || (input.effectiveUntil && input.effectiveUntil < input.effectiveFrom)) {
    throw new PayrollFailure("PAYROLL_ELEMENT_INVALID", "Payroll element definition is invalid.");
  }
  if (new Set(input.dependsOn).size !== input.dependsOn.length || input.dependsOn.includes(input.code)) throw new PayrollFailure("PAYROLL_ELEMENT_INVALID", "Payroll element dependencies are invalid.");
  return { ...input, name: input.name.trim() };
}

/**
 * Validates a payroll element entry and its named inputs.
 * @param input - Effective-dated entry to validate.
 * @returns The validated entry.
 * @throws {PayrollFailure} When dates are inverted or input names are empty or duplicated.
 */
export function payrollElementEntry(input: PayrollElementEntry): PayrollElementEntry {
  requireLocalDate(input.effectiveFrom); if (input.effectiveUntil) requireLocalDate(input.effectiveUntil);
  if (input.effectiveUntil && input.effectiveUntil < input.effectiveFrom) throw new PayrollFailure("PAYROLL_ELEMENT_ENTRY_INVALID", "Payroll element entry period is invalid.");
  const names = input.values.map((value) => value.name.trim());
  if (names.some((name) => !name) || new Set(names).size !== names.length) throw new PayrollFailure("PAYROLL_ELEMENT_ENTRY_INVALID", "Payroll input names must be unique and non-empty.");
  return input;
}

/**
 * Creates an exact decimal input for a payroll evaluator.
 * @param name - Evaluator input name.
 * @param value - Exact decimal text without exponent notation.
 * @returns A typed decimal input value.
 * @throws {MonetaryFailure} When the decimal representation is invalid.
 */
export const decimalInput = (name: string, value: string): PayrollInputValue => ({ kind: "decimal", name, value: exactDecimal(value) });

/**
 * Creates a monetary input for a payroll evaluator without changing its precision.
 * @param name - Evaluator input name.
 * @param value - Immutable money value.
 * @returns A typed monetary input value.
 */
export const moneyInput = (name: string, value: Money): PayrollInputValue => ({ kind: "money", name, value });

/**
 * Reads a required non-negative decimal input from an element entry.
 * @param entry - Payroll element entry containing evaluator inputs.
 * @param name - Input name to resolve.
 * @returns The matching exact decimal value.
 * @throws {PayrollFailure} When the input is absent or negative.
 */
export function positiveDecimalInput(entry: PayrollElementEntry, name: string): ExactDecimal {
  const value = entry.values.find((candidate): candidate is Extract<PayrollInputValue, { kind: "decimal" }> => candidate.name === name && candidate.kind === "decimal")?.value;
  if (!value || compareDecimal(value, exactDecimal("0")) < 0) throw new PayrollFailure("PAYROLL_ELEMENT_ENTRY_INVALID", `Missing non-negative decimal input: ${name}`);
  return value;
}
