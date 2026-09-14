import { requireAccessAdministrator } from '@/src/shared/backend/barcode/require-access-administrator';
import { barcodeRateLimit, hasSameOrigin } from '@/src/modules/auth/backend/barcode/barcode-access-service';
import { getBarcodeAccessActions } from '@/src/modules/auth/backend/barcode/barcode-access-factory';
import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { NextResponse } from 'next/server';

/**
 * Returns every active tenant badge for a complete printable export.
 * @param request - Same-origin administrator request scoped by the tenant wrapper.
 * @returns An uncached complete badge collection or an actionable legacy-card failure.
 */
export const POST = withTenant(async (request, tenant) => {
    if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origen de solicitud no válido.', code: 'csrf_denied' }, { status: 403 });
    await requireAccessAdministrator(tenant, request);
    const denied = await barcodeRateLimit(request, { bucket: 'barcode-badge-export', limit: 2, windowSec: 60, keyExtra: tenant.tenantId });
    if (denied) return denied;
    const result = await getBarcodeAccessActions().reprintAllBadges.execute({ tenantId: tenant.tenantId, actorId: tenant.userId });
    if (result.isFailure) {
        const legacy = result.getError() === 'badge_reprint_legacy';
        return NextResponse.json({ error: legacy ? 'Hay carnets activos anteriores que no pueden reimprimirse. Reemítelos antes de exportar el PDF completo.' : 'La exportación no está disponible temporalmente. Intenta de nuevo.', code: 'badge_reprint_unavailable' }, { status: legacy ? 409 : 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ data: { badges: result.getValue() } }, { headers: { 'Cache-Control': 'no-store' } });
});
