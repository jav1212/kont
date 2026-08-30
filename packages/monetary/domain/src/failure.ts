export type MonetaryFailureCode =
  | "INVALID_DECIMAL"
  | "INVALID_CURRENCY_CODE"
  | "INVALID_MINOR_UNIT"
  | "CURRENCY_MISMATCH"
  | "INVALID_EXCHANGE_RATE"
  | "EXCHANGE_RATE_DIRECTION_MISMATCH"
  | "INVALID_ROUNDING_SCALE"
  | "DIVISION_BY_ZERO"
  | "INVALID_ALLOCATION";

/** Expected failure raised by exact monetary domain operations. */
export class MonetaryFailure extends Error {
  readonly code: MonetaryFailureCode;

  /**
   * @param code - Stable machine-readable failure code.
   * @param message - Safe diagnostic message.
   * @param options - Optional underlying cause.
   */
  constructor(
    code: MonetaryFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
    this.name = "MonetaryFailure";
  }
}
