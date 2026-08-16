import {
  addMoney,
  compareMoney,
  moneyFromMinor,
  sameCurrency,
  subtractMoney,
  type Money,
} from "@kontave/monetary-domain";
import type { VenezuelanObligationCode } from "./rules";
import { VenezuelanPayrollFailure } from "./failure";

export interface StatutoryObligationAssessment {
  readonly code: VenezuelanObligationCode;
  readonly assessmentKey: string;
  readonly assessedToDate: Money;
  readonly previouslyApplied: Money;
  readonly currentApplication: Money;
  readonly outstanding: Money;
}

export function reconcileStatutoryObligation(input: {
  readonly code: VenezuelanObligationCode;
  readonly assessmentKey: string;
  readonly assessedToDate: Money;
  readonly previouslyApplied?: Money;
}): StatutoryObligationAssessment {
  const previous = input.previouslyApplied ?? moneyFromMinor(0n, input.assessedToDate.currency);
  requireSameCurrency(input.assessedToDate, previous);
  if (compareMoney(input.assessedToDate, moneyFromMinor(0n, input.assessedToDate.currency)) < 0 || compareMoney(previous, moneyFromMinor(0n, previous.currency)) < 0) {
    throw new VenezuelanPayrollFailure("VE_PAYROLL_INVALID_INPUT", "Statutory assessments cannot be negative.");
  }
  const difference = subtractMoney(input.assessedToDate, previous);
  const current = compareMoney(difference, moneyFromMinor(0n, difference.currency)) > 0 ? difference : moneyFromMinor(0n, difference.currency);
  const appliedAfterRun = addMoney(previous, current);
  return {
    code: input.code,
    assessmentKey: requireKey(input.assessmentKey),
    assessedToDate: input.assessedToDate,
    previouslyApplied: previous,
    currentApplication: current,
    outstanding: subtractMoney(input.assessedToDate, appliedAfterRun),
  };
}

function requireSameCurrency(left: Money, right: Money): void {
  if (!sameCurrency(left.currency, right.currency)) throw new VenezuelanPayrollFailure("VE_PAYROLL_CURRENCY_MISMATCH", "Assessment currencies differ.");
}
function requireKey(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new VenezuelanPayrollFailure("VE_PAYROLL_INVALID_INPUT", "Assessment key is required.");
  return normalized;
}
