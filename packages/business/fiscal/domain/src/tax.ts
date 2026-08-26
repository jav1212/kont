import { compareDecimal, exactDecimal, sameCurrency, type ExactDecimal, type Money } from "@kontave/monetary-domain";
import type { FiscalDocumentLineId } from "./identifiers";
import { FiscalFailure } from "./fiscal-failure";

export type FiscalTaxCategory = "taxable" | "exempt" | "exonerated" | "not_subject" | "perceived" | "other";
export type FiscalTaxCalculationMode = "tax_exclusive" | "tax_inclusive";
export type FiscalTaxSource =
  | { readonly kind: "line"; readonly lineId: FiscalDocumentLineId }
  | { readonly kind: "document" }
  | { readonly kind: "payment"; readonly paymentKey: string };

export interface FiscalTaxDetermination {
  readonly taxCode: string;
  readonly category: FiscalTaxCategory;
  readonly calculationMode: FiscalTaxCalculationMode;
  readonly rate: ExactDecimal;
  readonly taxableBase: Money;
  readonly amount: Money;
  readonly jurisdiction: string;
  readonly ruleVersion: string;
  readonly source: FiscalTaxSource;
}

export interface FiscalTaxSummary {
  readonly taxCode: string;
  readonly category: FiscalTaxCategory;
  readonly calculationMode: FiscalTaxCalculationMode;
  readonly rate: ExactDecimal;
  readonly taxableBase: Money;
  readonly amount: Money;
}

export function fiscalTaxDetermination(input: FiscalTaxDetermination): FiscalTaxDetermination {
  const taxCode = required(input.taxCode, 64, "tax code").toUpperCase();
  const jurisdiction = required(input.jurisdiction, 16, "jurisdiction").toUpperCase();
  const ruleVersion = required(input.ruleVersion, 128, "rule version");
  const rate = exactDecimal(input.rate);
  if (compareDecimal(rate, exactDecimal("0")) < 0 || input.taxableBase.minorAmount < 0n || input.amount.minorAmount < 0n) {
    throw new FiscalFailure("FISCAL_TAX_INVALID", "Fiscal tax values cannot be negative.");
  }
  if (!sameCurrency(input.taxableBase.currency, input.amount.currency)) {
    throw new FiscalFailure("FISCAL_CURRENCY_MISMATCH", "Tax base and amount must use the same currency.");
  }
  if (["exempt", "exonerated", "not_subject"].includes(input.category) && (input.amount.minorAmount !== 0n || rate !== "0")) {
    throw new FiscalFailure("FISCAL_TAX_INVALID", "Untaxed fiscal determinations require a zero rate and amount.");
  }
  if (input.source.kind === "payment" && !input.source.paymentKey.trim()) {
    throw new FiscalFailure("FISCAL_TAX_INVALID", "Payment tax source requires a payment key.");
  }
  return { ...input, taxCode, jurisdiction, ruleVersion, rate };
}

function required(value: string, limit: number, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > limit) throw new FiscalFailure("FISCAL_TAX_INVALID", `Fiscal ${name} is invalid.`);
  return normalized;
}
