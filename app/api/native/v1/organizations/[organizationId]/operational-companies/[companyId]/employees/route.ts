import { PERMISSIONS, permissionCode, AuthorizationSource } from "@kontave/access-control-domain";
import { createSupabaseAuthorization } from "@kontave/access-control-supabase";
import { companyId } from "@kontave/companies-domain";
import { RequireModuleCapability } from "@kontave/modules-application";
import { ModuleCapability } from "@kontave/modules-domain";
import { createModulesInfrastructure } from "@kontave/modules-supabase";
import { organizationId } from "@kontave/organizations-domain";
import { authenticateNativeRequest } from "@/src/native-api/v1/auth/native-auth-context";
import { createCompanyActions } from "@/src/native-api/v1/companies/company-actions";
import { createEmployeeActions } from "@/src/native-api/v1/employees/employee-actions";
import { toEmployeeDto } from "@/src/native-api/v1/employees/employee-dto";
import { nativeError, nativeSuccess } from "@/src/native-api/v1/http/native-response";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ organizationId: string; companyId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateNativeRequest(request);
    if (!identity) return nativeError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    const params = await context.params;
    const organization = organizationId(params.organizationId);
    const company = companyId(params.companyId);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) throw new Error("Native employee infrastructure is not configured.");
    await createSupabaseAuthorization({ url, serviceRoleKey }).require.execute({
      actor: { userId: identity.userId, organizationId: organization },
      permission: permissionCode(PERMISSIONS.EMPLOYEES_READ),
      resource: { type: "employees", organizationId: organization, companyId: company },
      context: { requestId, source: AuthorizationSource.Desktop, occurredAt: new Date().toISOString() },
    });
    await createCompanyActions().getOperational.execute(organization, company);
    const modules = createModulesInfrastructure({ url, serviceRoleKey });
    await new RequireModuleCapability(modules.catalog, modules.installations).execute(organization, ModuleCapability.PayrollEmployees);
    return nativeSuccess((await createEmployeeActions().list.execute(organization, company)).map(toEmployeeDto), requestId);
  } catch (cause) {
    console.error("native.employees.failed", { requestId, cause });
    return nativeError("INTERNAL_ERROR", "No se pudieron obtener los empleados.", requestId, 500);
  }
}
