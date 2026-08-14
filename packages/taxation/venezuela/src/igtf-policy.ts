import {
  divideDecimal,
  exactDecimal,
  moneyToDecimal,
  multiplyDecimal,
  quantizeMoney,
  sameCurrency,
  type CurrencyCode,
  type CurrencyDefinition,
  type Money,
  type RoundingMode,
} from "@kontave/monetary-domain";
import {
  includesDate,
  taxCode,
  taxDecision,
  taxRule,
  taxationDate,
  type TaxDecision,
  type TaxRule,
} from "@kontave/taxation-domain";
import { TaxationFailure } from "@kontave/taxation-domain";

export const VENEZUELAN_IGTF = taxCode("IGTF");

export type PaymentCurrencyCondition =
  | { readonly kind: "different_from_legal_tender" }
  | { readonly kind: "included_currencies"; readonly currencies: readonly CurrencyCode[] };

export interface VenezuelanPaymentTaxRule {
  readonly taxRule: TaxRule;
  readonly currencyCondition: PaymentCurrencyCondition;
}

export interface ResolveVenezuelanIgtfInput {
  readonly rules: readonly VenezuelanPaymentTaxRule[];
  readonly operationDate: string;
  readonly paymentKey: string;
  readonly tenderedCurrency: CurrencyDefinition;
  readonly legalTenderCurrency: CurrencyDefinition;
  readonly recognizedAmount: Money;
  readonly operationQualifies: boolean;
  readonly roundingMode: RoundingMode;
}

export function resolveVenezuelanIgtf(input: ResolveVenezuelanIgtfInput): TaxDecision | null {
  if (!input.operationQualifies) return null;
  const date = taxationDate(input.operationDate);
  const matches = input.rules.map((candidate) => ({ ...candidate, taxRule: taxRule(candidate.taxRule) })).filter(({ taxRule: rule, currencyCondition }) =>
    rule.taxCode === VENEZUELAN_IGTF && rule.treatment === "taxed" && rule.jurisdiction === "VE" &&
    includesDate(rule.effectiveFrom, rule.effectiveTo, date) && currencyMatches(currencyCondition, input.tenderedCurrency, input.legalTenderCurrency));
  if (matches.length === 0) return null;
  if (matches.length > 1) throw new TaxationFailure("TAXATION_RULE_AMBIGUOUS", "More than one IGTF rule applies to the payment.");
  const match = matches[0];
  if (match === undefined) return null;
  if (match.taxRule.calculationMode !== "tax_exclusive") {
    throw new TaxationFailure("TAXATION_RULE_INVALID", "IGTF payment rules must use tax-exclusive calculation.");
  }
  const paymentKey = input.paymentKey.trim();
  if (!paymentKey) throw new TaxationFailure("TAXATION_DECISION_INVALID", "IGTF payment key is required.");
  const percentage = divideDecimal(match.taxRule.rate, exactDecimal("100"));
  const amount = quantizeMoney(multiplyDecimal(moneyToDecimal(input.recognizedAmount), percentage), input.recognizedAmount.currency, input.roundingMode);
  return taxDecision({
    taxCode: VENEZUELAN_IGTF, treatment: "taxed", calculationMode: "tax_exclusive", rate: match.taxRule.rate,
    taxableBase: input.recognizedAmount, amount, jurisdiction: "VE", ruleVersion: match.taxRule.version,
    legalBasis: match.taxRule.legalBasis, source: { kind: "payment", reference: paymentKey },
  });
}

function currencyMatches(condition: PaymentCurrencyCondition, tendered: CurrencyDefinition, legalTender: CurrencyDefinition): boolean {
  return condition.kind === "different_from_legal_tender"
    ? !sameCurrency(tendered, legalTender)
    : condition.currencies.includes(tendered.code);
}
