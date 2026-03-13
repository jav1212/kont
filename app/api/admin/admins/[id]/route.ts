import { createClient }  from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { requireAdmin } from "@/src/shared/backend/utils/require-admin";
import { cookies }      from "next/headers";

function serviceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

/**
 * DELETE /api/admin/admins/[id]
 * Elimina un administrador.
 * No permite que un admin se elimine a sí mismo.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const check = await requireAdmin(req);
    if (check) return check;

    const { id } = await params;

    // Obtener el usuario actual para evitar auto-eliminación
    const cookieStore = await cookies();
    const authClient  = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const { data: { user } } = await authClient.auth.getUser();

    if (user?.id === id) {
        return Response.json({ error: "No puedes eliminarte a ti mismo." }, { status: 400 });
    }

    const supabase = serviceClient();

    // Eliminar de admin_users primero (FK lo quitará de auth si hay cascade,
    // pero eliminamos manualmente de auth también para limpiar del todo)
    const { error: dbError } = await supabase
        .from("admin_users")
        .delete()
        .eq("id", id);

    if (dbError) return Response.json({ error: dbError.message }, { status: 500 });

    // Eliminar de Supabase Auth
    await supabase.auth.admin.deleteUser(id);

    return Response.json({ data: { ok: true } });
}
