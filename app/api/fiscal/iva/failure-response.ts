import { TaxReportingFailure } from "@kontave/tax-reporting/domain";

/** Converts a tax-reporting failure into its stable HTTP status.
 * @param failure - Expected domain or persistence failure from tax-reporting.
 * @returns A JSON response with the stable error code and safe message.
 */
export function taxReportingFailureResponse(failure: TaxReportingFailure): Response {
  const status = failure.code === "TAX_REPORTING_UNAVAILABLE" ? 503
    : failure.code === "TAX_REPORTING_SCOPE" ? 403
      : failure.code === "TAX_REPORTING_IDEMPOTENCY_CONFLICT" || failure.code === "TAX_REPORTING_CONCURRENCY_CONFLICT" ? 409
        : failure.code === "TAX_REPORTING_DECLARATION_NOT_FOUND" ? 404
          : failure.code === "TAX_REPORTING_PERIODICITY_UNCONFIGURED" ? 422
          : failure.code === "TAX_REPORTING_PERIOD_CLOSED" || failure.code === "TAX_REPORTING_PERIOD_TRANSITION_INVALID" || failure.code === "TAX_REPORTING_PERIODICITY_LOCKED" ? 409 : 422;
  return Response.json({ error: failure.message, code: failure.code }, { status });
}
