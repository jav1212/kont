import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { hasSameOrigin, sessionIdFromAccessToken, terminalFromCookie, touchBarcodeSession, validateBarcodeAccessSession } from '@/src/modules/auth/backend/barcode/barcode-access-service';

/** Reads barcode-session state without extending its inactivity lifetime. */
export async function GET(): Promise<Response> {
    const cookieStore = await cookies();
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } });
    const [{ data: userData }, { data: sessionData }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);
    const user = userData.user;
    const sessionId = sessionData.session?.access_token ? sessionIdFromAccessToken(sessionData.session.access_token) : null;
    const terminal = await terminalFromCookie(cookieStore.get('kont_barcode_terminal')?.value);
    const terminalData = terminal ? { ready: true, id: terminal.id, name: terminal.name, tenantId: terminal.tenant_id } : { ready: false };
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
