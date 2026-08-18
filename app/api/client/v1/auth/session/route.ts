import type { SessionDto } from "@kontave/client-contracts";
import { authenticateClientRequest } from "@/src/client-api/v1/auth/auth-context";
import { apiError, apiSuccess } from "@/src/client-api/v1/http/response";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateClientRequest(request);
    if (!identity)
      return apiError(
        "INVALID_ACCESS_TOKEN",
        "La sesión no es válida o expiró.",
        requestId,
        401,
      );
    const session: SessionDto = {
      user: { id: identity.userId, email: identity.email },
    };
    return apiSuccess(session, requestId);
  } catch (cause: unknown) {
    console.error("client.auth.session.failed", { requestId, cause });
    return apiError(
      "INTERNAL_ERROR",
      "No se pudo verificar la sesión.",
      requestId,
      500,
    );
  }
}
