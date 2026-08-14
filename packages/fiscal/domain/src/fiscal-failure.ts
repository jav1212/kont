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
  | "FISCAL_TOTALS_MISMATCH"
  | "FISCAL_CURRENCY_MISMATCH"
  | "FISCAL_TRANSITION_INVALID";

export class FiscalFailure extends Error {
  constructor(readonly code: FiscalFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FiscalFailure";
  }
}
