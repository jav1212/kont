import { requireTenantRole, withTenant } from "@/src/shared/backend/utils/require-tenant";
import { getMembershipsActions } from "@/src/modules/memberships/backend/memberships-factory";

/**
 * DELETE /api/memberships/[memberId]
 * Revokes an accepted membership or deletes a pending invitation.
 * Owners can revoke anyone; admins can only revoke non-owners.
 */
export const DELETE = withTenant(async (req, { userId, actingAs, effectiveOwnerId, tenantId, role}) => {
    requireTenantRole({ role }, 'owner', 'admin');
    const tenantOwnerId = tenantId;
    const callerRole    = role;
    const memberId      = req.url.split("/").at(-1)!;

    const result = await getMembershipsActions().revokeMembership.execute({
        tenantOwnerId,
        memberId,
        callerRole,
    });

    if (result.isFailure) {
        const err    = result.getError();
        const status = err === "Membership not found" ? 404 : 403;
        return Response.json({ error: err }, { status });
    }

    return Response.json({ data: { success: true } });
});
