import type { NativeSessionDto } from "@kontave/native-api-contracts";
import { authenticateNativeRequest } from "@/src/native-api/v1/auth/native-auth-context";
import { nativeError, nativeSuccess } from "@/src/native-api/v1/http/native-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateNativeRequest(request);
    if (!identity) return nativeError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    const session: NativeSessionDto = { user: { id: identity.userId, email: identity.email } };
    return nativeSuccess(session, requestId);
  } catch (cause: unknown) {
    console.error("native.auth.session.failed", { requestId, cause });
    return nativeError("INTERNAL_ERROR", "No se pudo verificar la sesión.", requestId, 500);
  }
}
