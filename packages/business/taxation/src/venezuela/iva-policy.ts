import {
  addDecimal,
  divideDecimal,
  exactDecimal,
  moneyFromMinor,
  moneyToDecimal,
  multiplyDecimal,
  quantizeMoney,
  sameCurrency,
  subtractMoney,
  type Money,
  type RoundingMode,
} from "@kontave/monetary/domain";
import {
  resolveTaxRule,
  taxCode,
  taxDecision,
  taxRule,
  TaxationFailure,
  type TaxDecision,
  type TaxCode,
  type TaxRule,
  type TaxTreatment,
  type TaxPriceMode,
  type LegacyRateSlot,
  type TaxRuleCategory,
} from "../domain";

export const VENEZUELAN_IVA = taxCode("IVA");

/** Tax classification contract shared by company-owned product and service profiles. */
export interface VatClassificationProfile {
  readonly jurisdiction: string;
  /**
   * Finds the effective classification for a tax and date.
   * @param code - Tax code to resolve.
   * @param value - Effective date in `YYYY-MM-DD` format.
   * @returns The treatment and its audit provenance.
   */
  assignmentAt(code: TaxCode, value: string): {
    readonly treatment: TaxTreatment;
    readonly legalBasis: string;
    readonly classificationVersion: string;
    readonly legacyRateSlot?: LegacyRateSlot | null;
    readonly category?: TaxRuleCategory | null;
    readonly priceMode?: TaxPriceMode | null;
  };
}

export interface ResolveVenezuelanVatInput {
  readonly profile: VatClassificationProfile;
  readonly rules: readonly TaxRule[];
  readonly operationDate: string;
  readonly lineReference: string;
  readonly lineAmount: Money;
  readonly roundingMode: RoundingMode;
  /** Explicit commercial presentation for this operation; it overrides the rule's legacy mode. */
  readonly priceMode?: TaxPriceMode;
}

export function resolveVenezuelanVat(input: ResolveVenezuelanVatInput): TaxDecision {
  const assignment = input.profile.assignmentAt(VENEZUELAN_IVA, input.operationDate);
  const rule = resolveTaxRule({
    rules: input.rules,
    taxCode: VENEZUELAN_IVA,
    treatment: assignment.treatment,
    jurisdiction: input.profile.jurisdiction,
    date: input.operationDate,
    category: assignment.category ?? null,
    legacyRateSlot: assignment.legacyRateSlot ?? null,
  });
  if ((rule.component ?? "base") !== "base") {
    throw new TaxationFailure("TAXATION_DECISION_INVALID", "An additional IVA component must be calculated alongside the base IVA, not in its place.");
  }
  const calculationMode = input.priceMode ?? assignment.priceMode ?? rule.calculationMode;
  const zero = moneyFromMinor(0n, input.lineAmount.currency);
  if (assignment.treatment !== "taxed") {
    return taxDecision({
      taxCode: VENEZUELAN_IVA, treatment: assignment.treatment, calculationMode, rate: exactDecimal("0"),
      taxableBase: input.lineAmount, amount: zero, jurisdiction: input.profile.jurisdiction,
      ruleVersion: `${assignment.classificationVersion}|${rule.version}`, legalBasis: `${assignment.legalBasis}; ${rule.legalBasis}`,
      source: { kind: "line", reference: requiredReference(input.lineReference) },
      category: rule.category ?? null,
      component: rule.component ?? "base",
      legacyRateSlot: assignment.legacyRateSlot ?? null,
    });
  }
  const percentage = divideDecimal(rule.rate, exactDecimal("100"));
  const calculation = calculationMode === "tax_exclusive"
    ? {
        base: input.lineAmount,
        tax: quantizeMoney(multiplyDecimal(moneyToDecimal(input.lineAmount), percentage), input.lineAmount.currency, input.roundingMode),
      }
    : inclusiveTax(input.lineAmount, percentage, input.roundingMode);
  return taxDecision({
    taxCode: VENEZUELAN_IVA, treatment: "taxed", calculationMode, rate: rule.rate,
    taxableBase: calculation.base, amount: calculation.tax, jurisdiction: input.profile.jurisdiction,
    ruleVersion: `${assignment.classificationVersion}|${rule.version}`, legalBasis: `${assignment.legalBasis}; ${rule.legalBasis}`,
    source: { kind: "line", reference: requiredReference(input.lineReference) },
    category: rule.category ?? null,
    component: rule.component ?? "base",
    legacyRateSlot: assignment.legacyRateSlot ?? null,
  });
}

