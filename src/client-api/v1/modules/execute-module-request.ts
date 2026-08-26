import {
  AuthorizationDenied,
  PERMISSIONS,
  permissionCode,
} from "@kontave/access-control/domain";
import { createSupabaseAuthorization } from "@kontave/access-control/supabase";
import { ModuleFailure } from "@kontave/modules-domain";
import { organizationId } from "@kontave/organizations/domain";
import { authenticateClientRequest } from "../auth/auth-context";
import { clientSource } from "../http/client-source";
import { apiError, apiSuccess } from "../http/response";

export async function executeModuleRequest<T>(
  request: Request,
  rawOrganizationId: string,
  manage: boolean,
  operation: (organization: ReturnType<typeof organizationId>) => Promise<T>,
): Promise<Response> {
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
    const organization = organizationId(rawOrganizationId);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
      throw new Error("Native module infrastructure is not configured.");
    await createSupabaseAuthorization({
      url,
      serviceRoleKey: key,
    }).require.execute({
      actor: { userId: identity.userId, organizationId: organization },
      permission: permissionCode(
        manage ? PERMISSIONS.MODULES_MANAGE : PERMISSIONS.MODULES_READ,
      ),
      resource: { type: "modules", organizationId: organization },
      context: {
        requestId,
        source: clientSource(request.headers.get("x-kontave-client")),
        occurredAt: new Date().toISOString(),
      },
    });
    return apiSuccess(await operation(organization), requestId);
  } catch (cause) {
    if (cause instanceof AuthorizationDenied)
      return apiError(
        "ORGANIZATION_ACCESS_DENIED",
        "No tienes acceso a los módulos.",
        requestId,
        403,
      );
    if (cause instanceof ModuleFailure)
      return apiError(
        cause.code,
        cause.message,
        requestId,
        cause.code === "MODULE_INVALID" ? 400 : 409,
      );
    console.error("client.modules.failed", { requestId, cause });
    return apiError(
      "INTERNAL_ERROR",
      "No se pudo procesar el módulo.",
      requestId,
      500,
    );
  }
}
