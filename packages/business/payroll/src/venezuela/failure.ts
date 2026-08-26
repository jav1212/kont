export type VenezuelanPayrollFailureCode =
  | "VE_PAYROLL_INVALID_INPUT"
  | "VE_PAYROLL_CURRENCY_MISMATCH"
  | "VE_PAYROLL_RULE_NOT_EFFECTIVE"
  | "VE_PAYROLL_INVALID_GRANT_MODE"
  | "VE_PAYROLL_MISSING_EXCHANGE_RATE"
  | "VE_PAYROLL_UNSUPPORTED_CLASSIFICATION";

export class VenezuelanPayrollFailure extends Error {
  /**
   * Creates a typed expected failure for Venezuelan payroll policy evaluation.
   * @param code - Stable machine-readable failure code.
   * @param message - Human-readable diagnostic message.
   * @param options - Optional standard error options, including the underlying cause.
   */
  constructor(readonly code: VenezuelanPayrollFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "VenezuelanPayrollFailure";
  }
}
