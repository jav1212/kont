import { compareDecimal, exactDecimal, type ExactDecimal } from "@kontave/monetary-domain";
import type { TaxCode, TaxRuleId } from "./identifiers.js";
import { includesDate, taxationDate, type TaxationDate } from "./temporal.js";
import { TaxationFailure } from "./taxation-failure.js";

export type TaxTreatment = "taxed" | "exempt" | "exonerated" | "not_subject";
export type TaxCalculationMode = "tax_exclusive" | "tax_inclusive";

export interface TaxRule {
  readonly id: TaxRuleId;
  readonly taxCode: TaxCode;
  readonly jurisdiction: string;
  readonly treatment: TaxTreatment;
  readonly rate: ExactDecimal;
  readonly calculationMode: TaxCalculationMode;
  readonly effectiveFrom: TaxationDate;
  readonly effectiveTo: TaxationDate | null;
  readonly legalBasis: string;
  readonly version: string;
}

export function taxRule(input: TaxRule): TaxRule {
  const jurisdiction = required(input.jurisdiction, 16, "jurisdiction").toUpperCase();
  const legalBasis = required(input.legalBasis, 500, "legal basis");
  const version = required(input.version, 128, "version");
  const rate = exactDecimal(input.rate);
  if (input.effectiveTo !== null && input.effectiveTo < input.effectiveFrom) {
    throw new TaxationFailure("TAXATION_RULE_INVALID", "Tax rule effective interval is invalid.");
  }
  if (input.treatment === "taxed" ? compareDecimal(rate, exactDecimal("0")) <= 0 : rate !== "0") {
    throw new TaxationFailure("TAXATION_RULE_INVALID", "Taxed rules require a positive rate and untaxed rules require zero.");
  }
  return { ...input, jurisdiction, legalBasis, version, rate };
}

export function resolveTaxRule(input: {
  readonly rules: readonly TaxRule[];
  readonly taxCode: TaxCode;
  readonly treatment: TaxTreatment;
  readonly jurisdiction: string;
  readonly date: string;
}): TaxRule {
  const date = taxationDate(input.date);
  const jurisdiction = input.jurisdiction.trim().toUpperCase();
  const matches = input.rules.map(taxRule).filter((rule) => rule.taxCode === input.taxCode && rule.treatment === input.treatment &&
    rule.jurisdiction === jurisdiction && includesDate(rule.effectiveFrom, rule.effectiveTo, date));
  if (matches.length === 0) throw new TaxationFailure("TAXATION_RULE_MISSING", "No applicable tax rule was found.");
  if (matches.length > 1) throw new TaxationFailure("TAXATION_RULE_AMBIGUOUS", "More than one tax rule applies to the same decision.");
  const match = matches[0];
  if (match === undefined) throw new TaxationFailure("TAXATION_RULE_MISSING", "No applicable tax rule was found.");
  return match;
}

function required(value: string, limit: number, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > limit) throw new TaxationFailure("TAXATION_RULE_INVALID", `Tax rule ${name} is invalid.`);
  return normalized;
}
