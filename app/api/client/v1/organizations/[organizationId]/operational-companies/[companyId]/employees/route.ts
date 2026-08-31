import {
  PERMISSIONS,
  permissionCode,
  AuthorizationSource,
} from "@kontave/access-control/domain";
import { createSupabaseAuthorization } from "@kontave/access-control/supabase";
import { companyId } from "@kontave/companies/domain";
import { RequireModuleCapability } from "@kontave/modules/application";
import { ModuleCapability } from "@kontave/modules/domain";
import { createModulesInfrastructure } from "@kontave/modules/supabase";
import { organizationId } from "@kontave/organizations/domain";
import { authenticateClientRequest } from "@/src/client-api/v1/auth/auth-context";
import { createCompanyActions } from "@/src/client-api/v1/companies/company-actions";
import { createEmployeeActions } from "@/src/client-api/v1/employees/employee-actions";
import { toEmployeeDto } from "@/src/client-api/v1/employees/employee-dto";
import { apiError, apiSuccess } from "@/src/client-api/v1/http/response";

export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string; companyId: string }> },
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
    const organization = organizationId(params.organizationId);
    const company = companyId(params.companyId);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey)
      throw new Error("Native employee infrastructure is not configured.");
    await createSupabaseAuthorization({ url, serviceRoleKey }).require.execute({
      actor: { userId: identity.userId, organizationId: organization },
      permission: permissionCode(PERMISSIONS.EMPLOYEES_READ),
      resource: {
        type: "employees",
        organizationId: organization,
        companyId: company,
      },
      context: {
        requestId,
        source: AuthorizationSource.Desktop,
        occurredAt: new Date().toISOString(),
      },
    });
    await createCompanyActions().getOperational.execute(organization, company);
    const modules = createModulesInfrastructure({ url, serviceRoleKey });
    await new RequireModuleCapability(
      modules.catalog,
      modules.installations,
    ).execute(organization, ModuleCapability.PayrollEmployees);
    return apiSuccess(
      (await createEmployeeActions().list.execute(organization, company)).map(
        toEmployeeDto,
      ),
      requestId,
    );
  } catch (cause) {
    console.error("client.employees.failed", { requestId, cause });
    return apiError(
      "INTERNAL_ERROR",
      "No se pudieron obtener los empleados.",
      requestId,
      500,
    );
  }
}
