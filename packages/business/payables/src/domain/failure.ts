/** Stable expected failures produced by Accounts Payable operations. */
export class PayablesFailure extends Error {
  /**
   * @param code - Machine-readable failure classification.
   * @param message - Safe explanation suitable for an application boundary.
   * @param options - Optional underlying infrastructure failure.
   * @returns A typed Accounts Payable failure.
   * @throws Never; construction only records an expected failure.
   */
  public constructor(
    public readonly code:
      | "INVALID"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "VERSION_CONFLICT"
      | "IDEMPOTENCY_CONFLICT"
      | "CURRENCY_MISMATCH"
      | "EXCEEDS_BALANCE"
      | "SOURCE_ALREADY_REGISTERED"
      | "HAS_APPLICATIONS"
      | "PERIOD_CLOSED"
      | "WITHHOLDING_DUPLICATE"
      | "WITHHOLDING_DECLARED"
      | "TREASURY_REJECTED"
      | "APPROVAL_PENDING"
      | "ACCOUNTING_RULES_MISSING"
      | "UNAVAILABLE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PayablesFailure";
  }
}
