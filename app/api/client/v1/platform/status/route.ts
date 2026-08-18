import { authenticateClientRequest } from "@/src/client-api/v1/auth/auth-context";
import { apiError, apiSuccess } from "@/src/client-api/v1/http/response";
import { createPlatformStatusActions } from "@/src/client-api/v1/platform-status/platform-status-actions";
import { platformStatusErrorResponse } from "@/src/client-api/v1/platform-status/platform-status-http";
import { toPlatformStatusDto } from "@/src/client-api/v1/platform-status/platform-status-mapper";

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
      await createPlatformStatusActions().getPlatformStatus.execute();
    return apiSuccess(toPlatformStatusDto(snapshot), requestId);
  } catch (cause: unknown) {
    return platformStatusErrorResponse(cause, requestId);
  }
}
