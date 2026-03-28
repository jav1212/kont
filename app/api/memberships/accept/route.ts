import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getMembershipsActions } from "@/src/modules/memberships/backend/memberships-factory";

/**
 * GET /api/memberships/accept?token=<uuid>
 * Validates the invitation token and creates the membership.
 * Public — the user must be authenticated to accept.
 * Auth check and redirect logic stay in the route; business logic is in AcceptInvitationUseCase.
 */
export async function GET(req: NextRequest) {
    const token = req.nextUrl.searchParams.get("token");

    if (!token) {
        return NextResponse.redirect(new URL("/accept-invite?error=invalid", req.url));
    }

    // Cookie-based auth check — must stay in the route (PKCE session).
    const cookieStore = await cookies();
    const supabase    = createServerClient(
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

    const result = await getMembershipsActions().acceptInvitation.execute({
        token,
        userId:    user.id,
        userEmail: user.email ?? "",
    });

    if (result.isFailure) {
        const errorCode = result.getError(); // "invalid" | "expired" | "email_mismatch" | "server"
        return NextResponse.redirect(new URL(`/accept-invite?error=${errorCode}`, req.url));
    }

    const { tenantId } = result.getValue();
    const dashUrl      = new URL("/", req.url);
    dashUrl.searchParams.set("switchTenant", tenantId);
    return NextResponse.redirect(dashUrl);
}
