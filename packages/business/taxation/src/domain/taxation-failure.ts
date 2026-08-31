export type TaxationFailureCode =
  | "TAXATION_IDENTIFIER_INVALID"
  | "TAXATION_DATE_INVALID"
  | "TAXATION_PROFILE_INVALID"
  | "TAXATION_ASSIGNMENT_OVERLAP"
  | "TAXATION_CLASSIFICATION_MISSING"
  | "TAXATION_RULE_INVALID"
  | "TAXATION_RULE_MISSING"
  | "TAXATION_RULE_AMBIGUOUS"
  | "TAXATION_DECISION_INVALID"
  | "TAXATION_CURRENCY_MISMATCH"
  | "TAXATION_PROFILE_NOT_FOUND"
  | "TAXATION_VERSION_CONFLICT"
  | "TAXATION_ACCESS_DENIED"
  | "TAXATION_REPOSITORY_UNAVAILABLE";

/** Expected failure raised by taxation domain and boundary operations. */
export class TaxationFailure extends Error {
  /**
   * @param code - Stable machine-readable failure code.
   * @param message - Safe diagnostic message.
   * @param options - Optional underlying cause.
   */
  constructor(readonly code: TaxationFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TaxationFailure";
  }
}
