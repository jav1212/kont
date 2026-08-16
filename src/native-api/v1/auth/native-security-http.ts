import { AuthenticationFailure, authenticatedSessionId } from "@kontave/auth-domain";
import { authenticateNativeRequest, readBearerToken } from "./native-auth-context";
import { nativeError, nativeSuccess } from "../http/native-response";
import { createNativeSecurityActions } from "./native-security-actions";

interface NativeSecurityContext {
  readonly actions: ReturnType<typeof createNativeSecurityActions>;
  readonly userId: string;
  readonly sessionId: ReturnType<typeof authenticatedSessionId>;
  readonly accessToken: string;
}

export async function executeSecurityRequest<T>(
  request: Request,
  operation: (input: NativeSecurityContext) => Promise<T>,
) {
  const requestId = crypto.randomUUID();
  try {
    const accessToken = readBearerToken(request.headers.get("authorization"));
    const identity = accessToken ? await authenticateNativeRequest(request) : null;
    if (!accessToken || !identity?.sessionId) {
      return nativeError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    }

    const value = await operation({
      actions: createNativeSecurityActions(),
      userId: identity.userId,
      sessionId: authenticatedSessionId(identity.sessionId),
      accessToken,
    });
    return nativeSuccess(value, requestId);
  } catch (cause) {
    if (cause instanceof AuthenticationFailure) {
      if (cause.code === "SESSION_REVOKED") {
        return nativeError("SESSION_REVOKED", cause.message, requestId, 401);
      }
      if (cause.code === "SESSION_NOT_FOUND") {
        return nativeError("SESSION_NOT_FOUND", cause.message, requestId, 404);
      }
      if (cause.code === "PASSWORD_POLICY_VIOLATION") {
        return nativeError("PASSWORD_POLICY_VIOLATION", cause.message, requestId, 400);
      }
      if (cause.code === "INVALID_INPUT") {
        return nativeError("INVALID_REQUEST", cause.message, requestId, 400);
      }
      if (cause.code === "SESSION_EXPIRED") {
        return nativeError("INVALID_ACCESS_TOKEN", cause.message, requestId, 401);
      }
    }

    console.error("native.security.failed", { requestId, cause });
    return nativeError("INTERNAL_ERROR", "No se pudo procesar la seguridad de la cuenta.", requestId, 500);
  }
}
