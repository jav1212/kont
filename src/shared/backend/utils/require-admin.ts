import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Verifica que el usuario autenticado sea admin.
 * Retorna null si es admin (puede continuar).
 * Retorna un Response 401/403 si no está autenticado o no es admin.
 */
export async function requireAdmin(_req: Request): Promise<Response | null> {
    const cookieStore = await cookies();

    const authClient = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => cookieStore.getAll(),
                setAll: () => {},
            },
        }
    );

    const { data: { user }, error } = await authClient.auth.getUser();

    if (error || !user) {
        return Response.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Verificar con service role para evitar que RLS bloquee la consulta
    const serviceClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data: admin } = await serviceClient
        .from('admin_users')
        .select('id')
        .eq('id', user.id)
        .single();

    if (!admin) {
        return Response.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    return null;
}
