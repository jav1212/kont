import { requirePermission, TenantForbiddenError, type TenantContext } from "../utils/require-tenant";

/**
 * Restricts credential administration to an authorized tenant administrator.
 * @param tenant - Server-verified role, identity and selected tenant.
 * @param request - Request to include in permission audit metadata.
 * @returns Resolves when the role and canonical access-management permission agree.
 * @throws TenantForbiddenError when the caller is not an owner or administrator,
 * or does not hold the required canonical permission.
 */
export async function requireAccessAdministrator(tenant: TenantContext, request: Request): Promise<void> {
    if (tenant.role !== "owner" && tenant.role !== "admin") {
        throw new TenantForbiddenError();
    }
    await requirePermission(tenant, "access.manage", { req: request, auditAllow: request.method !== "GET" });
}
