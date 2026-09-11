import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { tenantSchemaName } from '../source/infra/tenant-supabase';
import { ServerSupabaseSource } from '../source/infra/server-supabase';
import { readBarcodeRequestAccess } from '../barcode/barcode-request-guard';
import { legacyRoleFromCanonical, resolveActiveLegacyTenant, type LegacyOrganizationRole } from './tenant-organization-access';
import { AuthorizationSource, permissionCode as canonicalPermissionCode, type AuthorizationSnapshot } from '@kontave/access-control/domain';
import { createAccessControlActions } from '@/src/client-api/v1/access-control/access-control-actions';
import { resolveWebApiPermission } from '@/src/modules/organizations/backend/web-api-route-access';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TenantRole = LegacyOrganizationRole;
export { legacyRoleFromCanonical } from './tenant-organization-access';
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
    /** Present only for a terminal-bound carnet session, already checked server-side. */
    barcodeSession?: boolean;
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
 * Resolves the authenticated Web tenant through an active organization bridge.
 * @param req Optional request carrying the tenant header.
 * @returns The active tenant context for the signed-in user.
 * @throws TenantAuthError for no authenticated user and TenantForbiddenError for denied access.
 */
export async function requireTenant(req?: Request): Promise<TenantContext> {
    const cookieStore = await cookies();
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
    });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new TenantAuthError();
    const userId = user.id;
    const server = new ServerSupabaseSource();
    const barcode = await readBarcodeRequestAccess(supabase, userId, cookieStore.get('kont_barcode_terminal')?.value);
    if (barcode.registered && (!barcode.active || !barcode.tenantId)) throw new TenantAuthError();
    const requestedTenantId = req?.headers.get('X-Tenant-Id') ?? null;
    if (barcode.registered && requestedTenantId && requestedTenantId !== barcode.tenantId) throw new TenantForbiddenError();

    const [ownTenantResult, membershipsResult] = await Promise.all([
        server.instance.from('tenants').select('id').eq('id', userId).maybeSingle(),
        server.instance.from('tenant_memberships').select('tenant_id, role').eq('member_id', userId)
            .not('accepted_at', 'is', null).is('revoked_at', null).order('created_at', { ascending: true }),
    ]);
    if (ownTenantResult.error || membershipsResult.error) throw new TenantForbiddenError();
    const memberships = (membershipsResult.data ?? []) as Array<{ tenant_id: string; role: string }>;
    const candidateTenantIds = [...new Set([userId, ...memberships.map((membership) => membership.tenant_id)])];
    const { data: organizations, error: organizationsError } = await server.instance.from('organizations')
        .select('legacy_tenant_id').in('legacy_tenant_id', candidateTenantIds).eq('status', 'active');
    if (organizationsError) throw new TenantForbiddenError();
    const activeOrganizationTenantIds = new Set(
        ((organizations ?? []) as Array<{ legacy_tenant_id: string | null }>).map((organization) => organization.legacy_tenant_id)
            .filter((tenantId): tenantId is string => tenantId !== null),
    );
    const resolved = resolveActiveLegacyTenant({
        userId, requestedTenantId, barcodeTenantId: barcode.registered ? barcode.tenantId! : null,
        ownsRequestedTenant: !!ownTenantResult.data,
        memberships: memberships.map((membership) => ({ tenantId: membership.tenant_id, role: membership.role })),
        activeOrganizationTenantIds,
    });
    if (!resolved) throw new TenantForbiddenError();
    const legacyContext: TenantContext = {
        ...(barcode.registered ? { barcodeSession: true } : {}), userId, tenantId: resolved.tenantId,
        schemaName: tenantSchemaName(resolved.tenantId),
        actingAs: resolved.isOwner ? null : { ownerId: resolved.tenantId, role: resolved.role as TenantRole },
        role: resolved.role as TenantRole, effectiveOwnerId: resolved.tenantId,
    };
    const authorization = await resolveCanonicalTenantAuthorization(legacyContext);
    if (!authorization || authorization.snapshot.membershipStatus !== 'active'
        || authorization.snapshot.organizationStatus !== 'active' || !authorization.snapshot.role.isActive()) {
        throw new TenantForbiddenError();
    }
    const role = legacyRoleFromCanonical(authorization.snapshot.role.code);
    return {
        ...legacyContext,
        role,
        actingAs: role === 'owner' ? null : { ownerId: legacyContext.tenantId, role },
    };
}

/**
 * Requires one canonical organization permission for an already resolved legacy tenant.
 *
 * @param context Active legacy tenant context whose organization bridge is verified server-side.
 * @param permission Canonical permission required by the operation.
 * @param options Optional request and audit metadata.
 * @returns Nothing when the active canonical role grants the permission.
 * @throws PermissionDeniedError when the organization, membership, role, or permission is invalid.
 */
