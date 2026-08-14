import {
  addDecimal,
  divideDecimal,
  exactDecimal,
  moneyFromMinor,
  moneyToDecimal,
  multiplyDecimal,
  quantizeMoney,
  subtractMoney,
  type Money,
  type RoundingMode,
} from "@kontave/monetary-domain";
import {
  resolveTaxRule,
  taxCode,
  taxDecision,
  TaxationFailure,
  type ProductTaxProfile,
  type TaxDecision,
  type TaxRule,
} from "@kontave/taxation-domain";

export const VENEZUELAN_IVA = taxCode("IVA");

export interface ResolveVenezuelanVatInput {
  readonly profile: ProductTaxProfile;
  readonly rules: readonly TaxRule[];
  readonly operationDate: string;
  readonly lineReference: string;
  readonly lineAmount: Money;
  readonly roundingMode: RoundingMode;
}

export function resolveVenezuelanVat(input: ResolveVenezuelanVatInput): TaxDecision {
  const assignment = input.profile.assignmentAt(VENEZUELAN_IVA, input.operationDate);
  const rule = resolveTaxRule({
    rules: input.rules,
    taxCode: VENEZUELAN_IVA,
    treatment: assignment.treatment,
    jurisdiction: input.profile.jurisdiction,
    date: input.operationDate,
  });
  const zero = moneyFromMinor(0n, input.lineAmount.currency);
  if (assignment.treatment !== "taxed") {
    return taxDecision({
      taxCode: VENEZUELAN_IVA, treatment: assignment.treatment, calculationMode: rule.calculationMode, rate: exactDecimal("0"),
      taxableBase: input.lineAmount, amount: zero, jurisdiction: input.profile.jurisdiction,
      ruleVersion: `${assignment.classificationVersion}|${rule.version}`, legalBasis: `${assignment.legalBasis}; ${rule.legalBasis}`,
      source: { kind: "line", reference: requiredReference(input.lineReference) },
    });
  }
  const percentage = divideDecimal(rule.rate, exactDecimal("100"));
  const calculation = rule.calculationMode === "tax_exclusive"
    ? {
        base: input.lineAmount,
        tax: quantizeMoney(multiplyDecimal(moneyToDecimal(input.lineAmount), percentage), input.lineAmount.currency, input.roundingMode),
      }
    : inclusiveTax(input.lineAmount, percentage, input.roundingMode);
  return taxDecision({
    taxCode: VENEZUELAN_IVA, treatment: "taxed", calculationMode: rule.calculationMode, rate: rule.rate,
    taxableBase: calculation.base, amount: calculation.tax, jurisdiction: input.profile.jurisdiction,
    ruleVersion: `${assignment.classificationVersion}|${rule.version}`, legalBasis: `${assignment.legalBasis}; ${rule.legalBasis}`,
    source: { kind: "line", reference: requiredReference(input.lineReference) },
  });
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
