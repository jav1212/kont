import { createServerClient } from "@supabase/ssr";
import { cookies }            from "next/headers";

/**
 * POST /api/admin/sign-out
 * Cierra la sesión del administrador y borra la cookie de ruteo.
 */
export async function POST() {
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

    await supabase.auth.signOut();

    // Eliminar la cookie de ruteo admin (mismos flags que en sign-in
    // para que el browser aplique el overwrite correctamente)
    cookieStore.set("kont-admin", "", {
        httpOnly: true,
        secure:   true,
        sameSite: "lax",
        path:     "/",
        maxAge:   0,
    });

    return Response.json({ data: { ok: true } });
}
