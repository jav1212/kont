import { withTenant } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

/**
 * GET /api/memberships/members
 * Lista miembros del tenant activo.
 * Solo accesible por owner o admin.
 */
export const GET = withTenant(async (_req, { userId, actingAs }) => {
    // El tenant del que listamos miembros es el propio (o el target si actingAs)
    const tenantOwnerId = actingAs?.ownerId ?? userId;
    const callerRole    = actingAs?.role ?? "owner";

    if (callerRole === "contable") {
        return Response.json({ error: "Sin permiso" }, { status: 403 });
    }

    const server = new ServerSupabaseSource();

    const { data, error } = await server.instance
        .from("tenant_memberships")
        .select("id, member_id, role, invited_by, accepted_at, revoked_at, created_at")
        .eq("tenant_id", tenantOwnerId)
        .is("revoked_at", null)
        .order("created_at", { ascending: true });

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }

    // Fetch emails
    const members = await Promise.all(
        (data ?? []).map(async (row: any) => {
            const { data: userData } = await server.instance.auth.admin.getUserById(row.member_id);
            return {
                id:         row.id,
                memberId:   row.member_id,
                email:      userData?.user?.email ?? row.member_id,
                role:       row.role,
                acceptedAt: row.accepted_at,
                createdAt:  row.created_at,
            };
        })
    );

    return Response.json({ data: members });
});
