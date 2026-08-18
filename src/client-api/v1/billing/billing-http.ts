import { BillingFailure } from "@kontave/billing-domain";
import { AuthorizationDenied } from "@kontave/access-control-domain";
import { apiError } from "../http/response";

export function billingErrorResponse(
  cause: unknown,
  requestId: string,
): Response {
  if (cause instanceof AuthorizationDenied)
    return apiError(
      "BILLING_ACCESS_DENIED",
      "No tienes acceso a esta operación de facturación.",
      requestId,
      403,
    );
  if (cause instanceof TypeError)
    return apiError(
      "INVALID_REQUEST",
      "La solicitud no es válida.",
      requestId,
      400,
    );
  if (cause instanceof BillingFailure) {
    if (cause.code === "BILLING_ACCESS_DENIED")
      return apiError(cause.code, cause.message, requestId, 403);
    if (cause.code === "BILLING_ACCOUNT_NOT_FOUND")
      return apiError(cause.code, cause.message, requestId, 404);
    if (cause.code === "BILLING_PLAN_NOT_FOUND")
      return apiError(cause.code, cause.message, requestId, 404);
    if (cause.code === "BILLING_PLAN_CONTACT_REQUIRED")
      return apiError(cause.code, cause.message, requestId, 409);
    if (
      cause.code === "BILLING_PAYMENT_REQUEST_INVALID" ||
      cause.code === "BILLING_RECEIPT_INVALID"
    )
      return apiError(cause.code, cause.message, requestId, 400);
    if (cause.code === "BILLING_RECEIPT_UNAVAILABLE")
      return apiError(cause.code, cause.message, requestId, 503);
    return apiError("INTERNAL_ERROR", cause.message, requestId, 503);
  }
  console.error("client.billing.failed", { requestId, cause });
  return apiError(
    "INTERNAL_ERROR",
    "No se pudo consultar la facturación.",
    requestId,
    500,
  );
}
