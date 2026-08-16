import { BillingFailure } from "@kontave/billing-domain";
import { AuthorizationDenied } from "@kontave/access-control-domain";
import { nativeError } from "../http/native-response";

export function billingErrorResponse(cause: unknown, requestId: string): Response {
  if (cause instanceof AuthorizationDenied) return nativeError("BILLING_ACCESS_DENIED", "No tienes acceso a esta operación de facturación.", requestId, 403);
  if (cause instanceof TypeError) return nativeError("INVALID_REQUEST", "La solicitud no es válida.", requestId, 400);
  if (cause instanceof BillingFailure) {
    if (cause.code === "BILLING_ACCESS_DENIED") return nativeError(cause.code, cause.message, requestId, 403);
    if (cause.code === "BILLING_ACCOUNT_NOT_FOUND") return nativeError(cause.code, cause.message, requestId, 404);
    if (cause.code === "BILLING_PLAN_NOT_FOUND") return nativeError(cause.code, cause.message, requestId, 404);
    if (cause.code === "BILLING_PLAN_CONTACT_REQUIRED") return nativeError(cause.code, cause.message, requestId, 409);
    if (cause.code === "BILLING_PAYMENT_REQUEST_INVALID" || cause.code === "BILLING_RECEIPT_INVALID") return nativeError(cause.code, cause.message, requestId, 400);
    if (cause.code === "BILLING_RECEIPT_UNAVAILABLE") return nativeError(cause.code, cause.message, requestId, 503);
    return nativeError("INTERNAL_ERROR", cause.message, requestId, 503);
  }
  console.error("native.billing.failed", { requestId, cause });
  return nativeError("INTERNAL_ERROR", "No se pudo consultar la facturación.", requestId, 500);
}
