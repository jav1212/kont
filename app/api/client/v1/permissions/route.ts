import { authenticateClientRequest } from "@/src/client-api/v1/auth/auth-context";
import { apiError, apiSuccess } from "@/src/client-api/v1/http/response";
import { createAccessControlActions } from "@/src/client-api/v1/access-control/access-control-actions";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    if (!(await authenticateClientRequest(request)))
      return apiError(
        "INVALID_ACCESS_TOKEN",
        "La sesión no es válida o expiró.",
        requestId,
        401,
      );
    return apiSuccess(
      await createAccessControlActions().listPermissions.execute(),
      requestId,
    );
  } catch (cause) {
    console.error("client.permissions.failed", { requestId, cause });
    return apiError(
      "INTERNAL_ERROR",
      "No se pudieron consultar los permisos.",
      requestId,
      500,
    );
  }
}
