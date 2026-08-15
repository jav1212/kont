import { PlatformStatusFailure } from "@kontave/platform-status-domain";
import { nativeError } from "../http/native-response";

export function platformStatusErrorResponse(cause: unknown, requestId: string): Response {
  if (cause instanceof PlatformStatusFailure) {
    return nativeError(cause.code, cause.message, requestId, 503);
  }
  console.error("native.platform_status.failed", { requestId, cause });
  return nativeError("INTERNAL_ERROR", "No se pudo consultar el estado de los portales.", requestId, 500);
}
