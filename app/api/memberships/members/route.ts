import { withTenant } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

/**
 * GET /api/memberships/members
 * Lista miembros del tenant activo (aceptados + invitaciones pendientes).
 * Solo accesible por owner o admin.
 */
export const GET = withTenant(async (_req, { userId, actingAs }) => {
    const tenantOwnerId = actingAs?.ownerId ?? userId;
    const callerRole    = actingAs?.role ?? "owner";

    if (callerRole === "contable") {
        return Response.json({ error: "Sin permiso" }, { status: 403 });
    }

    const server = new ServerSupabaseSource();

    // Miembros aceptados
    const { data: memberships, error } = await server.instance
        .from("tenant_memberships")
        .select("id, member_id, role, invited_by, accepted_at, revoked_at, created_at")
        .eq("tenant_id", tenantOwnerId)
        .is("revoked_at", null)
        .order("created_at", { ascending: true });

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }

    const members = await Promise.all(
        (memberships ?? []).map(async (row) => {
            const { data: userData } = await server.instance.auth.admin.getUserById(row.member_id);
            return {
                id:         row.id,
                memberId:   row.member_id,
                email:      userData?.user?.email ?? row.member_id,
                role:       row.role,
                acceptedAt: row.accepted_at,
                createdAt:  row.created_at,
                pending:    false,
            };
        })
    );

    // Emails que ya tienen membresía aceptada (para deduplicar)
    const acceptedEmails = new Set(members.map((m) => m.email.toLowerCase()));

    // Invitaciones pendientes (no aceptadas, no expiradas, sin membresía ya activa)
    const { data: pendingInvites } = await server.instance
        .from("tenant_invitations")
        .select("id, email, role, created_at, expires_at")
        .eq("tenant_id", tenantOwnerId)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true });

    const pending = (pendingInvites ?? [])
        .filter((inv) => !acceptedEmails.has(inv.email.toLowerCase()))
        .map((inv) => ({
            id:         inv.id,
            memberId:   null,
            email:      inv.email,
            role:       inv.role,
            acceptedAt: null,
            createdAt:  inv.created_at,
            pending:    true,
            expiresAt:  inv.expires_at,
        }));

    return Response.json({ data: [...members, ...pending] });
});
