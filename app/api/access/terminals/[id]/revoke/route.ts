import { getBarcodeAccessActions } from '@/src/modules/auth/backend/barcode/barcode-access-factory';
import { requireAccessAdministrator } from "@/src/shared/backend/barcode/require-access-administrator";
import { hasSameOrigin } from '@/src/modules/auth/backend/barcode/barcode-access-service';
import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { NextResponse } from 'next/server';

/** Revokes a tenant terminal and sessions that were opened through it. */
export const POST = withTenant(async (request, tenant) => {
    if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origen de solicitud no válido.', code: 'csrf_denied' }, { status: 403 });
    await requireAccessAdministrator(tenant, request);
    const terminalId = new URL(request.url).pathname.split('/').at(-2) ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(terminalId)) return NextResponse.json({ error: 'Terminal inválida.', code: 'invalid_terminal' }, { status: 400 });
    const result = await getBarcodeAccessActions().revokeTerminal.execute({ tenantId: tenant.tenantId, terminalId, actorId: tenant.userId });
    if (result.isFailure) return NextResponse.json({ error: "No se pudo completar la operación de acceso.", code: result.getError() }, { status: 503 });
    return NextResponse.json({ data: { revoked: result.getValue() } });
});
