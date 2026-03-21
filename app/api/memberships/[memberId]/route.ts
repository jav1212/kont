import { withTenant } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

/**
 * DELETE /api/memberships/[memberId]
 * Revoca la membresía (revoked_at = now()).
 * Owner puede revocar cualquiera; admin puede revocar no-owners.
 */
export const DELETE = withTenant(async (req, { userId, actingAs }) => {
    const tenantOwnerId = actingAs?.ownerId ?? userId;
    const callerRole    = actingAs?.role ?? "owner";

    // Extract memberId from URL path
    const memberId = req.url.split("/").at(-1)!;

    if (callerRole === "contable") {
        return Response.json({ error: "Sin permiso" }, { status: 403 });
    }

    const server = new ServerSupabaseSource();

    // Fetch the membership to check its role
    const { data: membership, error: fetchErr } = await server.instance
        .from("tenant_memberships")
        .select("id, role, member_id")
        .eq("id", memberId)
        .eq("tenant_id", tenantOwnerId)
        .is("revoked_at", null)
        .single();

    if (fetchErr || !membership) {
        return Response.json({ error: "Membresía no encontrada" }, { status: 404 });
    }

    // Admin no puede revocar owners
    if (callerRole === "admin" && membership.role === "owner") {
        return Response.json({ error: "No puedes remover al owner" }, { status: 403 });
    }

    // No se puede revocar al owner del tenant
    if (membership.role === "owner" && membership.member_id === tenantOwnerId) {
        return Response.json({ error: "No se puede remover al owner del tenant" }, { status: 403 });
    }

    const { error } = await server.instance
        .from("tenant_memberships")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", memberId);

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ data: { success: true } });
});
