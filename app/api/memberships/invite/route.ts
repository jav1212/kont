import { withTenant } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

/**
 * POST /api/memberships/invite
 * Body: { email: string, role: 'admin' | 'contable' }
 * Crea una invitación. Owner puede invitar admin o contable; admin solo puede invitar contable.
 */
export const POST = withTenant(async (req, { userId, actingAs }) => {
    const tenantOwnerId = actingAs?.ownerId ?? userId;
    const callerRole    = actingAs?.role ?? "owner";

    if (callerRole === "contable") {
        return Response.json({ error: "Sin permiso para invitar" }, { status: 403 });
    }

    const body = await req.json();
    const { email, role } = body as { email: string; role: string };

    if (!email || !role) {
        return Response.json({ error: "email y role son requeridos" }, { status: 400 });
    }
    if (!["admin", "contable"].includes(role)) {
        return Response.json({ error: "role debe ser admin o contable" }, { status: 400 });
    }
    // Admin solo puede invitar contables
    if (callerRole === "admin" && role !== "contable") {
        return Response.json({ error: "Admin solo puede invitar contables" }, { status: 403 });
    }

    const server = new ServerSupabaseSource();

    // Insertar invitación
    const { data: inv, error } = await server.instance
        .from("tenant_invitations")
        .insert({
            tenant_id:  tenantOwnerId,
            invited_by: userId,
            email:      email.toLowerCase().trim(),
            role,
        })
        .select("id, token, expires_at")
        .single();

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }

    // Construir el link de aceptación usando el origin del request
    const origin    = new URL(req.url).origin;
    const acceptUrl = `${origin}/accept-invite?token=${inv.token}`;

    return Response.json({ data: { invitationId: inv.id, acceptUrl, expiresAt: inv.expires_at } });
});
