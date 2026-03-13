import { createClient }  from "@supabase/supabase-js";
import { requireAdmin } from "@/src/shared/backend/utils/require-admin";

function serviceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

/**
 * GET /api/admin/admins
 * Lista todos los usuarios administradores.
 */
export async function GET(req: Request) {
    const check = await requireAdmin(req);
    if (check) return check;

    const supabase = serviceClient();

    const { data, error } = await supabase
        .from("admin_users")
        .select("id, email, created_at")
        .order("created_at", { ascending: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ data: data ?? [] });
}

/**
 * POST /api/admin/admins
 * Crea un nuevo usuario administrador.
 * Body: { email, password }
 *
 * 1. Crea el usuario en auth.users via admin API (service role).
 * 2. Inserta en admin_users.
 */
export async function POST(req: Request) {
    const check = await requireAdmin(req);
    if (check) return check;

    try {
        const { email, password } = await req.json();

        if (!email?.trim() || !password) {
            return Response.json({ error: "Email y contraseña son requeridos." }, { status: 400 });
        }

        if (password.length < 8) {
            return Response.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });
        }

        const supabase = serviceClient();

        // Crear usuario en Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email:          email.trim().toLowerCase(),
            password,
            email_confirm:  true,   // confirmado directamente, sin email
        });

        if (authError) {
            // Mensaje amigable para email duplicado
            const msg = authError.message.includes("already")
                ? "Ya existe un usuario con ese correo."
                : authError.message;
            return Response.json({ error: msg }, { status: 400 });
        }

        const newUser = authData.user;

        // Insertar en admin_users
        const { error: insertError } = await supabase
            .from("admin_users")
            .insert({ id: newUser.id, email: newUser.email! });

        if (insertError) {
            // Rollback: eliminar el usuario de auth si falla la inserción
            await supabase.auth.admin.deleteUser(newUser.id);
            return Response.json({ error: insertError.message }, { status: 500 });
        }

        return Response.json({
            data: { id: newUser.id, email: newUser.email!, created_at: newUser.created_at },
        }, { status: 201 });

    } catch {
        return Response.json({ error: "Formato JSON inválido." }, { status: 400 });
    }
}
