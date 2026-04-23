import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { tenantSchemaName } from '../source/infra/tenant-supabase';
import { ServerSupabaseSource } from '../source/infra/server-supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActingAs = { ownerId: string; role: 'owner' | 'admin' | 'contable' };

export type TenantContext = {
    userId:     string;
    schemaName: string;
    actingAs:   ActingAs | null;
};

// ── Errors ────────────────────────────────────────────────────────────────────

export class TenantAuthError extends Error {
    readonly status = 401;
    constructor() { super('No autenticado'); }
}

export class TenantForbiddenError extends Error {
    readonly status = 403;
    constructor() { super('Sin acceso a este tenant'); }
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Devuelve TenantContext del usuario autenticado en una API route.
 * Si el header X-Tenant-Id está presente y difiere del userId propio,
 * verifica la membresía en public.tenant_memberships e inyecta actingAs.
 */
export async function requireTenant(req?: Request): Promise<TenantContext> {
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
        throw new TenantAuthError();
    }

    const userId = user.id;
    const server = new ServerSupabaseSource();

    const targetId = req?.headers.get('X-Tenant-Id') ?? null;

    // ── Caso 1: header ausente o apunta al userId propio ─────────────────
    // Puede ser un owner (tiene fila en public.tenants con id = userId)
    // o un invitado sin tenant propio (sólo existe como miembro en otros).
    if (!targetId || targetId === userId) {
        const { data: ownTenant } = await server.instance
            .from('tenants')
            .select('id')
            .eq('id', userId)
            .maybeSingle();

        if (ownTenant) {
            return { userId, schemaName: tenantSchemaName(userId), actingAs: null };
        }

        // Invitado sin tenant propio → actuar sobre el primer tenant del
        // que es miembro activo (el dueño que lo invitó).
        const { data: firstMembership } = await server.instance
            .from('tenant_memberships')
            .select('tenant_id, role')
            .eq('member_id', userId)
            .not('accepted_at', 'is', null)
            .is('revoked_at', null)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (!firstMembership) {
            throw new TenantForbiddenError();
        }

        const mb = firstMembership as { tenant_id: string; role: string };
        return {
            userId,
            schemaName: tenantSchemaName(mb.tenant_id),
            actingAs:   { ownerId: mb.tenant_id, role: mb.role as ActingAs['role'] },
        };
    }

    // ── Caso 2: header apunta a otro tenant → verificar membresía ────────
    const { data: membership, error: mbError } = await server.instance
        .from('tenant_memberships')
        .select('role')
        .eq('tenant_id', targetId)
        .eq('member_id', userId)
        .not('accepted_at', 'is', null)
        .is('revoked_at', null)
        .single();

    if (mbError || !membership) {
        throw new TenantForbiddenError();
    }

    return {
        userId,
        schemaName: tenantSchemaName(targetId),
        actingAs:   { ownerId: targetId, role: membership.role as ActingAs['role'] },
    };
}

// ── withTenant wrapper ────────────────────────────────────────────────────────

/** Envuelve una API route con auth automática e inyección de TenantContext */
export function withTenant(
    handler: (req: Request, tenant: TenantContext) => Promise<Response>
) {
    return async (req: Request): Promise<Response> => {
        try {
            const tenant = await requireTenant(req);
            return await handler(req, tenant);
        } catch (err) {
            if (err instanceof TenantAuthError) {
                return Response.json({ error: 'No autenticado' }, { status: 401 });
            }
            if (err instanceof TenantForbiddenError) {
                return Response.json({ error: 'Sin acceso a este tenant' }, { status: 403 });
            }
            throw err;
        }
    };
}
