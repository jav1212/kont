import {
  AuthorizationDenied,
  PERMISSIONS,
  permissionCode,
  type PermissionCode,
} from "@kontave/access-control/domain";
import { createSupabaseAuthorization } from "@kontave/access-control/supabase";
import { companyId } from "@kontave/companies/domain";
import { RequireModuleCapability } from "@kontave/modules/application";
import { ModuleCapability, ModuleFailure } from "@kontave/modules/domain";
import { createModulesInfrastructure } from "@kontave/modules/supabase";
import { organizationId, userId } from "@kontave/organizations/domain";
import {
  DelegatedAccessFailure,
  OrganizationAccessPathKind,
} from "@kontave/delegated-access/domain";
import { ProductFailure } from "@kontave/products/domain";
import { InventoryFailure } from "@kontave/inventory/domain";
import { InventoryDashboardFailure } from "@kontave/inventory/application";
import { PricingFailure } from "@kontave/pricing/domain";
import { TaxationFailure } from "@kontave/taxation/domain";
import { UnitEconomicsFailure } from "@kontave/unit-economics/application";
import { DelegatedPermissionScopePolicy } from "@kontave/workspace-context-application";
import { authenticateClientRequest } from "../auth/auth-context";
import { createCompanyActions } from "../companies/company-actions";
import { clientSource } from "../http/client-source";
import { apiError, apiSuccess } from "../http/response";
import { createOrganizationAccessActions } from "../organization-access/organization-access-actions";
import { createProductActions } from "./product-actions";
import { logSystemError } from "@/src/shared/backend/errors/system-error";

export const productsRead = permissionCode(PERMISSIONS.INVENTORY_READ),
  productsCreate = permissionCode(PERMISSIONS.INVENTORY_CREATE),
  productsUpdate = permissionCode(PERMISSIONS.INVENTORY_UPDATE);
export type ProductActions = ReturnType<typeof createProductActions>;
export interface ProductRequestContext {
  readonly actorUserId: ReturnType<typeof userId>;
  readonly organizationId: ReturnType<typeof organizationId>;
  readonly companyId: ReturnType<typeof companyId>;
}
export async function executeProductRequest<T>(
  request: Request,
  rawOrganizationId: string,
  rawCompanyId: string,
  permission: PermissionCode,
  operation: (
    actions: ProductActions,
    context: ProductRequestContext,
  ) => Promise<T>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  let authenticatedUserId: string | null = null;
  try {
    const identity = await authenticateClientRequest(request);
    if (!identity)
      return apiError(
        "INVALID_ACCESS_TOKEN",
        "La sesión no es válida o expiró.",
        requestId,
        401,
      );
    authenticatedUserId = identity.userId;
    const organization = organizationId(rawOrganizationId),
      company = companyId(rawCompanyId),
      actor = userId(identity.userId),
      occurredAt = new Date().toISOString();
    const access = (
      await createOrganizationAccessActions().portfolio.execute(
        actor,
        occurredAt,
      )
    ).find((item) => item.organizationId === organization);
    if (
      !access ||
      !new DelegatedPermissionScopePolicy().permits(
        access.accessPath,
        permission,
      )
    )
      return apiError(
        "PRODUCT_ACCESS_DENIED",
        "No tienes acceso a los productos.",
        requestId,
        403,
      );
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
      throw new Error("Client API products infrastructure is not configured.");
    if (access.accessPath.kind === OrganizationAccessPathKind.DirectMembership)
      await createSupabaseAuthorization({
        url,
        serviceRoleKey: key,
      }).require.execute({
        actor: { userId: identity.userId, organizationId: organization },
        permission,
        resource: {
          type: "products",
          organizationId: organization,
          companyId: company,
        },
        context: {
          requestId,
          source: clientSource(request.headers.get("x-kontave-client")),
          occurredAt,
        },
      });
    await createCompanyActions().getOperational.execute(organization, company);
    const modules = createModulesInfrastructure({ url, serviceRoleKey: key });
    await new RequireModuleCapability(
      modules.catalog,
      modules.installations,
    ).execute(organization, ModuleCapability.InventoryProducts);
    return apiSuccess(
      await operation(createProductActions(), {
        actorUserId: actor,
        organizationId: organization,
        companyId: company,
      }),
      requestId,
    );
  } catch (cause) {
    const response = productErrorResponse(cause, requestId);
    await persistProductIncident(cause, request, response.status, {
      requestId,
      userId: authenticatedUserId,
      organizationId: rawOrganizationId,
      companyId: rawCompanyId,
    });
    return response;
  }
}

