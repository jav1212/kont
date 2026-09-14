import { requireAccessAdministrator } from "@/src/shared/backend/barcode/require-access-administrator";
import { barcodeRateLimit, hasSameOrigin } from '@/src/modules/auth/backend/barcode/barcode-access-service';
import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { NextResponse } from 'next/server';
import { getBarcodeAccessActions } from '@/src/modules/auth/backend/barcode/barcode-access-factory';

/** Lists issued tenant badges without exposing barcode credential material. */
export const GET = withTenant(async (request, tenant) => {
    await requireAccessAdministrator(tenant, request);
    const result = await getBarcodeAccessActions().listBadges.execute(tenant.tenantId);
    if (result.isFailure) return NextResponse.json({ error: "No se pudo completar la operación de acceso.", code: result.getError() }, { status: 503 });
    return NextResponse.json({ data: { badges: result.getValue() } }, { headers: { 'Cache-Control': 'no-store' } });
});

/** Issues a one-time printable Code 128 badge for an active confirmed member. */
export const POST = withTenant(async (request, tenant) => {
    if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origen de solicitud no válido.', code: 'csrf_denied' }, { status: 403 });
    await requireAccessAdministrator(tenant, request);
    const denied = await barcodeRateLimit(request, { bucket: 'barcode-badge-issue', limit: 10, windowSec: 60, keyExtra: tenant.tenantId });
    if (denied) return denied;
    let body: { userId?: unknown };
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Formato de solicitud inválido.', code: 'invalid_request' }, { status: 400 }); }
    if (typeof body.userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.userId)) return NextResponse.json({ error: 'Usuario inválido.', code: 'invalid_user' }, { status: 400 });
    try {
        const result = await getBarcodeAccessActions().issueBadge.execute({ tenantId: tenant.tenantId, userId: body.userId, actorId: tenant.userId });
        if (result.isFailure) {
            const unavailable = result.getError() === 'badge_reprint_unavailable';
            return NextResponse.json({ error: unavailable ? 'La emisión de carnets no está disponible temporalmente. Intenta de nuevo.' : "No se pudo emitir el carnet.", code: result.getError() }, { status: unavailable ? 503 : 400 });
        }
        return NextResponse.json({ data: result.getValue() }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        const code = error instanceof Error ? error.message : 'badge_issue_failed';
        const status = code === 'badge_user_not_member' || code === 'badge_user_ineligible' ? 400 : code === 'badge_already_active' ? 409 : 500;
        return NextResponse.json({ error: status === 500 ? 'No pudimos emitir el carnet.' : 'El usuario no puede recibir un carnet.', code }, { status });
    }
});
