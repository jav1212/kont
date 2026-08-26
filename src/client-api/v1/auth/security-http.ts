import {
  AuthenticationFailure,
  authenticatedSessionId,
} from "@kontave/auth/domain";
import { authenticateClientRequest, readBearerToken } from "./auth-context";
import { apiError, apiSuccess } from "../http/response";
import { createSecurityActions } from "./security-actions";

interface SecurityContext {
  readonly actions: ReturnType<typeof createSecurityActions>;
  readonly userId: string;
  readonly sessionId: ReturnType<typeof authenticatedSessionId>;
  readonly accessToken: string;
}

export async function executeSecurityRequest<T>(
  request: Request,
  operation: (input: SecurityContext) => Promise<T>,
) {
  const requestId = crypto.randomUUID();
  try {
    const accessToken = readBearerToken(request.headers.get("authorization"));
    const identity = accessToken
      ? await authenticateClientRequest(request)
      : null;
    if (!accessToken || !identity?.sessionId) {
      return apiError(
        "INVALID_ACCESS_TOKEN",
        "La sesión no es válida o expiró.",
        requestId,
        401,
      );
    }

    const value = await operation({
      actions: createSecurityActions(),
      userId: identity.userId,
      sessionId: authenticatedSessionId(identity.sessionId),
      accessToken,
    });
    return apiSuccess(value, requestId);
  } catch (cause) {
    if (cause instanceof AuthenticationFailure) {
      if (cause.code === "SESSION_REVOKED") {
        return apiError("SESSION_REVOKED", cause.message, requestId, 401);
      }
      if (cause.code === "SESSION_NOT_FOUND") {
        return apiError("SESSION_NOT_FOUND", cause.message, requestId, 404);
      }
      if (cause.code === "PASSWORD_POLICY_VIOLATION") {
        return apiError(
          "PASSWORD_POLICY_VIOLATION",
          cause.message,
          requestId,
          400,
        );
      }
      if (cause.code === "INVALID_INPUT") {
        return apiError("INVALID_REQUEST", cause.message, requestId, 400);
      }
      if (cause.code === "SESSION_EXPIRED") {
        return apiError("INVALID_ACCESS_TOKEN", cause.message, requestId, 401);
      }
    }

    console.error("client.security.failed", { requestId, cause });
    return apiError(
      "INTERNAL_ERROR",
      "No se pudo procesar la seguridad de la cuenta.",
      requestId,
      500,
    );
  }
}
