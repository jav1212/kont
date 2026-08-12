import { organizationId, userId } from "@kontave/organizations-domain";
import { authenticateNativeRequest } from "@/src/native-api/v1/auth/native-auth-context";
import { nativeError, nativeSuccess } from "@/src/native-api/v1/http/native-response";
import { createCompanyActions } from "@/src/native-api/v1/companies/company-actions";
import { toCompanyDto } from "@/src/native-api/v1/companies/company-dto";
import { createOrganizationActions } from "@/src/native-api/v1/organizations/organization-actions";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateNativeRequest(request);
    if (!identity) return nativeError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    const params = await context.params;
    const targetOrganizationId = organizationId(params.organizationId);
    await createOrganizationActions().getOrganization.execute(userId(identity.userId), targetOrganizationId);
    const companies = await createCompanyActions().list.execute(targetOrganizationId);
    return nativeSuccess(companies.map(toCompanyDto), requestId);
  } catch (cause) {
    console.error("native.companies.failed", { requestId, cause });
    return nativeError("INTERNAL_ERROR", "No se pudieron obtener las empresas.", requestId, 500);
  }
}
