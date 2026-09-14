import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { BARCODE_TERMINAL_COOKIE, hasSameOrigin, sessionIdFromAccessToken, resolveBarcodeTerminal, touchBarcodeSession, validateBarcodeAccessSession } from '@/src/modules/auth/backend/barcode/barcode-access-service';

/**
 * Reads browser enrollment and session state without extending inactivity lifetime.
 * @returns Uncached session status with safe enrollment failure reasons, or a 503 on lookup failure.
 */
export async function GET(): Promise<Response> {
    try {
        return await readSessionStatus();
    } catch {
        return NextResponse.json({ error: 'No se pudo verificar el acceso. Intenta nuevamente.', code: 'barcode_session_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
}

async function readSessionStatus(): Promise<Response> {
    const cookieStore = await cookies();
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } });
    const [{ data: userData }, { data: sessionData }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);
    const user = userData.user;
    const sessionId = sessionData.session?.access_token ? sessionIdFromAccessToken(sessionData.session.access_token) : null;
    const resolution = await resolveBarcodeTerminal(cookieStore.get(BARCODE_TERMINAL_COOKIE)?.value);
    const terminalData = resolution.ready
        ? { ready: true, id: resolution.terminal.id, name: resolution.terminal.name, tenantId: resolution.terminal.tenant_id }
        : resolution;
    if (!user || !sessionId) return NextResponse.json({ data: { active: false, registered: false, terminal: terminalData } }, { headers: { 'Cache-Control': 'no-store' } });
    const status = await validateBarcodeAccessSession(user.id, sessionId, cookieStore.get('kont_barcode_terminal')?.value);
    return NextResponse.json({ data: status.active ? { active: true, registered: true, sessionId: status.id, expiresAt: status.expiresAt, idleExpiresAt: status.idleExpiresAt, tenantId: status.tenantId, terminal: terminalData } : { active: false, registered: status.registered, sessionId: status.id, terminal: terminalData } }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Records a genuine visible-page interaction; GET polling never extends barcode access. */
export async function POST(request: Request): Promise<Response> {
    if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origen de solicitud no válido.', code: 'csrf_denied' }, { status: 403 });
    let body: { sessionId?: unknown };
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Formato de solicitud inválido.', code: 'invalid_request' }, { status: 400 }); }
    if (typeof body.sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.sessionId)) return NextResponse.json({ error: 'Sesión inválida.', code: 'invalid_session' }, { status: 400 });
    const cookieStore = await cookies();
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } });
    const [{ data: userData }, { data: sessionData }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);
    const sessionId = sessionData.session?.access_token ? sessionIdFromAccessToken(sessionData.session.access_token) : null;
    const status = userData.user && sessionId ? await validateBarcodeAccessSession(userData.user.id, sessionId, cookieStore.get('kont_barcode_terminal')?.value) : null;
    if (!status?.active || status.id !== body.sessionId || !(await touchBarcodeSession(sessionId!, userData.user!.id, body.sessionId))) return NextResponse.json({ error: 'La sesión ya no está activa.', code: 'session_expired' }, { status: 401 });
    return NextResponse.json({ data: { active: true } }, { headers: { 'Cache-Control': 'no-store' } });
}
