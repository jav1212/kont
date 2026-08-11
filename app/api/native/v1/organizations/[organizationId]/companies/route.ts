import { organizationId, userId } from "@kontave/organizations-domain";
import { authenticateNativeRequest } from "@/src/native-api/v1/auth/native-auth-context";
import { nativeError, nativeSuccess } from "@/src/native-api/v1/http/native-response";
import { createOrganizationActions } from "@/src/native-api/v1/organizations/organization-actions";
import { organizationErrorResponse } from "@/src/native-api/v1/organizations/organization-http";
import { toCompanyDto } from "@/src/native-api/v1/organizations/organization-mapper";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ organizationId: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateNativeRequest(request);
    if (!identity) return nativeError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    const params = await context.params;
    const companies = await createOrganizationActions().listCompanies.execute(
      userId(identity.userId),
      organizationId(params.organizationId),
    );
    return nativeSuccess(companies.map(toCompanyDto), requestId);
  } catch (cause: unknown) {
    return organizationErrorResponse(cause, requestId);
  }
}
