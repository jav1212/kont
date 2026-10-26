/** Stable expected failures produced by accounting operations. */
export class AccountingFailure extends Error {
  /**
   * Creates a failure safe to translate at an application boundary.
   * @param code - Machine-readable business failure code.
   * @param message - Safe explanation of the rejected operation.
   * @param options - Optional original infrastructure failure.
   * @returns A typed accounting failure.
   */
  public constructor(
    public readonly code:
      | "INVALID"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "VERSION_CONFLICT"
      | "IDEMPOTENCY_CONFLICT"
      | "CODE_OUT_OF_STRUCTURE"
      | "DUPLICATE_CODE"
      | "PARENT_INVALID"
      | "TYPE_MISMATCH"
      | "HAS_POSTINGS"
      | "HAS_CHILDREN"
      | "IN_USE"
      | "ACTIVE_CHART_CONFLICT"
      | "UNAVAILABLE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AccountingFailure";
  }
}
