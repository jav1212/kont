import {
  compareDecimal,
  divideDecimal,
  exactDecimal,
  multiplyDecimal,
  subtractDecimal,
  type ExactDecimal,
  type Money,
} from "@kontave/monetary-domain";
import { percentageOf, requireNonNegativeDecimal } from "./calculation";
import { VenezuelanPayrollFailure } from "./failure";

export interface AriTaxBracket {
  readonly upperBoundUt: ExactDecimal | null;
  readonly ratePercent: ExactDecimal;
  readonly subtractUt: ExactDecimal;
}

export const VENEZUELAN_NATURAL_PERSON_TARIFF_1: readonly AriTaxBracket[] = [
  bracket("1000", "6", "0"), bracket("1500", "9", "30"), bracket("2000", "12", "75"), bracket("2500", "16", "155"),
  bracket("3000", "20", "255"), bracket("4000", "24", "375"), bracket("6000", "29", "575"), bracket(null, "34", "875"),
] as const;

export interface AriPercentageResult {
  readonly subjectToWithholding: boolean;
  readonly estimatedAnnualRemunerationUt: ExactDecimal;
  readonly estimatedTaxUt: ExactDecimal;
  readonly withholdingPercentage: ExactDecimal;
  readonly origin: "employee_declaration" | "employer_default";
}

export function calculateAriPercentage(input: {
  readonly estimatedAnnualRemuneration: Money;
  readonly taxUnitValue: Money;
  readonly origin: AriPercentageResult["origin"];
  readonly itemizedDeductionsUt?: ExactDecimal;
  readonly singleDeductionUt?: ExactDecimal;
  readonly personalRebateUt?: ExactDecimal;
  readonly familyDependants?: number;
  readonly familyRebatePerDependantUt?: ExactDecimal;
  readonly priorExcessWithholdingUt?: ExactDecimal;
}): AriPercentageResult {
  const annualUt = divideDecimalMoney(input.estimatedAnnualRemuneration, input.taxUnitValue);
  const subject = compareDecimal(annualUt, exactDecimal("1000")) > 0;
  if (!subject) return { subjectToWithholding: false, estimatedAnnualRemunerationUt: annualUt, estimatedTaxUt: exactDecimal("0"), withholdingPercentage: exactDecimal("0"), origin: input.origin };
  const deduction = input.origin === "employer_default"
    ? exactDecimal("0")
    : declaredDeduction(input.itemizedDeductionsUt, input.singleDeductionUt);
  const netUt = nonNegative(subtractDecimal(annualUt, deduction));
  const tariffTax = tariffOneTax(netUt);
  const personalRebate = input.personalRebateUt ?? exactDecimal("10");
  const dependants = Math.max(0, Math.trunc(input.familyDependants ?? 0));
  const familyRebate = multiplyDecimal(input.familyRebatePerDependantUt ?? exactDecimal("10"), exactDecimal(String(dependants)));
  const priorExcess = input.priorExcessWithholdingUt ?? exactDecimal("0");
  const estimatedTaxUt = nonNegative(subtractDecimal(subtractDecimal(subtractDecimal(tariffTax, personalRebate), familyRebate), priorExcess));
  const percentage = multiplyDecimal(divideDecimal(estimatedTaxUt, annualUt), exactDecimal("100"));
  return { subjectToWithholding: true, estimatedAnnualRemunerationUt: annualUt, estimatedTaxUt, withholdingPercentage: percentage, origin: input.origin };
}

export function calculateIslrPaymentWithholding(taxablePayment: Money, percentage: ExactDecimal): Money {
  return percentageOf(taxablePayment, percentage);
}

export function tariffOneTax(netIncomeUt: ExactDecimal): ExactDecimal {
  requireNonNegativeDecimal(netIncomeUt, "netIncomeUt");
  const selected = VENEZUELAN_NATURAL_PERSON_TARIFF_1.find((candidate) => candidate.upperBoundUt === null || compareDecimal(netIncomeUt, candidate.upperBoundUt) <= 0) ?? VENEZUELAN_NATURAL_PERSON_TARIFF_1[7];
  if (!selected) return exactDecimal("0");
  return nonNegative(subtractDecimal(multiplyDecimal(netIncomeUt, divideDecimal(selected.ratePercent, exactDecimal("100"))), selected.subtractUt));
}

function divideDecimalMoney(value: Money, divisor: Money): ExactDecimal {
  if (value.minorAmount < 0n || value.currency.code !== divisor.currency.code || value.currency.minorUnit !== divisor.currency.minorUnit || divisor.minorAmount <= 0n) {
    throw new VenezuelanPayrollFailure("VE_PAYROLL_INVALID_INPUT", "Annual remuneration and tax unit must be positive and use the same currency.");
  }
  return divideDecimal(exactDecimal(value.minorAmount.toString()), exactDecimal(divisor.minorAmount.toString()));
}
function declaredDeduction(itemized: ExactDecimal | undefined, single: ExactDecimal | undefined): ExactDecimal {
  if ((itemized === undefined) === (single === undefined)) {
    throw new VenezuelanPayrollFailure("VE_PAYROLL_INVALID_INPUT", "An employee AR-I must choose exactly one deduction method.");
  }
  return itemized ?? single ?? exactDecimal("0");
}
function nonNegative(value: ExactDecimal): ExactDecimal { return compareDecimal(value, exactDecimal("0")) < 0 ? exactDecimal("0") : value; }
function bracket(upperBoundUt: string | null, ratePercent: string, subtractUt: string): AriTaxBracket {
  return { upperBoundUt: upperBoundUt === null ? null : exactDecimal(upperBoundUt), ratePercent: exactDecimal(ratePercent), subtractUt: exactDecimal(subtractUt) };
}
