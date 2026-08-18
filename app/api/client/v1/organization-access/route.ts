import { userId } from "@kontave/organizations-domain";
import { authenticateClientRequest } from "@/src/client-api/v1/auth/auth-context";
import { apiError, apiSuccess } from "@/src/client-api/v1/http/response";
import { createOrganizationAccessActions } from "@/src/client-api/v1/organization-access/organization-access-actions";
import { toAccessibleOrganizationDto } from "@/src/client-api/v1/organization-access/organization-access-dto";

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
    const result = await createOrganizationAccessActions().portfolio.execute(
      userId(identity.userId),
      new Date().toISOString(),
    );
    return apiSuccess(result.map(toAccessibleOrganizationDto), requestId);
  } catch (cause: unknown) {
    console.error("client.organization_access.failed", { requestId, cause });
    return apiError(
      "INTERNAL_ERROR",
      "No se pudo obtener el portafolio organizacional.",
      requestId,
      500,
    );
  }
}
