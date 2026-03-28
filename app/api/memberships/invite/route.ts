import { withTenant } from "@/src/shared/backend/utils/require-tenant";
import { getMembershipsActions } from "@/src/modules/memberships/backend/memberships-factory";
import { MemberRole } from "@/src/modules/memberships/backend/domain/membership";

/**
 * POST /api/memberships/invite
 * Body: { email: string, role: 'admin' | 'contable' }
 * Creates an invitation and sends the invite email to the recipient.
 */
export const POST = withTenant(async (req, { userId, actingAs }) => {
    const tenantOwnerId = actingAs?.ownerId ?? userId;
    const callerRole    = actingAs?.role    ?? "owner";

    const body = await req.json() as { email?: string; role?: MemberRole };

    const host   = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).hostname;
    const proto  = req.headers.get("x-forwarded-proto") ?? "https";
    const origin = `${proto}://${host}`;

    const result = await getMembershipsActions().sendInvitation.execute({
        tenantOwnerId,
        invitedBy:  userId,
        email:      body.email ?? "",
        role:       body.role  ?? "contable",
        callerRole,
        origin,
    });

    if (result.isFailure) {
        const err = result.getError();
        const status = err === "Insufficient permissions to invite" || err === "Admins can only invite contable members" ? 403 : 400;
        return Response.json({ error: err }, { status });
    }

    const inv = result.getValue();
    return Response.json({ data: { invitationId: inv.invitationId, expiresAt: inv.expiresAt, acceptUrl: inv.acceptUrl } });
});
