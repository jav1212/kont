import { AuthorizationDenied, PERMISSIONS, permissionCode } from "@kontave/access-control/domain";
import { createSupabaseAuthorization } from "@kontave/access-control/supabase";
import { companyId as operationalCompanyId } from "@kontave/companies/domain";
import { RequireModuleCapability } from "@kontave/modules/application";
import { ModuleCapability, ModuleFailure } from "@kontave/modules/domain";
import { companyId as salesCompanyId, organizationId, userId } from "@kontave/organizations/domain";
import { DelegatedAccessFailure, OrganizationAccessPathKind } from "@kontave/delegated-access/domain";
import { SalesPerformanceReportFailure, type SalesPerformanceDimension } from "@kontave/sales/application";
import { DelegatedPermissionScopePolicy } from "@kontave/workspace-context-application";
import { authenticateClientRequest } from "../auth/auth-context";
import { createCompanyActions } from "../companies/company-actions";
import { clientSource } from "../http/client-source";
import { apiError, apiSuccess } from "../http/response";
import { createOrganizationAccessActions } from "../organization-access/organization-access-actions";
import { createModulesInfrastructure } from "@kontave/modules/supabase";
import { createSalesPerformanceReportActions } from "./sales-performance-report-actions";

/** Authenticates, authorizes and executes a tenant-scoped sales performance report request. */
export async function executeSalesPerformanceReportRequest(
  request: Request,
  rawOrganizationId: string,
  rawCompanyId: string,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateClientRequest(request);
    if (!identity) return apiError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);

    const organization = organizationId(rawOrganizationId);
    const company = operationalCompanyId(rawCompanyId);
    const salesCompany = salesCompanyId(rawCompanyId);
    const occurredAt = new Date().toISOString();
    const permission = permissionCode(PERMISSIONS.SALES_READ_REPORTING);
    const access = (await createOrganizationAccessActions().portfolio.execute(userId(identity.userId), occurredAt))
      .find((item) => item.organizationId === organization);
    if (!access || !new DelegatedPermissionScopePolicy().permits(access.accessPath, permission)) {
      return apiError("SALES_REPORT_ACCESS_DENIED", "No tienes acceso a los reportes de ventas.", requestId, 403);
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) throw new Error("Native sales reporting infrastructure is not configured.");
    if (access.accessPath.kind === OrganizationAccessPathKind.DirectMembership) {
      await createSupabaseAuthorization({ url, serviceRoleKey }).require.execute({
        actor: { userId: identity.userId, organizationId: organization },
        permission,
        resource: { type: "sales_reporting", organizationId: organization, companyId: company },
        context: { requestId, source: clientSource(request.headers.get("x-kontave-client")), occurredAt },
      });
    }

    await createCompanyActions().getOperational.execute(organization, company);
    const modules = createModulesInfrastructure({ url, serviceRoleKey });
    await new RequireModuleCapability(modules.catalog, modules.installations)
      .execute(organization, ModuleCapability.SalesDashboard);
    const query = readQuery(request);
    const result = await createSalesPerformanceReportActions().get.execute({
      actorUserId: userId(identity.userId),
      organizationId: organization,
      companyId: salesCompany,
      ...query,
    });
    return apiSuccess(result, requestId);
  } catch (cause) {
    if (cause instanceof SalesPerformanceReportFailure) {
      return apiError(cause.code, cause.message, requestId,
        cause.code === "SALES_REPORT_INVALID" ? 400 : cause.code === "SALES_REPORT_ACCESS_DENIED" ? 403 : 503);
    }
    if (cause instanceof AuthorizationDenied || cause instanceof DelegatedAccessFailure) {
      return apiError("SALES_REPORT_ACCESS_DENIED", "No tienes acceso a los reportes de ventas.", requestId, 403);
    }
    if (cause instanceof ModuleFailure) return apiError(cause.code, cause.message, requestId, 409);
    console.error("client.sales_performance_report.failed", { requestId, cause });
    return apiError("INTERNAL_ERROR", "No se pudo obtener el reporte de ventas.", requestId, 500);
  }
}

function readQuery(request: Request): {
  readonly from: string;
  readonly to: string;
  readonly dimension: SalesPerformanceDimension;
  readonly currency: "VES";
} {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const dimension = url.searchParams.get("dimension");
  if (!from || !to || (dimension !== "user" && dimension !== "role" && dimension !== "device")) {
    throw new SalesPerformanceReportFailure("SALES_REPORT_INVALID", "from, to y dimension son obligatorios.");
  }
  const currency = url.searchParams.get("currency") ?? "VES";
  if (currency !== "VES") {
    throw new SalesPerformanceReportFailure("SALES_REPORT_INVALID", "La moneda solicitada no está disponible.");
  }
  return { from, to, dimension, currency };
}
