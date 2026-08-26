import { authenticateClientRequest } from "@/src/client-api/v1/auth/auth-context";
import { apiError, apiSuccess } from "@/src/client-api/v1/http/response";
import { createPortalMonitoringActions } from "@/src/client-api/v1/portal-monitoring/portal-monitoring-actions";
import { portalMonitoringErrorResponse } from "@/src/client-api/v1/portal-monitoring/portal-monitoring-http";
import { toPortalMonitoringDto } from "@/src/client-api/v1/portal-monitoring/portal-monitoring-mapper";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateClientRequest(request);
    if (!identity) {
      return apiError(
        "INVALID_ACCESS_TOKEN",
        "La sesión no es válida o expiró.",
        requestId,
        401,
      );
    }
    const snapshot =
      await createPortalMonitoringActions().getPortalMonitoring.execute();
    return apiSuccess(toPortalMonitoringDto(snapshot), requestId);
  } catch (cause: unknown) {
    return portalMonitoringErrorResponse(cause, requestId);
  }
}
