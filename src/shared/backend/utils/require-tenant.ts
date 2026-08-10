import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { tenantSchemaName } from '../source/infra/tenant-supabase';
import { ServerSupabaseSource } from '../source/infra/server-supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TenantRole = 'owner' | 'admin' | 'contador' | 'contable' | 'vendedor' | 'cajero';
export type PermissionCode = `${string}.${string}`;
export type ActingAs = { ownerId: string; role: TenantRole };

export type TenantContext = {
    userId:     string;
    /** Tenant selected and authorized for this request. */
    tenantId:   string;
    schemaName: string;
    actingAs:   ActingAs | null;
    role:       ActingAs['role'];
    /**
     * UUID del tenant cuyo schema se va a tocar. Es lo que las RPCs `tenant_*`
     * deben recibir como `p_user_id`. Equivale a `actingAs?.ownerId ?? userId`,
     * pero al exponerlo aquí evitamos que cada repo lo recalcule (y se equivoque).
     */
    effectiveOwnerId: string;
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

export class PermissionDeniedError extends TenantForbiddenError {
    readonly permission: PermissionCode;
    constructor(permission: PermissionCode) {
        super();
        this.message = `Permiso requerido: ${permission}`;
        this.permission = permission;
    }
}

// ── Core function ─────────────────────────────────────────────────────────────

export function requireTenantRole(context: Pick<TenantContext, 'role'>, ...allowed: ActingAs['role'][]): void {
    if (!allowed.includes(context.role)) {
        throw new TenantForbiddenError();
    }
}

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
            return {
                userId,
                tenantId:         userId,
                schemaName:       tenantSchemaName(userId),
                actingAs:         null,
                role:             'owner',
                effectiveOwnerId: userId,
            };
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
            tenantId:         mb.tenant_id,
            schemaName:       tenantSchemaName(mb.tenant_id),
            actingAs:         { ownerId: mb.tenant_id, role: mb.role as ActingAs['role'] },
            role:             mb.role as ActingAs['role'],
            effectiveOwnerId: mb.tenant_id,
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
        tenantId:         targetId,
        schemaName:       tenantSchemaName(targetId),
        actingAs:         { ownerId: targetId, role: membership.role as ActingAs['role'] },
        role:             membership.role as ActingAs['role'],
        effectiveOwnerId: targetId,
    };
}

export async function requirePermission(
    context: TenantContext,
    permission: PermissionCode,
    options?: { req?: Request; resourceType?: string; resourceId?: string; auditAllow?: boolean },
): Promise<void> {
    const normalizedRole = context.role === 'contable' ? 'contador' : context.role;
    let allowed = normalizedRole === 'owner';

    if (!allowed) {
        const server = new ServerSupabaseSource();
        const { data, error } = await server.instance
            .from('shared_authorization_role_permissions')
            .select('permission_code')
            .eq('role', normalizedRole)
            .eq('permission_code', permission)
            .maybeSingle();
        allowed = !error && !!data;
    }

    if (!allowed) {
        await writeAuthorizationAudit(context, permission, 'deny', options);
        throw new PermissionDeniedError(permission);
    }

    if (options?.auditAllow) await writeAuthorizationAudit(context, permission, 'allow', options);
}

async function writeAuthorizationAudit(
    context: TenantContext,
    permission: PermissionCode,
    decision: 'allow' | 'deny',
    options?: { req?: Request; resourceType?: string; resourceId?: string },
): Promise<void> {
    try {
        const server = new ServerSupabaseSource();
        await server.instance.from('shared_authorization_audit').insert({
            user_id: context.userId,
            tenant_id: context.tenantId,
            permission_code: permission,
            resource_type: options?.resourceType ?? null,
            resource_id: options?.resourceId ?? null,
            method: options?.req?.method ?? null,
            path: options?.req ? new URL(options.req.url).pathname : null,
            decision,
            reason: decision === 'deny' ? 'missing_permission' : null,
        });
    } catch (error) {
        console.error('[authorization] audit write failed', error);
    }
}

export function withTenantPermission(
    permission: PermissionCode,
    handler: (req: Request, tenant: TenantContext) => Promise<Response>,
) {
    return withTenant(async (req, tenant) => {
        await requirePermission(tenant, permission, { req });
        return handler(req, tenant);
    });
}

// ── withTenant wrapper ────────────────────────────────────────────────────────

/** Envuelve una API route con auth automática e inyección de TenantContext */
export function withTenant(
    handler: (req: Request, tenant: TenantContext) => Promise<Response>
) {
    return async (req: Request): Promise<Response> => {
        try {
            const tenant = await requireTenant(req);
            const inferredPermission = inferPermissionFromRequest(req);
            if (inferredPermission) {
                await requirePermission(tenant, inferredPermission, { req });
            }
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

/**
 * Safety net for routes that have not yet been converted to an explicit
 * withTenantPermission declaration. Every tenant-aware API route is still
 * deny-by-default at module/action level.
 */
function inferPermissionFromRequest(req: Request): PermissionCode | null {
    const path = new URL(req.url).pathname.split('/').filter(Boolean);
    const apiIndex = path.indexOf('api');
    const moduleName = apiIndex >= 0 ? path[apiIndex + 1] : undefined;
    const resources = new Set(['companies', 'employees', 'payroll', 'inventory', 'purchases', 'sales', 'accounting', 'billing', 'memberships', 'documents']);
    if (!moduleName || !resources.has(moduleName)) return null;

    const operation = path.slice(apiIndex + 2);
    if (moduleName === 'memberships') {
        if (operation.includes('invite')) return 'members.invite';
        if (operation.includes('members')) return 'members.read';
        return req.method === 'DELETE' ? 'members.revoke' : 'members.read';
    }
    if (moduleName === 'billing') {
        // The shell needs read-only billing metadata to decide which paid
        // modules to render. These endpoints do not expose billing actions or
        // payment data, so any active tenant member may query them.
        const isReadOnlyMetadataRequest =
            req.method === 'GET' &&
            (operation.includes('subscriptions') ||
                operation.includes('tenant') ||
                operation.includes('capacity'));
        if (isReadOnlyMetadataRequest) return null;
        if (req.method !== 'GET') return 'billing.manage';
    }
    let action: string;
    if (operation.includes('confirm')) action = 'confirm';
    else if (operation.includes('unconfirm') || operation.includes('cancel')) action = moduleName === 'payroll' ? 'delete' : 'cancel';
    else if (operation.includes('close')) action = 'close';
    else if (operation.includes('post')) action = 'post';
    else if (req.method === 'GET') action = 'read';
    else if (req.method === 'POST') action = 'create';
    else if (req.method === 'PATCH' || req.method === 'PUT') action = 'update';
    else if (req.method === 'DELETE') action = 'delete';
    else action = 'read';

    return `${moduleName}.${action}` as PermissionCode;
}
