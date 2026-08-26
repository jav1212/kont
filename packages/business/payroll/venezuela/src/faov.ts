import { exactDecimal, type Money } from "@kontave/monetary-domain";
import { percentageOf } from "./calculation";
import { reconcileStatutoryObligation, type StatutoryObligationAssessment } from "./assessment";

export interface FaovAssessment {
  readonly employee: StatutoryObligationAssessment;
  readonly employer: StatutoryObligationAssessment;
}

export function assessFaov(input: {
  readonly calendarMonth: string;
  readonly accumulatedIntegralSalary: Money;
  readonly previouslyWithheld?: Money;
  readonly previouslyContributed?: Money;
}): FaovAssessment {
  return {
    employee: reconcileStatutoryObligation({
      code: "VE_FAOV_EMPLOYEE",
      assessmentKey: input.calendarMonth,
      assessedToDate: percentageOf(input.accumulatedIntegralSalary, exactDecimal("1")),
      ...(input.previouslyWithheld ? { previouslyApplied: input.previouslyWithheld } : {}),
    }),
    employer: reconcileStatutoryObligation({
      code: "VE_FAOV_EMPLOYER",
      assessmentKey: input.calendarMonth,
      assessedToDate: percentageOf(input.accumulatedIntegralSalary, exactDecimal("2")),
      ...(input.previouslyContributed ? { previouslyApplied: input.previouslyContributed } : {}),
    }),
  };
}
