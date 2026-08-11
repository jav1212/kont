import { BillingFailure } from "@kontave/billing-domain";
import { nativeError } from "../http/native-response";

export function billingErrorResponse(cause: unknown, requestId: string): Response {
  if (cause instanceof TypeError) return nativeError("INVALID_REQUEST", "La solicitud no es válida.", requestId, 400);
  if (cause instanceof BillingFailure) {
    if (cause.code === "BILLING_ACCESS_DENIED") return nativeError(cause.code, cause.message, requestId, 403);
    if (cause.code === "BILLING_ACCOUNT_NOT_FOUND") return nativeError(cause.code, cause.message, requestId, 404);
    return nativeError("INTERNAL_ERROR", cause.message, requestId, 503);
  }
  console.error("native.billing.failed", { requestId, cause });
  return nativeError("INTERNAL_ERROR", "No se pudo consultar la facturación.", requestId, 500);
}