async function persistProductIncident(
  cause: unknown,
  request: Request,
  statusCode: number,
  context: {
    readonly requestId: string;
    readonly userId: string | null;
    readonly organizationId: string;
    readonly companyId: string;
  },
): Promise<void> {
  try {
    await logSystemError(
      cause,
      {
        source: "api",
        route: new URL(request.url).pathname,
        method: request.method,
        statusCode,
        userId: context.userId,
        requestId: context.requestId,
        metadata: {
          organizationId: context.organizationId,
          companyId: context.companyId,
          errorType: cause instanceof Error ? cause.name : typeof cause,
          failureCode: failureCode(cause),
        },
      },
      context.requestId,
    );
  } catch (loggingError) {
    console.error("client.products.incident-persistence-failed", {
      requestId: context.requestId,
      loggingError,
    });
  }
}
function failureCode(cause: unknown): string | null {
  return typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof cause.code === "string"
    ? cause.code
    : null;
}
function productErrorResponse(cause: unknown, requestId: string): Response {
  if (cause instanceof ProductFailure) {
    const status = cause.code.endsWith("VERSION_CONFLICT")
      ? 409
      : cause.code === "PRODUCT_NOT_FOUND" ||
          cause.code === "PRODUCT_CATEGORY_NOT_FOUND"
        ? 404
        : cause.code === "PRODUCT_ACCESS_DENIED" ||
            cause.code === "PRODUCT_OUTSIDE_COMPANY"
          ? 403
          : cause.code === "PRODUCT_REPOSITORY_UNAVAILABLE"
            ? 503
            : 400;
    return apiError(cause.code, cause.message, requestId, status);
  }
  if (cause instanceof PricingFailure) {
    const status =
      cause.code === "PRICING_VERSION_CONFLICT"
        ? 409
        : cause.code === "PRICING_PRODUCT_NOT_FOUND" ||
            cause.code === "PRICING_NOT_FOUND"
          ? 404
          : cause.code === "PRICING_ACCESS_DENIED"
            ? 403
            : cause.code === "PRICING_REPOSITORY_UNAVAILABLE"
              ? 503
              : 400;
    return apiError(cause.code, cause.message, requestId, status);
  }
  if (cause instanceof TaxationFailure) {
    const status =
      cause.code === "TAXATION_VERSION_CONFLICT"
        ? 409
        : cause.code === "TAXATION_PROFILE_NOT_FOUND"
          ? 404
          : cause.code === "TAXATION_ACCESS_DENIED"
            ? 403
            : cause.code === "TAXATION_REPOSITORY_UNAVAILABLE"
              ? 503
              : 400;
    return apiError(cause.code, cause.message, requestId, status);
  }
  if (cause instanceof UnitEconomicsFailure) {
    const status =
      cause.code === "UNIT_ECONOMICS_NOT_FOUND"
        ? 404
        : cause.code === "UNIT_ECONOMICS_ACCESS_DENIED"
          ? 403
          : cause.code === "UNIT_ECONOMICS_UNAVAILABLE"
            ? 503
            : 400;
    return apiError(cause.code, cause.message, requestId, status);
  }
  if (cause instanceof InventoryFailure) {
    if (cause.code === "INVENTORY_PROFILE_VERSION_CONFLICT")
      return apiError(
        "INVENTORY_PROFILE_VERSION_CONFLICT",
        cause.message,
        requestId,
        409,
      );
    if (cause.code === "INVENTORY_REPOSITORY_UNAVAILABLE")
      return apiError(
        "INVENTORY_REPOSITORY_UNAVAILABLE",
        cause.message,
        requestId,
        503,
      );
    return apiError("INVENTORY_PROFILE_INVALID", cause.message, requestId, 400);
  }
  if (cause instanceof InventoryDashboardFailure)
    return apiError("INVENTORY_PROFILE_INVALID", cause.message, requestId, 400);
  if (
    cause instanceof AuthorizationDenied ||
    cause instanceof DelegatedAccessFailure
  )
    return apiError(
      "PRODUCT_ACCESS_DENIED",
      "No tienes acceso a los productos.",
      requestId,
      403,
    );
  if (cause instanceof ModuleFailure)
    return apiError(cause.code, cause.message, requestId, 409);
  console.error("client.products.failed", { requestId, cause });
  return apiError(
    "INTERNAL_ERROR",
    "No se pudo procesar el catálogo de productos.",
    requestId,
    500,
  );
}
