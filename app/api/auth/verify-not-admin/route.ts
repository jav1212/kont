import { createServerClient } from "@supabase/ssr";
import { createClient }       from "@supabase/supabase-js";
import { cookies }            from "next/headers";

/**
 * GET /api/auth/verify-not-admin
 * Verifica que el usuario autenticado NO sea administrador.
 * Usado tras el login regular para bloquear cuentas admin.
 *
 * Respuestas:
 *   200 { isAdmin: false } → usuario normal, puede continuar
 *   200 { isAdmin: true }  → es admin, el cliente debe cerrar sesión
 *   401                    → no hay sesión activa
 */
export async function GET() {
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

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return Response.json({ error: "No autenticado" }, { status: 401 });
    }

    const service = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data: adminRow } = await service
        .from("admin_users")
        .select("id")
        .eq("id", user.id)
        .single();

    return Response.json({ isAdmin: !!adminRow });
}
