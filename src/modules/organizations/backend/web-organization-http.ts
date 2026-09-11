import { AccessControlFailure, AuthorizationDenied } from "@kontave/access-control/domain";
import { OrganizationFailure } from "@kontave/organizations/domain";
import { TenantAuthError, TenantForbiddenError } from "@/src/shared/backend/utils/require-tenant";
import { z } from "zod";

/** Invalid client input, distinguished from malformed upstream persistence data. */
export class WebOrganizationInputError extends Error {}

/**
 * Decodes a Web request body without coercing version or identity fields.
 * @param schema Runtime input contract.
 * @param value Untrusted request value.
 * @returns The validated request value.
 * @throws WebOrganizationInputError when the value fails validation.
 */
export function parseOrganizationInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new WebOrganizationInputError("Los datos enviados no son válidos.");
  return result.data;
}

/**
 * Maps expected authentication, domain, and concurrency failures to safe Web errors.
 * @param cause Failure caught at the route boundary.
 * @returns An uncached JSON error without database diagnostics or credentials.
 * @throws Never for ordinary Error values.
 */
export function webOrganizationErrorResponse(cause: unknown): Response {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let error = "No se pudo procesar la organización.";
  if (cause instanceof TenantAuthError) {
    status = 401; code = "UNAUTHENTICATED"; error = "La sesión expiró. Inicia sesión nuevamente.";
  } else if (cause instanceof TenantForbiddenError || cause instanceof AuthorizationDenied) {
    status = 403; code = "ORGANIZATION_ACCESS_DENIED"; error = "No tienes acceso a esta organización o acción.";
  } else if (cause instanceof WebOrganizationInputError || cause instanceof SyntaxError) {
    status = 400; code = "INVALID_REQUEST"; error = "Los datos enviados no son válidos.";
  } else if (cause instanceof OrganizationFailure || cause instanceof AccessControlFailure) {
    code = cause.code;
    status = code.endsWith("VERSION_CONFLICT") ? 409
      : code.endsWith("ACCESS_DENIED") ? 403
      : code.endsWith("NOT_FOUND") ? 404
      : code.endsWith("REPOSITORY_UNAVAILABLE") ? 503 : 400;
    error = cause.message;
  } else if (cause instanceof z.ZodError) {
    status = 503; code = "INVALID_UPSTREAM_DATA";
  }
  return Response.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } });
}
