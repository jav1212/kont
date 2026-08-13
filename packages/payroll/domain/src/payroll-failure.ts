export type PayrollFailureCode =
  | "PAYROLL_IDENTIFIER_INVALID"
  | "PAYROLL_PERIOD_INVALID"
  | "PAYROLL_DEFINITION_INVALID"
  | "PAYROLL_RELATIONSHIP_INELIGIBLE"
  | "PAYROLL_ELEMENT_INVALID"
  | "PAYROLL_ELEMENT_DEPENDENCY_MISSING"
  | "PAYROLL_ELEMENT_DEPENDENCY_CYCLE"
  | "PAYROLL_ELEMENT_ENTRY_INVALID"
  | "PAYROLL_CALCULATION_FAILED"
  | "PAYROLL_CURRENCY_MISMATCH"
  | "PAYROLL_RUN_TRANSITION_INVALID"
  | "PAYROLL_RUN_HAS_ERRORS"
  | "PAYROLL_RECONCILIATION_FAILED";

export class PayrollFailure extends Error {
  constructor(readonly code: PayrollFailureCode, message: string, options?: ErrorOptions) {
    super(message, options); this.name = "PayrollFailure";
  }
}
