import { ClientInputValidationError } from "@kontave/client-contracts";
import { OrganizationFailure } from "@kontave/organizations/domain";
import { OperationContextFailure } from "@kontave/operation-context/domain";
import {
  TenantAuthError,
  TenantForbiddenError,
} from "@/src/shared/backend/utils/require-tenant";

/**
 * Converts expected Web operation-context failures into safe, uncached error responses.
 *
 * @param cause - Failure raised by authentication, scope checks, validation, or the coordinator.
 * @returns JSON error envelope that never includes database or provider diagnostics.
 * @throws Never for expected failures.
 */
export function webOperationContextErrorResponse(cause: unknown): Response {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let error = "No se pudo procesar el contexto operativo.";
  if (cause instanceof TenantAuthError) {
    status = 401;
    code = "UNAUTHENTICATED";
    error = "La sesión expiró. Inicia sesión nuevamente.";
  } else if (cause instanceof TenantForbiddenError) {
    status = 403;
    code = "OPERATION_CONTEXT_ACCESS_DENIED";
    error = "No tienes acceso al contexto operativo solicitado.";
  } else if (
    cause instanceof ClientInputValidationError ||
    cause instanceof SyntaxError ||
    cause instanceof TypeError
  ) {
    status = 400;
    code = "INVALID_REQUEST";
    error = "Los datos enviados no son válidos.";
  } else if (cause instanceof OrganizationFailure) {
    status =
      cause.code === "ORGANIZATION_REPOSITORY_UNAVAILABLE"
        ? 503
        : cause.code.endsWith("NOT_FOUND")
          ? 404
          : 403;
    code = cause.code;
    error =
      cause.code === "ORGANIZATION_REPOSITORY_UNAVAILABLE"
        ? "No se pudo verificar la empresa solicitada."
        : cause.code.endsWith("NOT_FOUND")
          ? "La empresa solicitada no existe."
          : "No tienes acceso a la empresa solicitada.";
  } else if (cause instanceof OperationContextFailure) {
    code = cause.code;
    status =
      cause.code === "OPERATION_CONTEXT_ACCESS_DENIED"
        ? 403
        : cause.code === "OPERATION_CONTEXT_VERSION_CONFLICT"
          ? 409
          : cause.code === "OPERATION_CONTEXT_INVALID"
            ? 400
            : cause.code === "OPERATION_CONTEXT_RATE_UNAVAILABLE"
              ? 422
              : 503;
    error = cause.message;
  }
  return Response.json(
    { error, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
