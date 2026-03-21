import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

/**
 * GET /api/memberships/accept?token=<uuid>
 * Valida el token de invitación y crea la membresía.
 * Público — el usuario debe estar autenticado para aceptar.
 */
export async function GET(req: NextRequest) {
    const token = req.nextUrl.searchParams.get("token");

    if (!token) {
        return NextResponse.redirect(new URL("/accept-invite?error=invalid", req.url));
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => cookieStore.getAll(),
                setAll: () => {},
            },
        }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        const signInUrl = new URL("/sign-in", req.url);
        signInUrl.searchParams.set("redirect", `/accept-invite?token=${token}`);
        return NextResponse.redirect(signInUrl);
    }

    const server = new ServerSupabaseSource();

    // Buscar invitación válida
    const { data: invitation, error: invErr } = await server.instance
        .from("tenant_invitations")
        .select("id, tenant_id, email, role, invited_by, expires_at, accepted_at")
        .eq("token", token)
        .is("accepted_at", null)
        .single();

    if (invErr || !invitation) {
        return NextResponse.redirect(new URL("/accept-invite?error=invalid", req.url));
    }

    // Verificar expiración
    if (new Date(invitation.expires_at) < new Date()) {
        return NextResponse.redirect(new URL("/accept-invite?error=expired", req.url));
    }

    // Verificar que el email coincide
    if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
        return NextResponse.redirect(new URL("/accept-invite?error=email_mismatch", req.url));
    }

    // Crear membresía
    const { error: mbError } = await server.instance
        .from("tenant_memberships")
        .insert({
            tenant_id:   invitation.tenant_id,
            member_id:   user.id,
            role:        invitation.role,
            invited_by:  invitation.invited_by,
            accepted_at: new Date().toISOString(),
        });

    if (mbError && !mbError.message.includes("duplicate")) {
        return NextResponse.redirect(new URL("/accept-invite?error=server", req.url));
    }

    // Marcar invitación como aceptada
    await server.instance
        .from("tenant_invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invitation.id);

    // Redirigir a la app apuntando al nuevo tenant
    const dashUrl = new URL("/", req.url);
    dashUrl.searchParams.set("switchTenant", invitation.tenant_id);
    return NextResponse.redirect(dashUrl);
}
