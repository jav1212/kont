import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/** Authenticated platform administrator identity. */
export interface AdminIdentity {
    /** Stable Supabase Auth identifier of the administrator. */
    readonly userId: string;
}

/**
 * Resolves the authenticated platform administrator for an HTTP request.
 *
 * @param _req - Incoming request whose cookie session is verified.
 * @returns The administrator identity, or a 401/403 response suitable for returning from a route.
 */
export async function requireAdminIdentity(_req: Request): Promise<AdminIdentity | Response> {
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

    return { userId: user.id };
}

/**
 * Verifies that the request belongs to a platform administrator while preserving the legacy route contract.
 *
 * @param _req - Incoming request whose cookie session is verified.
 * @returns Null for an administrator, or a 401/403 response suitable for returning from a route.
 */
export async function requireAdmin(_req: Request): Promise<Response | null> {
    const identity = await requireAdminIdentity(_req);
    return identity instanceof Response ? identity : null;
}
