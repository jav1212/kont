import { getBarcodeAccessActions } from '@/src/modules/auth/backend/barcode/barcode-access-factory';
import { barcodeRateLimit, hasSameOrigin } from '@/src/modules/auth/backend/barcode/barcode-access-service';
import { parseBadgeBatchCommand } from '@/src/modules/auth/backend/barcode/application/badge-batch-policy';
import { requireAccessAdministrator } from '@/src/shared/backend/barcode/require-access-administrator';
import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { NextResponse } from 'next/server';

const MAX_BATCH_BADGES = 50;

/**
 * Emits new printable credentials for selected tenant members.
 * Active credentials are only replaced when `replaceExisting` is explicitly
 * true; replacement invalidates their live sessions. Raw credentials stay
 * encrypted server-side and are not exposed by this batch response.
 *
 * @param request - Same-origin request containing a bounded, unique user ID list.
 * @returns Per-user issue results containing safe badge metadata only.
 */
export const POST = withTenant(async (request, tenant) => {
    if (!hasSameOrigin(request)) {
        return NextResponse.json({ error: 'Origen de solicitud no válido.', code: 'csrf_denied' }, { status: 403 });
    }
    await requireAccessAdministrator(tenant, request);

    // A bulk "all members" action is sent in chunks of 50. This allows 20
    // chunks per tenant/minute (at most 1,000 new credentials) while still
    // constraining expensive eligibility checks and credential replacement.
    const denied = await barcodeRateLimit(request, {
        bucket: 'barcode-badge-batch-issue',
        limit: 20,
        windowSec: 60,
        keyExtra: tenant.tenantId,
    });
    if (denied) return denied;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Formato de solicitud inválido.', code: 'invalid_request' }, { status: 400 });
    }
    const command = parseBadgeBatchCommand(body, MAX_BATCH_BADGES);
    if (!command) {
        return NextResponse.json({ error: `Seleccione entre 1 y ${MAX_BATCH_BADGES} usuarios distintos.`, code: 'invalid_users' }, { status: 400 });
    }

    const result = await getBarcodeAccessActions().issueBadges.execute({
        tenantId: tenant.tenantId,
        userIds: command.userIds,
        actorId: tenant.userId,
        replaceExisting: command.replaceExisting,
    });
    if (result.isFailure) {
        return NextResponse.json({ error: 'No se pudieron emitir los carnets.', code: result.getError() }, { status: 503 });
    }
    return NextResponse.json({ data: { results: result.getValue() } }, {
        headers: { 'Cache-Control': 'no-store' },
    });
});
