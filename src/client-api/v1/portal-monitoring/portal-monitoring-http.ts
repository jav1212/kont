import { PortalMonitoringFailure } from "@kontave/portal-monitoring-domain";
import { apiError } from "../http/response";

export function portalMonitoringErrorResponse(
  cause: unknown,
  requestId: string,
): Response {
  if (cause instanceof PortalMonitoringFailure) {
    return apiError(cause.code, cause.message, requestId, 503);
  }
  console.error("client.platform_status.failed", { requestId, cause });
  return apiError(
    "INTERNAL_ERROR",
    "No se pudo consultar el estado de los portales.",
    requestId,
    500,
  );
}
