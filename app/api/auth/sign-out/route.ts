import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { lockBarcodeSession, sessionIdFromAccessToken, validateBarcodeAccessSession } from '@/src/modules/auth/backend/barcode/barcode-access-service';

/**
 * Ends the current login and invalidates its terminal registry when applicable.
 * @param request - Same-origin sign-out action.
 * @returns Confirmation after the provider cookies have been cleared.
 */
export async function POST(request: Request) {
    if (request.headers.get('origin') !== new URL(request.url).origin) {
        return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
    }
    const cookieStore = await cookies();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => cookieStore.getAll(),
                setAll: (cookiesToSet) => {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        cookieStore.set(name, value, options);
                    });
                },
            },
        }
    );

    const { data: { user } } = await supabase.auth.getUser();
    const { data: { session } } = await supabase.auth.getSession();
    const sessionId = session ? sessionIdFromAccessToken(session.access_token) : null;
    const barcode = user && sessionId ? await validateBarcodeAccessSession(user.id, sessionId) : null;
    if (barcode?.registered && user && sessionId) await lockBarcodeSession(sessionId, user.id, barcode.id);
    await supabase.auth.signOut({ scope: barcode?.registered ? 'local' : 'global' });
    return NextResponse.json({ ok: true });
}
