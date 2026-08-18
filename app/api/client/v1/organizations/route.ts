import { userId } from "@kontave/organizations-domain";
import { authenticateClientRequest } from "@/src/client-api/v1/auth/auth-context";
import { apiError, apiSuccess } from "@/src/client-api/v1/http/response";
import { createOrganizationActions } from "@/src/client-api/v1/organizations/organization-actions";
import { organizationErrorResponse } from "@/src/client-api/v1/organizations/organization-http";
import { toOrganizationDto } from "@/src/client-api/v1/organizations/organization-mapper";

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
    const access = await createOrganizationActions().listOrganizations.execute(
      userId(identity.userId),
    );
    return apiSuccess(access.map(toOrganizationDto), requestId);
  } catch (cause: unknown) {
    return organizationErrorResponse(cause, requestId);
  }
}
