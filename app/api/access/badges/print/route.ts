import { requireAccessAdministrator } from '@/src/shared/backend/barcode/require-access-administrator';
import { barcodeRateLimit, hasSameOrigin } from '@/src/modules/auth/backend/barcode/barcode-access-service';
import { getBarcodeAccessActions } from '@/src/modules/auth/backend/barcode/barcode-access-factory';
import { parseBadgePrintCommand } from '@/src/modules/auth/backend/barcode/application/badge-batch-policy';
import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { NextResponse } from 'next/server';

const MAX_PRINT_BADGES = 1_000;

/**
 * Restores only the tenant badges selected by an administrator for export.
 * @param request - Same-origin request with a bounded, unique badge ID selection.
 * @returns An uncached selected badge collection or an actionable reprint failure.
 */
export const POST = withTenant(async (request, tenant) => {
    if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origen de solicitud no válido.', code: 'csrf_denied' }, { status: 403 });
    await requireAccessAdministrator(tenant, request);
    const denied = await barcodeRateLimit(request, { bucket: 'barcode-badge-export', limit: 2, windowSec: 60, keyExtra: tenant.tenantId });
    if (denied) return denied;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Formato de solicitud inválido.', code: 'invalid_request' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const command = parseBadgePrintCommand(body, MAX_PRINT_BADGES);
    if (!command) {
        return NextResponse.json({ error: `Seleccione entre 1 y ${MAX_PRINT_BADGES} carnets distintos.`, code: 'invalid_badges' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const result = await getBarcodeAccessActions().reprintBadges.execute({ tenantId: tenant.tenantId, badgeIds: command.badgeIds, actorId: tenant.userId });
    if (result.isFailure) {
        const legacy = result.getError() === 'badge_reprint_legacy';
        return NextResponse.json({ error: legacy ? 'Uno o más carnets seleccionados son anteriores y deben reemitirse antes de exportarlos.' : 'La exportación no está disponible temporalmente. Intenta de nuevo.', code: 'badge_reprint_unavailable' }, { status: legacy ? 409 : 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ data: { badges: result.getValue() } }, { headers: { 'Cache-Control': 'no-store' } });
});
