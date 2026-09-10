import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { hasSameOrigin, lockBarcodeSession, sessionIdFromAccessToken } from '@/src/modules/auth/backend/barcode/barcode-access-service';
import { validateBarcodeAccessSession } from '@/src/modules/auth/backend/barcode/barcode-access-service';

/**
 * Invalidates the exact operator session without overwriting newer browser cookies.
 * @param request - Same-origin command containing the registry session ID shown by the tab.
 * @returns Confirmation or a conflict if another operator has replaced this session.
 */
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
    if (!status?.registered || status.id !== body.sessionId) return NextResponse.json({ error: 'La sesión cambió en otra pestaña.', code: 'session_mismatch' }, { status: 409 });
    const response = NextResponse.json({ data: { locked: true } }, { headers: { 'Cache-Control': 'no-store' } });
    // A delayed response from tab A must not delete the cookies set by a newer
    // login in tab B. Revoke A server-side; the next login replaces stale cookies.
    const signedSupabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } });
    if (userData.user && sessionId) await lockBarcodeSession(sessionId, userData.user.id, body.sessionId);
    await signedSupabase.auth.signOut({ scope: 'local' });
    return response;
}
