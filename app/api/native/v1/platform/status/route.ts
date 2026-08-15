import { authenticateNativeRequest } from "@/src/native-api/v1/auth/native-auth-context";
import { nativeError, nativeSuccess } from "@/src/native-api/v1/http/native-response";
import { createPlatformStatusActions } from "@/src/native-api/v1/platform-status/platform-status-actions";
import { platformStatusErrorResponse } from "@/src/native-api/v1/platform-status/platform-status-http";
import { toNativePlatformStatusDto } from "@/src/native-api/v1/platform-status/platform-status-mapper";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateNativeRequest(request);
    if (!identity) {
      return nativeError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    }
    const snapshot = await createPlatformStatusActions().getPlatformStatus.execute();
    return nativeSuccess(toNativePlatformStatusDto(snapshot), requestId);
  } catch (cause: unknown) {
    return platformStatusErrorResponse(cause, requestId);
  }
}
