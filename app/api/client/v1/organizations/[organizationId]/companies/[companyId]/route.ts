import {
  companyId,
  organizationId,
  userId,
} from "@kontave/organizations-domain";
import { authenticateClientRequest } from "@/src/client-api/v1/auth/auth-context";
import { apiError, apiSuccess } from "@/src/client-api/v1/http/response";
import { createOrganizationActions } from "@/src/client-api/v1/organizations/organization-actions";
import { organizationErrorResponse } from "@/src/client-api/v1/organizations/organization-http";
import { toCompanyDto } from "@/src/client-api/v1/organizations/organization-mapper";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string; companyId: string }> },
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
    const params = await context.params;
    const company = await createOrganizationActions().getCompany.execute(
      userId(identity.userId),
      organizationId(params.organizationId),
      companyId(params.companyId),
    );
    return apiSuccess(toCompanyDto(company), requestId);
  } catch (cause: unknown) {
    return organizationErrorResponse(cause, requestId);
  }
}
