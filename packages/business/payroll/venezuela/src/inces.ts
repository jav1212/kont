import { exactDecimal, moneyFromMinor, type Money } from "@kontave/monetary-domain";
import { percentageOf } from "./calculation";
import { reconcileStatutoryObligation, type StatutoryObligationAssessment } from "./assessment";
import { VenezuelanPayrollFailure } from "./failure";

export function assessIncesEmployer(input: {
  readonly calendarQuarter: string;
  readonly accumulatedNormalSalary: Money;
  readonly activeWorkerCount: number;
  readonly previouslyContributed?: Money;
}): StatutoryObligationAssessment {
  if (!Number.isInteger(input.activeWorkerCount) || input.activeWorkerCount < 0) {
    throw new VenezuelanPayrollFailure("VE_PAYROLL_INVALID_INPUT", "Active worker count must be a non-negative integer.");
  }
  const assessed = input.activeWorkerCount >= 5
    ? percentageOf(input.accumulatedNormalSalary, exactDecimal("2"))
    : moneyFromMinor(0n, input.accumulatedNormalSalary.currency);
  return reconcileStatutoryObligation({
    code: "VE_INCES_EMPLOYER",
    assessmentKey: input.calendarQuarter,
    assessedToDate: assessed,
    ...(input.previouslyContributed ? { previouslyApplied: input.previouslyContributed } : {}),
  });
}

export type IncesEmployeeEvent = "profit_sharing" | "year_end_bonus" | "ordinary_payroll";
export function assessIncesEmployee(input: { readonly event: IncesEmployeeEvent; readonly eventAmount: Money }): Money {
  return input.event === "ordinary_payroll"
    ? moneyFromMinor(0n, input.eventAmount.currency)
    : percentageOf(input.eventAmount, exactDecimal("0.5"));
}
