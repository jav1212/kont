import type { EmployeeId } from "@kontave/employees-domain";
import type { CurrencyDefinition, Money } from "@kontave/monetary-domain";
import type { PayrollDefinitionId, PayrollRelationshipId } from "./identifiers";
import type { PayrollPeriod } from "./period";
import { requireLocalDate } from "./period";
import { PayrollFailure } from "./payroll-failure";

export type CompensationBasis =
  | { readonly kind: "monthly_salary"; readonly amount: Money }
  | { readonly kind: "daily_rate"; readonly rate: Money }
  | { readonly kind: "hourly_rate"; readonly rate: Money }
  | { readonly kind: "fixed_period_amount"; readonly amount: Money };

export interface CompensationAgreement {
  readonly effectiveFrom: string; readonly effectiveUntil: string | null; readonly basis: CompensationBasis;
}

export interface PayrollRelationship {
  readonly id: PayrollRelationshipId; readonly payrollDefinitionId: PayrollDefinitionId; readonly employeeId: EmployeeId;
  readonly startsOn: string; readonly endsOn: string | null; readonly status: "active" | "suspended" | "ended";
  readonly compensation: readonly CompensationAgreement[];
}

export interface PayrollWorkerSnapshot {
  readonly relationshipId: PayrollRelationshipId; readonly employeeId: EmployeeId; readonly nationalId: string;
  readonly displayName: string; readonly position: string; readonly compensation: readonly CompensationAgreement[];
}

export function payrollRelationship(input: PayrollRelationship): PayrollRelationship {
  requireLocalDate(input.startsOn); if (input.endsOn) requireLocalDate(input.endsOn);
  if (input.endsOn && input.endsOn < input.startsOn) throw new PayrollFailure("PAYROLL_RELATIONSHIP_INELIGIBLE", "Payroll relationship end precedes its start.");
  const compensation = [...input.compensation].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  compensation.forEach((agreement, index) => {
    requireLocalDate(agreement.effectiveFrom); if (agreement.effectiveUntil) requireLocalDate(agreement.effectiveUntil);
    if (agreement.effectiveUntil && agreement.effectiveUntil < agreement.effectiveFrom) throw new PayrollFailure("PAYROLL_RELATIONSHIP_INELIGIBLE", "Compensation period is invalid.");
    const previous = compensation[index - 1];
    if (previous && (!previous.effectiveUntil || previous.effectiveUntil >= agreement.effectiveFrom)) throw new PayrollFailure("PAYROLL_RELATIONSHIP_INELIGIBLE", "Compensation agreements overlap.");
  });
  return { ...input, compensation };
}

export function assertRelationshipEligible(relationship: PayrollRelationship, period: PayrollPeriod): void {
  if (relationship.status !== "active" || relationship.startsOn > period.end || (relationship.endsOn !== null && relationship.endsOn < period.start)) {
    throw new PayrollFailure("PAYROLL_RELATIONSHIP_INELIGIBLE", "Payroll relationship is not eligible for this period.");
  }
}

export function compensationCurrency(basis: CompensationBasis): CurrencyDefinition {
  switch (basis.kind) {
    case "daily_rate":
    case "hourly_rate": return basis.rate.currency;
    case "monthly_salary":
    case "fixed_period_amount": return basis.amount.currency;
  }
}
