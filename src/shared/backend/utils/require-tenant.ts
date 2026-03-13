import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { tenantSchemaName } from '../source/infra/tenant-supabase';

/**
 * Devuelve { userId, schemaName } del usuario autenticado en una API route.
 * Lanza un Response con 401 si no hay sesión válida.
 */
export async function requireTenant(): Promise<{ userId: string; schemaName: string }> {
    const cookieStore = await cookies();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => cookieStore.getAll(),
                setAll: () => {},   // solo lectura en API routes
            },
        }
    );

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        throw new TenantAuthError();
    }

    return {
        userId:     user.id,
        schemaName: tenantSchemaName(user.id),
    };
}

export class TenantAuthError extends Error {
    readonly status = 401;
    constructor() { super('No autenticado'); }
}

/** Envuelve una API route con auth automática */
export function withTenant(
    handler: (req: Request, tenant: { userId: string; schemaName: string }) => Promise<Response>
) {
    return async (req: Request): Promise<Response> => {
        try {
            const tenant = await requireTenant();
            return await handler(req, tenant);
        } catch (err) {
            if (err instanceof TenantAuthError) {
                return Response.json({ error: 'No autenticado' }, { status: 401 });
            }
            throw err;
        }
    };
}
