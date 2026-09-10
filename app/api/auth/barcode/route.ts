import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { barcodeRateLimit, hasSameOrigin, recordBarcodeLoginDenial, sessionIdFromAccessToken, terminalFromCookie } from '@/src/modules/auth/backend/barcode/barcode-access-service';
import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';
import { getBarcodeAccessActions } from '@/src/modules/auth/backend/barcode/barcode-access-factory';

/** Exchanges a badge read on an enrolled terminal for a normal Supabase browser session. */
export async function POST(request: Request): Promise<Response> {
    if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origen de solicitud no válido.', code: 'csrf_denied' }, { status: 403 });
    const denied = await barcodeRateLimit(request, { bucket: 'barcode-login', limit: 12, windowSec: 60 });
    if (denied) return denied;
    let body: { barcode?: unknown };
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Formato de solicitud inválido.', code: 'invalid_request' }, { status: 400 }); }
    if (typeof body.barcode !== 'string' || body.barcode.length > 256) return deniedBarcode();
    const cookieStore = await cookies();
    const terminal = await terminalFromCookie(cookieStore.get('kont_barcode_terminal')?.value);
    if (!terminal) return NextResponse.json({ error: 'Esta terminal no está habilitada.', code: 'terminal_unavailable' }, { status: 403 });
    const terminalDenied = await barcodeRateLimit(request, { bucket: 'barcode-login-terminal', limit: 20, windowSec: 60, keyExtra: terminal.id });
    if (terminalDenied) return terminalDenied;
    const badgeResult = await getBarcodeAccessActions().findLoginBadge.execute({ terminal, barcode: body.barcode.trim() });
    if (badgeResult.isFailure) return deniedBarcode(terminal);
    const badge = badgeResult.getValue();
    if (!badge) return deniedBarcode(terminal);

    const source = new ServerSupabaseSource().instance;
    const [{ data: platformAdmin, error: adminError }, { data: userData, error: userError }] = await Promise.all([
        source.from('admin_users').select('id').eq('id', badge.userId).maybeSingle(),
        source.auth.admin.getUserById(badge.userId),
    ]);
    const user = userData.user;
    if (adminError || platformAdmin || userError || !user?.email || !user.email_confirmed_at || (user.banned_until && Date.parse(user.banned_until) > Date.now()) || user.deleted_at || user.factors?.some((factor) => factor.status === 'verified')) return deniedBarcode(terminal);
    const { data: link, error: linkError } = await source.auth.admin.generateLink({ type: 'magiclink', email: user.email });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) return NextResponse.json({ error: 'No pudimos iniciar la sesión. Intenta de nuevo.', code: 'session_issue_failed' }, { status: 503 });

    const response = NextResponse.json({ data: {} }, { headers: { 'Cache-Control': 'no-store' } });
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: { getAll: () => cookieStore.getAll(), setAll: (items) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) },
    });
    const { data: otp, error: otpError } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
    const session = otp.session;
    const sessionId = session?.access_token ? sessionIdFromAccessToken(session.access_token) : null;
    if (otpError || !session || !sessionId || otp.user?.id !== badge.userId) {
        await supabase.auth.signOut({ scope: 'local' });
        return NextResponse.json({ error: 'No pudimos iniciar la sesión. Intenta de nuevo.', code: 'session_issue_failed' }, { status: 503 });
    }
    const expiryMs = Date.now() + 8 * 60 * 60 * 1000;
    try {
        const registeredResult = await getBarcodeAccessActions().registerSession.execute({ supabaseSessionId: sessionId, userId: badge.userId, tenantId: terminal.tenant_id, terminalId: terminal.id, badgeId: badge.id, expiresAt: new Date(expiryMs).toISOString() });
        if (registeredResult.isFailure) throw new Error('session_register_failed');
        const registered = registeredResult.getValue();
        const completed = NextResponse.json({ data: { user: { id: badge.userId, email: user.email }, session: { id: registered.id, expiresAt: registered.expiresAt }, terminal: { id: terminal.id, name: terminal.name } } }, { headers: { 'Cache-Control': 'no-store' } });
        response.cookies.getAll().forEach((cookie) => completed.cookies.set(cookie));
        return completed;
    } catch {
        await supabase.auth.signOut({ scope: 'local' });
        return NextResponse.json({ error: 'No pudimos iniciar la sesión. Intenta de nuevo.', code: 'session_issue_failed' }, { status: 503 });
    }
}

/** Returns one generic credential failure to avoid disclosing badge state. */
async function deniedBarcode(terminal?: { id: string; tenant_id: string }): Promise<Response> {
    await recordBarcodeLoginDenial(terminal);
    return NextResponse.json({ error: 'No se pudo validar el carnet.', code: 'barcode_denied' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
}
