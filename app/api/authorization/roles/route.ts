import { AccessControlFailure, permissionCode, roleId } from "@kontave/access-control/domain";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";

type RoleUpdateBody = { role?: unknown; permissions?: unknown; expectedVersion?: unknown };

/**
 * Lists the selected organization's canonical role catalog for the legacy Web settings page.
 *
 * @param request Cookie-authenticated request scoped by the active tenant header.
 * @returns Organization-local roles and the canonical permission definitions.
 */
export const GET = withTenantPermission("roles.read", async (request, tenant) => {
    const authorization = await resolveCanonicalTenantAuthorization(tenant);
    if (!authorization) return Response.json({ error: "Sin acceso a la organización." }, { status: 403 });

    const [roles, permissions] = await Promise.all([
        authorization.actions.listRoles.execute(authorization.organizationId),
        authorization.actions.listPermissions.execute(),
    ]);
    return Response.json({
        data: {
            roles: roles.map((role) => ({
                id: role.id,
                name: role.name,
                description: role.description,
                locked: role.kind === "system",
                kind: role.kind,
                version: role.version,
                permissions: [...role.permissions],
            })),
            permissions,
        },
    }, { headers: { "Cache-Control": "no-store" } });
});

/**
 * Replaces permissions on one mutable organization-local role using optimistic concurrency.
 *
 * @param request Cookie-authenticated request containing role UUID, permission codes, and version.
 * @returns The changed role's id, canonical permissions, and new version.
 */
export const PATCH = withTenantPermission("roles.manage", async (request, tenant) => {
    const authorization = await resolveCanonicalTenantAuthorization(tenant);
    if (!authorization) return Response.json({ error: "Sin acceso a la organización." }, { status: 403 });

    let body: RoleUpdateBody;
    try {
        body = await request.json() as RoleUpdateBody;
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)
        || typeof body.role !== "string" || !Array.isArray(body.permissions)
        || !body.permissions.every((permission) => typeof permission === "string")
        || !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 1) {
        return Response.json({ error: "role, permissions y expectedVersion son requeridos" }, { status: 400 });
    }

    try {
        const updated = await authorization.actions.updateRole.execute({
            actor: authorization.snapshot,
            organizationId: authorization.organizationId,
            roleId: roleId(body.role),
            permissions: body.permissions.map((permission) => permissionCode(permission)),
            expectedVersion: body.expectedVersion as number,
        });
        return Response.json({
            data: { role: updated.id, permissions: [...updated.permissions], version: updated.version },
        }, { headers: { "Cache-Control": "no-store" } });
    } catch (cause) {
        if (cause instanceof AccessControlFailure) {
            const status = cause.code === "ROLE_VERSION_CONFLICT" ? 409 : 400;
            return Response.json({ error: cause.message, code: cause.code }, { status });
        }
        if (cause instanceof TypeError) return Response.json({ error: "Permiso o rol inválido" }, { status: 400 });
        return Response.json({ error: "No se pudo actualizar el rol" }, { status: 503 });
    }
});
