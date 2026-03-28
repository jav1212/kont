import { withTenant } from "@/src/shared/backend/utils/require-tenant";
import { getMembershipsActions } from "@/src/modules/memberships/backend/memberships-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";

/**
 * GET /api/memberships/members
 * Lists members of the active tenant (accepted + pending invitations).
 * Only accessible by owner or admin.
 */
export const GET = withTenant(async (_req, { userId, actingAs }) => {
    const tenantOwnerId = actingAs?.ownerId ?? userId;
    const callerRole    = actingAs?.role    ?? "owner";

    const result = await getMembershipsActions().getMembers.execute({ tenantOwnerId, callerRole });

    if (result.isFailure) {
        return Response.json({ error: result.getError() }, { status: 403 });
    }

    return handleResult(result);
});
