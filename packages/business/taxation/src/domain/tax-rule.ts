import { compareDecimal, exactDecimal, type ExactDecimal } from "@kontave/monetary/domain";
import type { TaxCode, TaxRuleId } from "./identifiers";
import { includesDate, taxationDate, type TaxationDate } from "./temporal";
import { TaxationFailure } from "./taxation-failure";
import { legacyRateSlot, taxRuleCategory, taxRuleComponent, type LegacyRateSlot, type TaxRuleCategory, type TaxRuleComponent } from "./tax-configuration";

export type TaxTreatment = "taxed" | "zero_rated" | "exempt" | "exonerated" | "not_subject";
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
  /** Optional only for imported legacy rules whose category was never recorded. */
  readonly category?: TaxRuleCategory | null;
  /** Defaults to base only for legacy rules; additional components require explicit configuration. */
  readonly component?: TaxRuleComponent;
  /** Optional compatibility selector; it never defines a legal rate by itself. */
  readonly legacyRateSlot?: LegacyRateSlot | null;
}

/**
 * Validates and freezes an effective tax rule.
 * @param input - Complete legal rule definition.
 * @returns An immutable tax rule.
 * @throws {TaxationFailure} When dates, rate or legal basis are invalid.
 */
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
  const category = input.category === undefined || input.category === null ? null : taxRuleCategory(input.category);
  const component = input.component === undefined ? "base" : taxRuleComponent(input.component);
  const componentCategory = component === "luxury" ? "luxury_surcharge" : component === "payment" ? "payment_surcharge" : null;
  if ((componentCategory !== null && (category !== componentCategory || input.treatment !== "taxed"))
    || (component === "base" && (category === "luxury_surcharge" || category === "payment_surcharge"))) {
    throw new TaxationFailure("TAXATION_RULE_INVALID", "Tax rule category and legal component are inconsistent.");
  }
  return { ...input, jurisdiction, legalBasis, version, rate, category, component, legacyRateSlot: input.legacyRateSlot === undefined || input.legacyRateSlot === null ? null : legacyRateSlot(input.legacyRateSlot) };
}

/**
 * Resolves the unique effective legal rule for a classification and date.
 * @param input - Candidate rules, classification, jurisdiction and effective date.
 * @returns The matching tax rule.
 * @throws {TaxationFailure} When no unique matching rule exists.
 */
export function resolveTaxRule(input: {
  readonly rules: readonly TaxRule[];
  readonly taxCode: TaxCode;
  readonly treatment: TaxTreatment;
  readonly jurisdiction: string;
  readonly date: string;
  /** Selects a legal tax-rule category. Omit only for a legacy selector with one unique rule. */
  readonly category?: TaxRuleCategory | null;
  /** Optional Profit-compatible slot that further selects an already legal category. */
  readonly legacyRateSlot?: LegacyRateSlot | null;
}): TaxRule {
  const date = taxationDate(input.date);
  const jurisdiction = input.jurisdiction.trim().toUpperCase();
  const category = input.category === undefined || input.category === null ? null : taxRuleCategory(input.category);
  const slot = input.legacyRateSlot === undefined || input.legacyRateSlot === null ? null : legacyRateSlot(input.legacyRateSlot);
  const matches = input.rules.map(taxRule).filter((rule) => rule.taxCode === input.taxCode && rule.treatment === input.treatment &&
    (category === null || rule.category === category) &&
    (slot === null || rule.legacyRateSlot === slot) &&
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
