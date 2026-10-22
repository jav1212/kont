/** Stable expected failure codes emitted by accounting-integration contracts. */
export type AccountingIntegrationFailureCode =
  | "ACCOUNTING_INTEGRATION_IDENTIFIER_INVALID"
  | "ACCOUNTING_INTEGRATION_DATE_INVALID"
  | "ACCOUNTING_INTEGRATION_AMOUNT_INVALID"
  | "ACCOUNTING_INTEGRATION_CURRENCY_INVALID"
  | "ACCOUNTING_INTEGRATION_RULE_INVALID"
  | "ACCOUNTING_INTEGRATION_RULESET_INVALID"
  | "ACCOUNTING_INTEGRATION_UNBALANCED"
  | "ACCOUNTING_INTEGRATION_ORIGINAL_OPERATION_INVALID"
  | "ACCOUNTING_INTEGRATION_ORIGINAL_OPERATION_NOT_FOUND"
  | "ACCOUNTING_INTEGRATION_REVERSAL_CONFLICT"
  | "ACCOUNTING_INTEGRATION_IDEMPOTENCY_CONFLICT"
  | "ACCOUNTING_INTEGRATION_PERIOD_CLOSED"
  | "ACCOUNTING_INTEGRATION_ACCESS_DENIED"
  | "ACCOUNTING_INTEGRATION_SOURCE_NOT_CONFIRMED"
  | "ACCOUNTING_INTEGRATION_SOURCE_CHANGED"
  | "ACCOUNTING_INTEGRATION_SOURCE_INVALID"
  | "ACCOUNTING_INTEGRATION_RULESET_CHANGED"
  | "ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE";

/** Expected failure raised by the portable accounting-integration boundary. */
export class AccountingIntegrationFailure extends Error {
  /**
   * Creates an expected accounting-integration failure.
   * @param code - Stable machine-readable failure classification.
   * @param message - Safe diagnostic message for callers.
   * @param options - Optional causal error without exposing persistence details.
   * @returns A typed accounting-integration error.
   */
  public constructor(
    public readonly code: AccountingIntegrationFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AccountingIntegrationFailure";
  }
}
