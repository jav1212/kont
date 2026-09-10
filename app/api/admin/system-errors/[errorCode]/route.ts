import { getSystemErrorActions } from "@/src/modules/system-errors/backend/infrastructure/system-error-factory";
import { isResolutionStatus } from "@/src/modules/system-errors/backend/domain/system-error";
import { requireAdminIdentity } from "@/src/shared/backend/utils/require-admin";

const ERROR_CODE_PATTERN = /^KNT-[0-9]{8}-[A-Z0-9]{8}$/;

/**
 * Changes an incident resolution state as the authenticated platform administrator.
 * @param req - HTTP request whose body contains the requested status.
 * @param context - Route parameter containing the encoded incident support code.
 * @returns The updated incident, or an authorization, validation, or not-found response.
 */
export async function PATCH(
    req: Request,
    context: { params: Promise<{ errorCode: string }> },
): Promise<Response> {
    const identity = await requireAdminIdentity(req);
    if (identity instanceof Response) return identity;

    const { errorCode } = await context.params;
    if (!ERROR_CODE_PATTERN.test(errorCode)) {
        return Response.json({ error: "errorCode inválido" }, { status: 400 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body) || !("status" in body) || !isResolutionStatus(body.status)) {
        return Response.json({ error: "status debe ser pending o resolved" }, { status: 400 });
    }

    const result = await getSystemErrorActions().setResolution.execute({
        errorCode,
        status: body.status,
        actorUserId: identity.userId,
    });
    if (result.isFailure) {
        console.error("[admin/system-errors] resolution update failed", result.getError());
        return Response.json({ error: "No se pudo actualizar el estado del error." }, { status: 500 });
    }
    if (!result.getValue()) return Response.json({ error: "Error no encontrado" }, { status: 404 });
    return Response.json({ data: result.getValue() });
}
