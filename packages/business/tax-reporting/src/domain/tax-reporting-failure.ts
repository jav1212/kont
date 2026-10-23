/** Expected failures raised by the tax-reporting capability. */
export class TaxReportingFailure extends Error {
  /** @param code - Stable machine-readable failure code. @param message - Safe diagnostic message. */
  constructor(readonly code: TaxReportingFailureCode, message: string) { super(message); this.name = "TaxReportingFailure"; }
}
/** Stable errors exposed by reporting ports. */
export type TaxReportingFailureCode = "TAX_REPORTING_INVALID" | "TAX_REPORTING_UNAVAILABLE" | "TAX_REPORTING_SCOPE" | "TAX_REPORTING_IDEMPOTENCY_CONFLICT" | "TAX_REPORTING_CONCURRENCY_CONFLICT" | "TAX_REPORTING_DECLARATION_INVALID" | "TAX_REPORTING_DECLARATION_NOT_FOUND" | "TAX_REPORTING_CORRECTION_SOURCE_INVALID" | "TAX_REPORTING_CORRECTION_EXCEEDS_SOURCE" | "TAX_REPORTING_PERIOD_TRANSITION_INVALID" | "TAX_REPORTING_PERIOD_CLOSED" | "TAX_REPORTING_PERIODICITY_UNCONFIGURED" | "TAX_REPORTING_PERIODICITY_LOCKED";
