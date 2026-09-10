import { requirePermission, TenantForbiddenError, type TenantContext } from "../utils/require-tenant";

/**
 * Restricts credential administration to an administrator's conventional login.
 * @param tenant - Server-verified role, identity and selected tenant.
 * @param request - Request to include in permission audit metadata.
 * @returns Resolves when role, login method and access-management permission agree.
 * @throws TenantForbiddenError for a carnet login or an unauthorized role/permission.
 */
export async function requireAccessAdministrator(tenant: TenantContext, request: Request): Promise<void> {
    if (tenant.barcodeSession || (tenant.role !== "owner" && tenant.role !== "admin")) {
        throw new TenantForbiddenError();
    }
    await requirePermission(tenant, "access.manage", { req: request, auditAllow: request.method !== "GET" });
}
