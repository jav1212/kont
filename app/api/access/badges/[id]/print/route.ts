import { requireAccessAdministrator } from '@/src/shared/backend/barcode/require-access-administrator';
import { barcodeRateLimit, hasSameOrigin } from '@/src/modules/auth/backend/barcode/barcode-access-service';
import { getBarcodeAccessActions } from '@/src/modules/auth/backend/barcode/barcode-access-factory';
import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { NextResponse } from 'next/server';

/**
 * Reissues the printable representation of one active badge without rotating it.
 * @param request - Same-origin administrator request scoped by the tenant wrapper.
 * @returns An uncached badge credential only when it can be restored safely.
 */
export const POST = withTenant(async (request, tenant) => {
    if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origen de solicitud no válido.', code: 'csrf_denied' }, { status: 403 });
    await requireAccessAdministrator(tenant, request);
    const badgeId = new URL(request.url).pathname.split('/').at(-2) ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(badgeId)) return NextResponse.json({ error: 'Carnet inválido.', code: 'invalid_badge' }, { status: 400 });
    const denied = await barcodeRateLimit(request, { bucket: 'barcode-badge-reprint', limit: 10, windowSec: 60, keyExtra: tenant.tenantId });
    if (denied) return denied;
    const result = await getBarcodeAccessActions().reprintBadge.execute({ tenantId: tenant.tenantId, badgeId, actorId: tenant.userId });
    if (result.isFailure) {
        const legacy = result.getError() === 'badge_reprint_legacy';
        return NextResponse.json({ error: legacy ? 'Este carnet fue emitido antes de la función de reimpresión. Emite uno nuevo para imprimirlo.' : 'La reimpresión no está disponible temporalmente. Intenta de nuevo.', code: legacy ? 'badge_reprint_unavailable' : 'badge_reprint_unavailable' }, { status: legacy ? 409 : 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ data: result.getValue() }, { headers: { 'Cache-Control': 'no-store' } });
});
