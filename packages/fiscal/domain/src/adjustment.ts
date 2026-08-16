import { compareDecimal, exactDecimal, type ExactDecimal, type Money } from "@kontave/monetary-domain";
import { FiscalFailure } from "./fiscal-failure";

export type FiscalAdjustmentKind = "discount" | "surcharge";
export type FiscalAdjustmentScope = "line" | "document";
export type FiscalAdjustmentCalculation =
  | { readonly kind: "fixed_amount" }
  | { readonly kind: "percentage"; readonly rate: ExactDecimal };

export interface FiscalAdjustment {
  readonly kind: FiscalAdjustmentKind;
  readonly scope: FiscalAdjustmentScope;
  readonly calculation: FiscalAdjustmentCalculation;
  readonly reason: string | null;
  readonly amount: Money;
}

export function fiscalAdjustment(input: FiscalAdjustment): FiscalAdjustment {
  if (input.amount.minorAmount <= 0n) throw new FiscalFailure("FISCAL_ADJUSTMENT_INVALID", "Fiscal adjustment amount must be positive.");
  let calculation = input.calculation;
  if (calculation.kind === "percentage") {
    const rate = exactDecimal(calculation.rate);
    if (compareDecimal(rate, exactDecimal("0")) <= 0) {
      throw new FiscalFailure("FISCAL_ADJUSTMENT_INVALID", "Fiscal adjustment percentage must be positive.");
    }
    calculation = { kind: "percentage", rate };
  }
  const reason = input.reason?.trim() || null;
  return { ...input, calculation, reason };
}
