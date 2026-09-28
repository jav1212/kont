import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { barcodeRateLimit, hasSameOrigin, isBarcodeAccessProtectionReady, recordBarcodeLoginDenial, sessionIdFromAccessToken, validateBarcodeAccessSession } from '@/src/modules/auth/backend/barcode/barcode-access-service';
import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';
import { getBarcodeAccessActions } from '@/src/modules/auth/backend/barcode/barcode-access-factory';
import { requireTenant } from '@/src/shared/backend/utils/require-tenant';
import { mayExchangeBadgeInWorkspace } from '@/src/modules/auth/backend/barcode/application/barcode-workspace-policy';

/**
 * Exchanges a scanned badge for a Supabase browser session without browser enrollment.
 *
 * @param request Same-origin request containing the unpersisted scanner credential.
 * @returns A new session only when a preceding workspace belongs to the badge organization.
 */
export async function POST(request: Request): Promise<Response> {
    if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origen de solicitud no válido.', code: 'csrf_denied' }, { status: 403 });
    const denied = await barcodeRateLimit(request, { bucket: 'barcode-login', limit: 12, windowSec: 60 });
    if (denied) return denied;
    let body: { barcode?: unknown };
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Formato de solicitud inválido.', code: 'invalid_request' }, { status: 400 }); }
    if (typeof body.barcode !== 'string' || body.barcode.length > 256) return deniedBarcode();
    if (!(await isBarcodeAccessProtectionReady())) return NextResponse.json({ error: 'No se pudo verificar el acceso. Intenta nuevamente.', code: 'barcode_access_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const cookieStore = await cookies();
    const badgeResult = await getBarcodeAccessActions().findLoginBadge.execute({ barcode: body.barcode.trim() });
    if (badgeResult.isFailure) return deniedBarcode();
    const badge = badgeResult.getValue();
    if (!badge) return deniedBarcode();
    const badgeDenied = await barcodeRateLimit(request, { bucket: 'barcode-login-badge', limit: 20, windowSec: 60, keyExtra: badge.id });
    if (badgeDenied) return badgeDenied;
    const activeTenantId = await resolveActiveWorkspaceTenant(request, cookieStore.getAll());
    if (!mayExchangeBadgeInWorkspace(badge.tenantId, activeTenantId)) return deniedBarcode();

    const source = new ServerSupabaseSource().instance;
    const [{ data: platformAdmin, error: adminError }, { data: userData, error: userError }] = await Promise.all([
        source.from('admin_users').select('id').eq('id', badge.userId).maybeSingle(),
        source.auth.admin.getUserById(badge.userId),
    ]);
    const user = userData.user;
    if (adminError || platformAdmin || userError || !user?.email || !user.email_confirmed_at || (user.banned_until && Date.parse(user.banned_until) > Date.now()) || user.deleted_at || user.factors?.some((factor) => factor.status === 'verified')) return deniedBarcode();
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
        const registeredResult = await getBarcodeAccessActions().registerSession.execute({ supabaseSessionId: sessionId, userId: badge.userId, tenantId: badge.tenantId, badgeId: badge.id, expiresAt: new Date(expiryMs).toISOString() });
        if (registeredResult.isFailure) throw new Error('session_register_failed');
        const registered = registeredResult.getValue();
        const completed = NextResponse.json({ data: { user: { id: badge.userId, email: user.email }, session: { id: registered.id, expiresAt: registered.expiresAt } } }, { headers: { 'Cache-Control': 'no-store' } });
        response.cookies.getAll().forEach((cookie) => completed.cookies.set(cookie));
        return completed;
    } catch {
        await supabase.auth.signOut({ scope: 'local' });
        return NextResponse.json({ error: 'No pudimos iniciar la sesión. Intenta de nuevo.', code: 'session_issue_failed' }, { status: 503 });
    }
}

/**
 * Resolves the current workspace only when the browser already presents a
 * Supabase authentication cookie. An anonymous scanner may perform its first
 * login, while a stale or unauthorized session is denied before its cookies
 * can be replaced.
 *
 * @param request Incoming cookie-authenticated request, including the selected tenant header.
 * @param requestCookies Cookies already read by the route, never written by this check.
 * @returns The validated tenant, null for an anonymous browser, or undefined when authorization fails.
 */
async function resolveActiveWorkspaceTenant(
    request: Request,
    requestCookies: readonly { name: string; value: string }[],
): Promise<string | null | undefined> {
    if (!requestCookies.some((cookie) => isSupabaseAuthCookie(cookie.name))) return null;
    try {
        return (await requireTenant(request)).tenantId;
    } catch {
        // A barcode registry row can remain after its operator locks the UI or
        // becomes idle. The existing JWT must still be verified before that
        // row supplies the only permitted organization for a re-entry scan.
        const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
            cookies: { getAll: () => [...requestCookies], setAll: () => {} },
        });
        const [{ data: userData, error: userError }, { data: claimsData, error: claimsError }] = await Promise.all([
            supabase.auth.getUser(),
            supabase.auth.getClaims(),
        ]);
        const user = userData.user;
        const sessionId = typeof claimsData?.claims.session_id === 'string' ? claimsData.claims.session_id : null;
        if (userError || claimsError || !user || claimsData?.claims.sub !== user.id || !sessionId) return undefined;
        try {
            const scope = await validateBarcodeAccessSession(user.id, sessionId);
            const requestedTenantId = request.headers.get('X-Tenant-Id');
            return scope.registered && scope.tenantId && (!requestedTenantId || requestedTenantId === scope.tenantId)
                ? scope.tenantId
                : undefined;
        } catch {
            return undefined;
        }
    }
}

/**
 * Identifies Supabase SSR access-token cookies without treating unrelated
 * browser state, such as a legacy terminal cookie, as an authenticated user.
 *
 * @param name Cookie name supplied by the request.
 * @returns Whether the cookie may carry a Supabase authentication session.
 */
function isSupabaseAuthCookie(name: string): boolean {
    return /^sb-[a-z0-9_-]+-auth-token(?:\.\d+)?$/i.test(name);
}

/** Returns one generic credential failure to avoid disclosing badge state. */
async function deniedBarcode(terminal?: { id: string; tenant_id: string }): Promise<Response> {
    await recordBarcodeLoginDenial(terminal);
    return NextResponse.json({ error: 'No se pudo validar el carnet.', code: 'barcode_denied' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
}
