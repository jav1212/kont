import { AuthorizationDenied } from "@kontave/access-control/domain";
import { createSupabaseAuthorization } from "@kontave/access-control/supabase";
import { companyId } from "@kontave/companies/domain";
import { RequireModuleCapability } from "@kontave/modules/application";
import { ModuleCapability, ModuleFailure } from "@kontave/modules/domain";
import { createModulesInfrastructure } from "@kontave/modules/supabase";
import {
  companyId as organizationCompanyId,
  organizationId,
  userId,
} from "@kontave/organizations/domain";
import {
  DelegatedAccessFailure,
  OrganizationAccessPathKind,
} from "@kontave/delegated-access/domain";
import {
  SalesDashboardFailure,
  salesDashboardAccessRequirement,
} from "@kontave/sales/application";
import { DelegatedPermissionScopePolicy } from "@kontave/workspace-context-application";
import { authenticateClientRequest } from "../auth/auth-context";
import { createCompanyActions } from "../companies/company-actions";
import { clientSource } from "../http/client-source";
import { apiError, apiSuccess } from "../http/response";
import { createOrganizationAccessActions } from "../organization-access/organization-access-actions";
import { createSalesDashboardActions } from "./sales-dashboard-actions";
export async function executeSalesDashboardRequest(
  request: Request,
  rawOrganizationId: string,
  rawCompanyId: string,
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
    const organization = organizationId(rawOrganizationId),
      company = companyId(rawCompanyId),
      occurredAt = new Date().toISOString(),
      permissions = salesDashboardAccessRequirement;
    const access = (
      await createOrganizationAccessActions().portfolio.execute(
        userId(identity.userId),
        occurredAt,
      )
    ).find((item) => item.organizationId === organization);
    if (
      !access ||
      !permissions.every((permission) =>
        new DelegatedPermissionScopePolicy().permits(access.accessPath, permission),
      )
    )
      return apiError(
        "SALES_DASHBOARD_ACCESS_DENIED",
        "No tienes acceso al tablero de ventas.",
        requestId,
        403,
      );
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
      throw new Error(
        "Native sales dashboard infrastructure is not configured.",
      );
    if (access.accessPath.kind === OrganizationAccessPathKind.DirectMembership) {
      const authorization = createSupabaseAuthorization({ url, serviceRoleKey: key });
      await Promise.all(permissions.map((permission) => authorization.require.execute({
        actor: { userId: identity.userId, organizationId: organization },
        permission,
        resource: {
          type: "sales_dashboard",
          organizationId: organization,
          companyId: company,
        },
        context: {
          requestId,
          source: clientSource(request.headers.get("x-kontave-client")),
          occurredAt,
        },
      })));
    }
    await createCompanyActions().getOperational.execute(organization, company);
    const modules = createModulesInfrastructure({ url, serviceRoleKey: key });
    await new RequireModuleCapability(
      modules.catalog,
      modules.installations,
    ).execute(organization, ModuleCapability.SalesDashboard);
    const q = readQuery(request);
    const result = await createSalesDashboardActions().get.execute({
      actorUserId: userId(identity.userId),
      organizationId: organization,
      companyId: organizationCompanyId(rawCompanyId),
      ...q,
    });
    return apiSuccess(result, requestId);
  } catch (cause) {
    if (cause instanceof SalesDashboardFailure)
      return apiError(
        cause.code,
        cause.message,
        requestId,
        cause.code === "SALES_DASHBOARD_INVALID"
          ? 400
          : cause.code === "SALES_DASHBOARD_ACCESS_DENIED"
            ? 403
            : 503,
      );
    if (
      cause instanceof AuthorizationDenied ||
      cause instanceof DelegatedAccessFailure
    )
      return apiError(
        "SALES_DASHBOARD_ACCESS_DENIED",
        "No tienes acceso al tablero de ventas.",
        requestId,
        403,
      );
    if (cause instanceof ModuleFailure)
      return apiError(cause.code, cause.message, requestId, 409);
    console.error("client.sales_dashboard.failed", { requestId, cause });
    return apiError(
      "INTERNAL_ERROR",
      "No se pudo obtener el tablero de ventas.",
      requestId,
      500,
    );
  }
}
function readQuery(request: Request) {
  const url = new URL(request.url),
    from = url.searchParams.get("from"),
    to = url.searchParams.get("to");
  if (!from || !to)
    throw new SalesDashboardFailure(
      "SALES_DASHBOARD_INVALID",
      "from y to son obligatorios.",
    );
  return {
    from,
    to,
    granularity: (url.searchParams.get("granularity") ?? "day") as "day",
    recentLimit: url.searchParams.has("limit")
      ? Number(url.searchParams.get("limit"))
      : 5,
  };
}
