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
    let barcodeTenantId: string | undefined;
    try {
        const tenant = await requireTenant();
        userId = tenant.userId;
        if (tenant.barcodeSession) barcodeTenantId = tenant.tenantId;
    } catch {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await getMembershipsActions().getUserMemberships.execute({ userId });
    if (barcodeTenantId && result.isSuccess) {
        return Response.json({ data: result.getValue().filter((entry) => entry.tenantId === barcodeTenantId) }, {
            headers: { 'Cache-Control': 'private, no-store' },
        });
    }
    return handleResult(result);
}
