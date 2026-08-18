import { organizationId, userId } from "@kontave/organizations-domain";
import { authenticateClientRequest } from "@/src/client-api/v1/auth/auth-context";
import { apiError, apiSuccess } from "@/src/client-api/v1/http/response";
import { createCompanyActions } from "@/src/client-api/v1/companies/company-actions";
import { toCompanyDto } from "@/src/client-api/v1/companies/company-dto";
import { createOrganizationActions } from "@/src/client-api/v1/organizations/organization-actions";

export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
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
    const targetOrganizationId = organizationId(params.organizationId);
    await createOrganizationActions().getOrganization.execute(
      userId(identity.userId),
      targetOrganizationId,
    );
    const companies =
      await createCompanyActions().list.execute(targetOrganizationId);
    return apiSuccess(companies.map(toCompanyDto), requestId);
  } catch (cause) {
    console.error("client.companies.failed", { requestId, cause });
    return apiError(
      "INTERNAL_ERROR",
      "No se pudieron obtener las empresas.",
      requestId,
      500,
    );
  }
}
