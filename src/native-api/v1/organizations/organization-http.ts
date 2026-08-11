import { OrganizationFailure } from "@kontave/organizations-domain";
import { nativeError } from "../http/native-response";

export function organizationErrorResponse(cause: unknown, requestId: string): Response {
  if (cause instanceof TypeError) {
    return nativeError("INVALID_REQUEST", "El identificador solicitado no es válido.", requestId, 400);
  }
  if (cause instanceof OrganizationFailure) {
    const status = cause.code === "ORGANIZATION_REPOSITORY_UNAVAILABLE" ? 503
      : cause.code.endsWith("ACCESS_DENIED") ? 403
      : 404;
    const code = cause.code === "ORGANIZATION_REPOSITORY_UNAVAILABLE" ? "INTERNAL_ERROR" : cause.code;
    return nativeError(code, cause.message, requestId, status);
  }
  console.error("native.organizations.failed", { requestId, cause });
  return nativeError("INTERNAL_ERROR", "No se pudo consultar la organización.", requestId, 500);
}
