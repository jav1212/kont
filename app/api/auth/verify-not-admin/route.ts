// API route — GET /api/auth/verify-not-admin
// Session validation (cookie-based SSR) happens here at the interface layer.
// Admin membership check is delegated to CheckIsAdminUseCase.
//
// Responses:
//   200 { isAdmin: false } — normal user, may proceed
//   200 { isAdmin: true }  — admin account, client should sign out
//   401                    — no active session
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAuthActions } from "@/src/modules/auth/backend/infrastructure/auth-factory";

export async function GET() {
    const cookieStore = await cookies();

    // Session validation requires an SSR cookie-aware client — this is intentionally in the route layer.
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

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return Response.json({ error: "No autenticado" }, { status: 401 });
    }

    const result = await getAuthActions().checkIsAdmin.execute({ userId: user.id });

    if (result.isFailure) {
        return Response.json({ error: result.getError() }, { status: 500 });
    }

    return Response.json({ isAdmin: result.getValue() });
}
