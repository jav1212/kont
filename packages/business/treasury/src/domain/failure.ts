/** Stable expected failures produced by Treasury commands. */
export class TreasuryFailure extends Error {
  /**
   * @param code - Machine-readable failure classification.
   * @param message - Safe explanation for an application boundary.
   * @param options - Original failure when infrastructure caused this error.
   * @returns A typed treasury failure.
   */
  public constructor(
    public readonly code:
      | "INVALID"
      | "NOT_FOUND"
      | "CONFLICT"
      | "FORBIDDEN"
      | "INSUFFICIENT_FUNDS"
      | "CLOSED_PERIOD"
      | "IDEMPOTENCY_CONFLICT"
      | "SOURCE_ALREADY_APPLIED"
      | "AMBIGUOUS_RECONCILIATION"
      | "UNAVAILABLE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TreasuryFailure";
  }
}
