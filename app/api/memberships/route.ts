import { requireTenant } from "@/src/shared/backend/utils/require-tenant";
import { getMembershipsActions } from "@/src/modules/memberships/backend/memberships-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";

/**
 * GET /api/memberships
 * Lists all tenants where the caller is an active member (including their own).
 * Does not use withTenant() — only needs auth, no tenant context.
 */
export async function GET() {
    let userId: string;
    try {
        const tenant = await requireTenant();
        userId = tenant.userId;
    } catch {
        return Response.json({ error: "No autenticado" }, { status: 401 });
    }

    const result = await getMembershipsActions().getUserMemberships.execute({ userId });
    return handleResult(result);
}
