import { OperationContextFailure } from "@kontave/operation-context/domain";
import { apiError } from "@/src/client-api/v1/http/response";

export function operationContextErrorResponse(
  cause: unknown,
  requestId: string,
): Response {
  if (cause instanceof OperationContextFailure) {
    const status =
      cause.code === "OPERATION_CONTEXT_ACCESS_DENIED"
        ? 403
        : cause.code === "OPERATION_CONTEXT_VERSION_CONFLICT"
          ? 409
          : cause.code === "OPERATION_CONTEXT_INVALID"
            ? 400
            : cause.code === "OPERATION_CONTEXT_RATE_UNAVAILABLE"
              ? 422
              : 503;
    return apiError(cause.code, cause.message, requestId, status);
  }
  console.error("client.operation_context.failed", { requestId, cause });
  return apiError(
    "INTERNAL_ERROR",
    "No se pudo procesar el contexto operativo.",
    requestId,
    500,
  );
}
