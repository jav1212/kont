import { createServerClient } from "@supabase/ssr";
import { createClient }       from "@supabase/supabase-js";
import { cookies }            from "next/headers";
import { rateLimit }          from "@/src/shared/backend/utils/rate-limit";

/**
 * POST /api/admin/sign-in
 * Autentica un usuario y verifica que sea administrador.
 *
 * Si la verificación falla se cierra la sesión automáticamente.
 * Si tiene éxito se establece la cookie httpOnly `kont-admin=1`
 * que el middleware usa para separar las rutas admin / usuario.
 */
export async function POST(req: Request) {
    // El panel admin es superficie crítica — cuota más agresiva que en login normal.
    const denied = await rateLimit(req, { bucket: "admin-sign-in", limit: 5, windowSec: 60 });
    if (denied) return denied;

    let email: string, password: string;
    try {
        ({ email, password } = await req.json());
    } catch {
        return Response.json({ error: "Formato JSON inválido." }, { status: 400 });
    }

    if (!email || !password) {
        return Response.json({ error: "Credenciales requeridas." }, { status: 400 });
    }

    const cookieStore = await cookies();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => cookieStore.getAll(),
                setAll: (list) =>
                    list.forEach(({ name, value, options }) =>
                        cookieStore.set(name, value, options)
                    ),
            },
        }
    );

    // 1. Intentar iniciar sesión
    const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !signInData.user) {
        console.warn("[admin/sign-in] invalid_credentials");
        return Response.json(
            { error: "Correo o contraseña incorrectos." },
            { status: 401 }
        );
    }

    // 2. Verificar que sea admin (service role para bypassear RLS)
    const service = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data: adminRow } = await service
        .from("admin_users")
        .select("id")
        .eq("id", signInData.user.id)
        .single();

    if (!adminRow) {
        console.warn("[admin/sign-in] not_admin");
        await supabase.auth.signOut();
        return Response.json(
            { error: "Correo o contraseña incorrectos." },
            { status: 401 }
        );
    }

    // 3. Marcar la sesión como admin con una cookie httpOnly de ruteo.
    //    secure=true → nunca viaja en HTTP. sameSite=lax → cross-site links OK
    //    pero no form-submission cross-site. maxAge 12h con rotación al login.
    cookieStore.set("kont-admin", "1", {
        httpOnly: true,
        secure:   true,
        sameSite: "lax",
        path:     "/",
        maxAge:   60 * 60 * 12,
    });

    return Response.json({ data: { ok: true } });
}
