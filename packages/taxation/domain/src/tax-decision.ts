import { compareDecimal, exactDecimal, sameCurrency, type ExactDecimal, type Money } from "@kontave/monetary-domain";
import type { TaxCode } from "./identifiers.js";
import type { TaxCalculationMode, TaxTreatment } from "./tax-rule.js";
import { TaxationFailure } from "./taxation-failure.js";

export type TaxDecisionSource =
  | { readonly kind: "line"; readonly reference: string }
  | { readonly kind: "document" }
  | { readonly kind: "payment"; readonly reference: string };

export interface TaxDecision {
  readonly taxCode: TaxCode;
  readonly treatment: TaxTreatment;
  readonly calculationMode: TaxCalculationMode;
  readonly rate: ExactDecimal;
  readonly taxableBase: Money;
  readonly amount: Money;
  readonly jurisdiction: string;
  readonly ruleVersion: string;
  readonly legalBasis: string;
  readonly source: TaxDecisionSource;
}

export function taxDecision(input: TaxDecision): TaxDecision {
  const rate = exactDecimal(input.rate);
  if (!sameCurrency(input.taxableBase.currency, input.amount.currency)) {
    throw new TaxationFailure("TAXATION_CURRENCY_MISMATCH", "Tax decision base and amount must use the same currency.");
  }
  if (input.taxableBase.minorAmount < 0n || input.amount.minorAmount < 0n || compareDecimal(rate, exactDecimal("0")) < 0) {
    throw new TaxationFailure("TAXATION_DECISION_INVALID", "Tax decision values cannot be negative.");
  }
  if (input.treatment === "taxed" ? compareDecimal(rate, exactDecimal("0")) <= 0 : (rate !== "0" || input.amount.minorAmount !== 0n)) {
    throw new TaxationFailure("TAXATION_DECISION_INVALID", "Tax decision treatment conflicts with its rate or amount.");
  }
  if (input.source.kind !== "document" && !input.source.reference.trim()) {
    throw new TaxationFailure("TAXATION_DECISION_INVALID", "Tax decision source reference is required.");
  }
  const jurisdiction = input.jurisdiction.trim().toUpperCase();
  const ruleVersion = input.ruleVersion.trim();
  const legalBasis = input.legalBasis.trim();
  if (!jurisdiction || !ruleVersion || !legalBasis) throw new TaxationFailure("TAXATION_DECISION_INVALID", "Tax decision audit data is required.");
  return { ...input, rate, jurisdiction, ruleVersion, legalBasis };
}
