export type FiscalFailureCode =
  | "FISCAL_IDENTIFIER_INVALID"
  | "FISCAL_DATE_INVALID"
  | "FISCAL_PARTY_INVALID"
  | "FISCAL_LINE_INVALID"
  | "FISCAL_ADJUSTMENT_INVALID"
  | "FISCAL_TAX_INVALID"
  | "FISCAL_PAYMENT_INVALID"
  | "FISCAL_REFERENCE_INVALID"
  | "FISCAL_DOCUMENT_INVALID"
  | "FISCAL_DOCUMENT_NOT_FOUND"
  | "FISCAL_DOCUMENT_IDEMPOTENCY_CONFLICT"
  | "FISCAL_DOCUMENT_SOURCE_CONFLICT"
  | "FISCAL_DOCUMENT_IMMUTABLE"
  | "FISCAL_DOCUMENT_OUTSIDE_COMPANY"
  | "FISCAL_DOCUMENT_ACTOR_OUTSIDE_ORGANIZATION"
  | "FISCAL_DOCUMENT_IDENTITY_IMMUTABLE"
  | "FISCAL_DOCUMENT_TRANSITION_INVALID"
  | "FISCAL_DOCUMENT_ALREADY_FINALIZED"
  | "FISCAL_AUDIT_APPEND_ONLY"
  | "FISCAL_ISSUANCE_ATTEMPT_INVALID"
  | "FISCAL_ISSUANCE_ATTEMPT_ID_CONFLICT"
  | "FISCAL_ISSUANCE_COMMAND_IDEMPOTENCY_CONFLICT"
  | "FISCAL_ISSUANCE_COMMAND_TERMINAL"
  | "FISCAL_ISSUANCE_COMMAND_IDENTITY_IMMUTABLE"
  | "FISCAL_ISSUANCE_COMMAND_TRANSITION_INVALID"
  | "FISCAL_ISSUANCE_SNAPSHOT_INVALID"
  | "FISCAL_TOTALS_MISMATCH"
  | "FISCAL_CURRENCY_MISMATCH"
  | "FISCAL_TRANSITION_INVALID";

export class FiscalFailure extends Error {
  /**
   * Creates an expected failure owned by the fiscal domain.
   *
   * @param code - Stable machine-readable failure classification.
   * @param message - Safe diagnostic description of the failed invariant.
   * @param options - Optional causal error information.
   * @returns A typed fiscal failure instance.
   */
  constructor(readonly code: FiscalFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FiscalFailure";
  }
}