/** Explicitly composes independently classified base IVA with authorized additional IVA components.
 * @param input - Base VAT inputs and additional legal rules already authorized for this operation.
 * @returns Base decision followed by each additional decision, preserving component provenance.
 * @throws {TaxationFailure} When a component is duplicated, not configured as additional, or is not taxable.
 */
export function resolveVenezuelanVatComponents(input: ResolveVenezuelanVatInput & {
  readonly additionalComponents: readonly { readonly rule: TaxRule; readonly source: { readonly kind: "line" | "payment"; readonly reference: string }; readonly taxableBase?: Money }[];
}): readonly TaxDecision[] {
  const base = resolveVenezuelanVat(input);
  const seen = new Set<string>();
  const decisions = [base];
  for (const component of input.additionalComponents) {
    const rule = taxRule(component.rule);
    const kind = rule.component;
    const expectedCategory = kind === "luxury" ? "luxury_surcharge" : kind === "payment" ? "payment_surcharge" : null;
    if (!kind || kind === "base" || rule.treatment !== "taxed" || rule.taxCode !== VENEZUELAN_IVA
      || rule.jurisdiction !== input.profile.jurisdiction.trim().toUpperCase() || rule.effectiveFrom > input.operationDate
      || (rule.effectiveTo !== null && rule.effectiveTo < input.operationDate)
      || rule.category !== expectedCategory || seen.has(kind)) {
      throw new TaxationFailure("TAXATION_DECISION_INVALID", "An additional IVA component is invalid or not effective for the operation.");
    }
    seen.add(kind);
    const reference = requiredReference(component.source.reference);
    if (kind === "payment" && (component.source.kind !== "payment" || component.taxableBase === undefined)) {
      throw new TaxationFailure("TAXATION_DECISION_INVALID", "Payment IVA requires an explicit payment source and payment taxable base.");
    }
    if (kind === "luxury" && component.source.kind !== "line") {
      throw new TaxationFailure("TAXATION_DECISION_INVALID", "Luxury IVA must retain the taxed line as its source.");
    }
    const taxableBase = kind === "payment" ? component.taxableBase : base.taxableBase;
    if (taxableBase === undefined || !sameCurrency(taxableBase.currency, input.lineAmount.currency)) {
      throw new TaxationFailure("TAXATION_CURRENCY_MISMATCH", "Additional IVA component base must use the operation currency.");
    }
    const percentage = divideDecimal(rule.rate, exactDecimal("100"));
    const amount = quantizeMoney(multiplyDecimal(moneyToDecimal(taxableBase), percentage), taxableBase.currency, input.roundingMode);
    decisions.push(taxDecision({
      taxCode: VENEZUELAN_IVA, treatment: "taxed", calculationMode: "tax_exclusive", rate: rule.rate,
      taxableBase, amount, jurisdiction: input.profile.jurisdiction,
      ruleVersion: rule.version, legalBasis: rule.legalBasis,
      source: component.source.kind === "payment" ? { kind: "payment", reference } : { kind: "line", reference },
      category: rule.category ?? null, component: kind,
    }));
  }
  return Object.freeze(decisions);
}

function inclusiveTax(amount: Money, percentage: ReturnType<typeof exactDecimal>, roundingMode: RoundingMode): { readonly base: Money; readonly tax: Money } {
  const divisor = addDecimal(exactDecimal("1"), percentage);
  const base = quantizeMoney(divideDecimal(moneyToDecimal(amount), divisor), amount.currency, roundingMode);
  return { base, tax: subtractMoney(amount, base) };
}

function requiredReference(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TaxationFailure("TAXATION_DECISION_INVALID", "Venezuelan VAT line reference is required.");
  return normalized;
}