export async function requirePermission(
    context: TenantContext,
    permission: PermissionCode,
    options?: { req?: Request; resourceType?: string; resourceId?: string; auditAllow?: boolean },
): Promise<void> {
    const authorization = await resolveCanonicalTenantAuthorization(context);
    let allowed = false;
    try {
        if (authorization) {
            await authorization.actions.require.execute({
                actor: { userId: context.userId, organizationId: authorization.organizationId },
                permission: canonicalPermissionCode(permission),
                resource: {
                    type: options?.resourceType ?? 'legacy-web',
                    id: options?.resourceId,
                    organizationId: authorization.organizationId,
                },
                context: { requestId: crypto.randomUUID(), source: AuthorizationSource.Web, occurredAt: new Date().toISOString() },
            });
            allowed = true;
        }
    } catch {
        // An unavailable, malformed, suspended, or unauthorized canonical
        // snapshot is deliberately indistinguishable from a permission deny.
        allowed = false;
    }

    if (!allowed) {
        await writeAuthorizationAudit(context, permission, 'deny', options);
        throw new PermissionDeniedError(permission);
    }

    if (options?.auditAllow) await writeAuthorizationAudit(context, permission, 'allow', options);
}

type CanonicalTenantAuthorization = {
    readonly organizationId: string;
    readonly snapshot: AuthorizationSnapshot;
    readonly actions: ReturnType<typeof createAccessControlActions>;
};

/**
 * Resolves the canonical active organization authorization snapshot associated
 * with a legacy tenant context.
 *
 * @param context Legacy tenant already authenticated for this request.
 * @returns The matching active organization snapshot, or null when the bridge is incomplete.
 * @throws Never throws expected failures; infrastructure failures resolve to null and callers fail closed.
 */
export async function resolveCanonicalTenantAuthorization(
    context: TenantContext,
): Promise<CanonicalTenantAuthorization | null> {
    try {
        const source = new ServerSupabaseSource().instance;
        const { data: organization, error } = await source
            .from('organizations')
            .select('id, legacy_tenant_id, status')
            .eq('legacy_tenant_id', context.tenantId)
            .eq('status', 'active')
            .maybeSingle();
        if (error || !organization || organization.legacy_tenant_id !== context.tenantId) return null;

        const actions = createAccessControlActions();
        const snapshot = await actions.repository.findSnapshot(context.userId, organization.id);
        if (!snapshot) return null;
        return { organizationId: organization.id, snapshot, actions };
    } catch {
        return null;
    }
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

/**
 * Wraps a route with one explicit canonical permission and disables inferred compatibility permissions.
 *
 * @param permission Canonical permission required by the route.
 * @param handler Handler invoked only after authentication and authorization.
 * @returns A route handler that turns expected authorization failures into HTTP responses.
 * @throws Never throws expected authorization failures.
 */
export function withTenantPermission(
    permission: PermissionCode,
    handler: (req: Request, tenant: TenantContext) => Promise<Response>,
) {
    return withTenantPermissions([permission], handler);
}

/**
 * Wraps a route with every explicitly listed canonical permission and no
 * secondary inferred compatibility permission.
 *
 * @param permissions All capabilities required by the operation.
 * @param handler Route handler that receives the authorized context.
 * @returns A Next route-compatible handler.
 * @throws TypeError when the route does not declare any permission.
 * Expected authorization failures become HTTP responses.
 */
export function withTenantPermissions(
    permissions: readonly PermissionCode[],
    handler: (req: Request, tenant: TenantContext) => Promise<Response>,
) {
    if (permissions.length === 0) throw new TypeError('An organization route must declare at least one permission.');
    return withTenant(async (req, tenant) => {
        for (const permission of permissions) {
            await requirePermission(tenant, permission, { req });
        }
        return handler(req, tenant);
    }, { inferPermission: false });
}

// ── withTenant wrapper ────────────────────────────────────────────────────────

/** Envuelve una API route con auth automática e inyección de TenantContext */
export function withTenant(
    handler: (req: Request, tenant: TenantContext) => Promise<Response>,
    options?: { readonly inferPermission?: boolean },
) {
    return async (req: Request): Promise<Response> => {
        try {
            const tenant = await requireTenant(req);
            const inferredPermission = options?.inferPermission === false ? null : inferPermissionFromRequest(req);
            if (inferredPermission) {
                await requirePermission(tenant, inferredPermission, { req });
            }
            return await handler(req, tenant);
        } catch (err) {
            if (err instanceof TenantAuthError) {
                return Response.json({ error: 'No autenticado' }, { status: 401 });
            }
            if (err instanceof PermissionDeniedError) {
                return Response.json({ error: err.message }, { status: 403 });
            }
            if (err instanceof TenantForbiddenError) {
                return Response.json({ error: 'Sin acceso a este tenant' }, { status: 403 });
            }
            throw err;
        }
    };
}

/**
 * Classifies a legacy Web API request into one canonical permission code.
 *
 * @param req Request whose pathname and method identify the operation.
 * @returns A canonical permission, null for documented metadata endpoints, or a deny sentinel.
 */
export function inferPermissionFromRequest(req: Request): PermissionCode | null {
    return resolveWebApiPermission(req);
}
