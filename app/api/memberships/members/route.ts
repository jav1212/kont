import { requirePermission, withTenant } from "@/src/shared/backend/utils/require-tenant";
import { getMembershipsActions } from "@/src/modules/memberships/backend/memberships-factory";
import { handleResult } from "@/src/shared/backend/utils/handle-result";
import { DirectMemberRole } from "@/src/modules/memberships/backend/domain/memberships-repository";

/**
 * GET /api/memberships/members
 * Lists members of the active tenant (accepted + pending invitations).
 * Only accessible by owner or admin.
 */
export const GET = withTenant(async (_req, { userId, actingAs, effectiveOwnerId, tenantId, role}) => {
    await requirePermission({ userId, actingAs, effectiveOwnerId, tenantId, schemaName: "", role }, "members.read");
    const tenantOwnerId = tenantId;
    const callerRole    = role;

    const result = await getMembershipsActions().getMembers.execute({ tenantOwnerId, callerRole });

    if (result.isFailure) {
        return Response.json({ error: result.getError() }, { status: 403 });
    }

    return handleResult(result);
});

/**
 * Creates a confirmed password-based member in the active tenant without an email OTP.
 *
 * @param req - Request body containing email, password, and an allowed member role.
 * @returns A 201 member response, or a localized validation, authorization, conflict, or availability response.
 * @throws Never throws expected failures; they are represented as HTTP responses.
 */
export const POST = withTenant(async (req, { userId, actingAs, effectiveOwnerId, tenantId, role }) => {
    await requirePermission({ userId, actingAs, effectiveOwnerId, tenantId, schemaName: "", role }, "members.invite", { req });

    let body: { email?: unknown; password?: unknown; role?: unknown };
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: 'Formato de solicitud inválido.', code: 'invalid_request' }, { status: 400 });
    }
    if (!body || Array.isArray(body) || typeof body !== 'object') {
        return Response.json({ error: 'Formato de solicitud inválido.', code: 'invalid_request' }, { status: 400 });
    }

    const result = await getMembershipsActions().createDirectMember.execute({
        tenantOwnerId: tenantId,
        invitedBy: userId,
        email: typeof body.email === 'string' ? body.email : '',
        password: typeof body.password === 'string' ? body.password : '',
        role: body.role as DirectMemberRole,
        callerRole: role,
    });

    if (result.isFailure) {
        const code = result.getError();
        const response = directMemberFailureResponse(code);
        return Response.json({ error: response.error, code }, { status: response.status });
    }

    return Response.json({ data: result.getValue() }, { status: 201 });
});

/**
 * Converts internal direct-member failure codes to localized HTTP-safe responses.
 *
 * @param code - Stable failure code returned by the memberships application layer.
 * @returns The status and message safe to expose to an authenticated caller.
 * @throws Never throws for recognized or unknown failure codes.
 */
function directMemberFailureResponse(code: string): { status: number; error: string } {
    switch (code) {
        case 'email_already_exists': return { status: 409, error: 'Ya existe un usuario con ese correo.' };
        case 'insufficient_permissions': return { status: 403, error: 'No tienes permiso para crear miembros.' };
        case 'admins_cannot_create_admins': return { status: 403, error: 'Los administradores no pueden crear otros administradores.' };
        case 'invalid_email': return { status: 400, error: 'Ingresa un correo electrónico válido.' };
        case 'invalid_password': return { status: 400, error: 'La contraseña debe tener al menos 8 caracteres.' };
        case 'password_requirements': return { status: 400, error: 'La contraseña no cumple los requisitos de seguridad. Usa una contraseña más fuerte.' };
        case 'invalid_role': return { status: 400, error: 'El rol seleccionado no es válido.' };
        case 'provisioning_unavailable': return { status: 503, error: 'El servicio para crear miembros no está disponible. Intenta nuevamente.' };
        case 'provisioning_incomplete': return { status: 503, error: 'La cuenta fue creada, pero no pudimos confirmar que quedara vinculada a la organización. No la crees nuevamente; revisa los miembros o contacta soporte.' };
        default: return { status: 500, error: 'No pudimos crear el miembro. Intenta nuevamente.' };
    }
}
