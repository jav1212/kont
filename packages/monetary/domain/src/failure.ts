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

export class MonetaryFailure extends Error {
  readonly code: MonetaryFailureCode;

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
