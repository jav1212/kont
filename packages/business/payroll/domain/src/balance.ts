import type { CurrencyDefinition, Money } from "@kontave/monetary-domain";
import type { PayrollBalanceCode, PayrollRelationshipId } from "./identifiers";
import type { PayrollBalanceDimension, PayrollUnit } from "./element";
import type { ExactDecimal } from "@kontave/monetary-domain";
import { PayrollFailure } from "./payroll-failure";

export interface PayrollBalanceDefinition { readonly code: PayrollBalanceCode; readonly name: string; readonly unit: PayrollUnit; readonly currency: CurrencyDefinition | null; readonly dimensions: readonly PayrollBalanceDimension[]; }
export interface PayrollBalanceResult { readonly balanceCode: PayrollBalanceCode; readonly relationshipId: PayrollRelationshipId; readonly dimension: PayrollBalanceDimension; readonly value: Money | ExactDecimal; }

export function payrollBalanceDefinition(input: PayrollBalanceDefinition): PayrollBalanceDefinition {
  if (!input.name.trim() || input.dimensions.length === 0 || new Set(input.dimensions).size !== input.dimensions.length) throw new PayrollFailure("PAYROLL_ELEMENT_INVALID", "Payroll balance definition is invalid.");
  if (input.unit === "money" && !input.currency) throw new PayrollFailure("PAYROLL_ELEMENT_INVALID", "Monetary balances require a currency.");
  if (input.unit !== "money" && input.currency) throw new PayrollFailure("PAYROLL_ELEMENT_INVALID", "Non-monetary balances cannot declare a currency.");
  return { ...input, name: input.name.trim() };
}
