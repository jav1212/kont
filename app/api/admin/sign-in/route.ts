import { createServerClient } from "@supabase/ssr";
import { createClient }       from "@supabase/supabase-js";
import { cookies }            from "next/headers";

/**
 * POST /api/admin/sign-in
 * Autentica un usuario y verifica que sea administrador.
 *
 * Si la verificación falla se cierra la sesión automáticamente.
 * Si tiene éxito se establece la cookie httpOnly `kont-admin=1`
 * que el middleware usa para separar las rutas admin / usuario.
 */
export async function POST(req: Request) {
    try {
        const { email, password } = await req.json();
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
            await supabase.auth.signOut();
            return Response.json(
                { error: "Correo o contraseña incorrectos." },
                { status: 401 }
            );
        }

        // 3. Marcar la sesión como admin con una cookie httpOnly de ruteo
        cookieStore.set("kont-admin", "1", {
            httpOnly: true,
            sameSite: "lax",
            path:     "/",
            // Sin maxAge → dura lo mismo que la sesión del navegador
        });

        return Response.json({ data: { ok: true } });
    } catch {
        return Response.json({ error: "Formato JSON inválido." }, { status: 400 });
    }
}
