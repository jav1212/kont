import {
  compareDecimal,
  divideDecimal,
  exactDecimal,
  moneyToDecimal,
  multiplyDecimal,
  quantizeMoney,
  type ExactDecimal,
  type Money,
} from "@kontave/monetary-domain";
import { maximumMoney, minimumMoney, multiplyMoney, percentageOf, requireNonNegativeDecimal, requireNonNegativeMoney } from "./calculation.js";
import { VenezuelanPayrollFailure } from "./failure.js";
import { reconcileStatutoryObligation, type StatutoryObligationAssessment } from "./assessment.js";

export type IvssEmployerRisk = "minimum" | "medium" | "maximum";
export interface IvssAssessment {
  readonly cappedMonthlyBase: Money;
  readonly weeklyBase: Money;
  readonly contributionWeeks: ExactDecimal;
  readonly employee: Money;
  readonly employer: Money;
  readonly employerRate: ExactDecimal;
}

export function assessIvss(input: {
  readonly monthlyContributableIncome: Money;
  readonly monthlyMinimumWage: Money;
  readonly contributionWeeks: ExactDecimal;
  readonly employerRisk: IvssEmployerRisk;
}): IvssAssessment {
  requireNonNegativeMoney(input.monthlyContributableIncome);
  requireNonNegativeMoney(input.monthlyMinimumWage);
  requireNonNegativeDecimal(input.contributionWeeks, "contributionWeeks");
  if (compareDecimal(input.contributionWeeks, exactDecimal("5")) > 0) {
    throw new VenezuelanPayrollFailure("VE_PAYROLL_INVALID_INPUT", "A monthly IVSS assessment cannot contain more than five contribution weeks.");
  }
  const ceiling = multiplyMoney(input.monthlyMinimumWage, exactDecimal("5"));
  const cappedMonthlyBase = minimumMoney(input.monthlyContributableIncome, ceiling);
  const exactWeeklyBase = divideDecimal(multiplyDecimal(moneyToDecimal(cappedMonthlyBase), exactDecimal("12")), exactDecimal("52"));
  const weeklyBase = quantizeMoney(
    exactWeeklyBase,
    cappedMonthlyBase.currency,
    "half_up",
  );
  // Weekly presentation is quantized, but the obligation uses the unrounded
  // 12/52 result so a display boundary cannot alter the statutory amount.
  const exactAssessedBase = multiplyDecimal(exactWeeklyBase, input.contributionWeeks);
  const employerRate = ivssEmployerRate(input.employerRisk);
  return {
    cappedMonthlyBase,
    weeklyBase,
    contributionWeeks: input.contributionWeeks,
    employee: percentageOfExact(exactAssessedBase, input.monthlyContributableIncome, exactDecimal("4")),
    employer: percentageOfExact(exactAssessedBase, input.monthlyContributableIncome, employerRate),
    employerRate,
  };
}

export interface RpeAssessment {
  readonly boundedMonthlyBase: Money;
  readonly employee: Money;
  readonly employer: Money;
}

export interface ReconciledRpeAssessment {
  readonly boundedMonthlyBase: Money;
  readonly employee: StatutoryObligationAssessment;
  readonly employer: StatutoryObligationAssessment;
}

export function assessRpe(input: {
  readonly previousMonthNormalSalary: Money;
  readonly monthlyMinimumWage: Money;
  readonly workingTimeFraction?: ExactDecimal;
  readonly contributionStatus?: "active" | "suspended_without_salary";
}): RpeAssessment {
  requireNonNegativeMoney(input.previousMonthNormalSalary);
  requireNonNegativeMoney(input.monthlyMinimumWage);
  const fraction = input.workingTimeFraction ?? exactDecimal("1");
  requireFraction(fraction);
  if (input.contributionStatus === "suspended_without_salary") {
    const zero = multiplyMoney(input.previousMonthNormalSalary, exactDecimal("0"));
    return { boundedMonthlyBase: zero, employee: zero, employer: zero };
  }
  const floor = multiplyMoney(input.monthlyMinimumWage, fraction);
  const ceiling = multiplyMoney(input.monthlyMinimumWage, exactDecimal("10"));
  const boundedMonthlyBase = minimumMoney(maximumMoney(input.previousMonthNormalSalary, floor), ceiling);
  return {
    boundedMonthlyBase,
    employee: percentageOf(boundedMonthlyBase, exactDecimal("0.5")),
    employer: percentageOf(boundedMonthlyBase, exactDecimal("2")),
  };
}

export function reconcileRpe(input: {
  readonly calendarMonth: string;
  readonly assessment: RpeAssessment;
  readonly previouslyWithheld?: Money;
  readonly previouslyContributed?: Money;
}): ReconciledRpeAssessment {
  return {
    boundedMonthlyBase: input.assessment.boundedMonthlyBase,
    employee: reconcileStatutoryObligation({
      code: "VE_RPE_EMPLOYEE",
      assessmentKey: input.calendarMonth,
      assessedToDate: input.assessment.employee,
      ...(input.previouslyWithheld ? { previouslyApplied: input.previouslyWithheld } : {}),
    }),
    employer: reconcileStatutoryObligation({
      code: "VE_RPE_EMPLOYER",
      assessmentKey: input.calendarMonth,
      assessedToDate: input.assessment.employer,
      ...(input.previouslyContributed ? { previouslyApplied: input.previouslyContributed } : {}),
    }),
  };
}

function ivssEmployerRate(risk: IvssEmployerRisk): ExactDecimal {
  return exactDecimal({ minimum: "9", medium: "10", maximum: "11" }[risk]);
}
function requireFraction(value: ExactDecimal): void {
  if (compare(value, "0") <= 0 || compare(value, "1") > 0) throw new VenezuelanPayrollFailure("VE_PAYROLL_INVALID_INPUT", "Working-time fraction must be greater than zero and at most one.");
}
function percentageOfExact(base: ExactDecimal, currencySource: Money, rate: ExactDecimal): Money {
  return quantizeMoney(multiplyDecimal(base, divideDecimal(rate, exactDecimal("100"))), currencySource.currency, "half_up");
}
function compare(value: ExactDecimal, other: string): -1 | 0 | 1 {
  return compareDecimal(value, exactDecimal(other));
}
