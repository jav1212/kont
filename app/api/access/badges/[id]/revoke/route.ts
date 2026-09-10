import { getBarcodeAccessActions } from '@/src/modules/auth/backend/barcode/barcode-access-factory';
import { requireAccessAdministrator } from "@/src/shared/backend/barcode/require-access-administrator";
import { hasSameOrigin } from '@/src/modules/auth/backend/barcode/barcode-access-service';
import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { NextResponse } from 'next/server';

/** Revokes a badge and all live sessions that used it. */
export const POST = withTenant(async (request, tenant) => {
    if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origen de solicitud no válido.', code: 'csrf_denied' }, { status: 403 });
    await requireAccessAdministrator(tenant, request);
    const badgeId = new URL(request.url).pathname.split('/').at(-2) ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(badgeId)) return NextResponse.json({ error: 'Carnet inválido.', code: 'invalid_badge' }, { status: 400 });
    const result = await getBarcodeAccessActions().revokeBadge.execute({ tenantId: tenant.tenantId, badgeId, actorId: tenant.userId });
    if (result.isFailure) return NextResponse.json({ error: "No se pudo completar la operación de acceso.", code: result.getError() }, { status: 503 });
    return NextResponse.json({ data: { revoked: result.getValue() } });
});
