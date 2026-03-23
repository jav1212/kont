import { withTenant } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { sendInviteEmail } from "@/src/shared/backend/utils/send-invite-email";

/**
 * POST /api/memberships/invite
 * Body: { email: string, role: 'admin' | 'contable' }
 * Crea una invitación y envía el email al invitado.
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

    const origin    = new URL(req.url).origin;
    const acceptUrl = `${origin}/accept-invite?token=${inv.token}`;

    // Obtener email del invitador y nombre del tenant para el email
    const [{ data: inviterData }] = await Promise.all([
        server.instance.auth.admin.getUserById(userId),
        server.instance.from("tenants").select("id").eq("id", tenantOwnerId).single(),
    ]);

    // Obtener primera empresa del tenant como nombre representativo
    const inviterEmail = inviterData?.user?.email ?? "Un usuario de kont";
    const tenantName   = inviterEmail; // fallback al email del owner

    // Enviar email (no bloquear la respuesta si falla)
    sendInviteEmail({
        to:           email.toLowerCase().trim(),
        role:         role as "admin" | "contable",
        tenantName,
        inviterEmail,
        acceptUrl,
    }).catch((err) => {
        console.error("[invite] Error enviando email:", err);
    });

    return Response.json({ data: { invitationId: inv.id, expiresAt: inv.expires_at } });
});
