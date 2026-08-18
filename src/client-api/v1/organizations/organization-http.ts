import { OrganizationFailure } from "@kontave/organizations-domain";
import { apiError } from "../http/response";

export function organizationErrorResponse(
  cause: unknown,
  requestId: string,
): Response {
  if (cause instanceof TypeError) {
    return apiError(
      "INVALID_REQUEST",
      "El identificador solicitado no es válido.",
      requestId,
      400,
    );
  }
  if (cause instanceof OrganizationFailure) {
    const status =
      cause.code === "ORGANIZATION_REPOSITORY_UNAVAILABLE"
        ? 503
        : cause.code.endsWith("ACCESS_DENIED")
          ? 403
          : 404;
    const code =
      cause.code === "ORGANIZATION_REPOSITORY_UNAVAILABLE"
        ? "INTERNAL_ERROR"
        : cause.code;
    return apiError(code, cause.message, requestId, status);
  }
  console.error("client.organizations.failed", { requestId, cause });
  return apiError(
    "INTERNAL_ERROR",
    "No se pudo consultar la organización.",
    requestId,
    500,
  );
}
