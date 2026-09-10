import { requireAccessAdministrator } from "@/src/shared/backend/barcode/require-access-administrator";
import { barcodeRateLimit, hasSameOrigin, isBarcodeAccessProtectionReady } from '@/src/modules/auth/backend/barcode/barcode-access-service';
import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { NextResponse } from 'next/server';
import { getBarcodeAccessActions } from '@/src/modules/auth/backend/barcode/barcode-access-factory';

/** Lists authorized browser terminals for the selected tenant. */
export const GET = withTenant(async (request, tenant) => {
    await requireAccessAdministrator(tenant, request);
    const result = await getBarcodeAccessActions().listTerminals.execute(tenant.tenantId);
    if (result.isFailure) return NextResponse.json({ error: "No se pudo completar la operación de acceso.", code: result.getError() }, { status: 503 });
    return NextResponse.json({ data: { terminals: result.getValue() } }, { headers: { 'Cache-Control': 'no-store' } });
});

/** Enrolls the current browser as a terminal and stores its credential in an HttpOnly cookie. */
export const POST = withTenant(async (request, tenant) => {
    if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origen de solicitud no válido.', code: 'csrf_denied' }, { status: 403 });
    await requireAccessAdministrator(tenant, request);
    if (!(await isBarcodeAccessProtectionReady())) return NextResponse.json({ error: 'El acceso por carnet todavía no está listo.', code: 'barcode_access_unavailable' }, { status: 503 });
    const denied = await barcodeRateLimit(request, { bucket: 'barcode-terminal-enroll', limit: 5, windowSec: 60, keyExtra: tenant.tenantId });
    if (denied) return denied;
    let body: { name?: unknown };
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Formato de solicitud inválido.', code: 'invalid_request' }, { status: 400 }); }
    if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.trim().length > 100) return NextResponse.json({ error: 'El nombre de la terminal es inválido.', code: 'invalid_name' }, { status: 400 });
    try {
        const result = await getBarcodeAccessActions().enrollTerminal.execute({ tenantId: tenant.tenantId, actorId: tenant.userId, name: body.name });
        if (result.isFailure) return NextResponse.json({ error: "No se pudo completar la operación de acceso.", code: result.getError() }, { status: 503 });
        const created = result.getValue();
        const response = NextResponse.json({ data: { terminal: created.terminal } }, { status: 201 });
        response.cookies.set('kont_barcode_terminal', created.cookieValue, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 365 });
        return response;
    } catch { return NextResponse.json({ error: 'No pudimos habilitar la terminal.', code: 'terminal_create_failed' }, { status: 500 }); }
});
