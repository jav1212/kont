import { SupabaseSource } from '@/src/shared/backend/source/infra/supabase';
import { NextResponse } from 'next/server';
import { DEFAULT_POST_AUTHENTICATION_DESTINATION } from '@/src/modules/auth/post-authentication-destination';

/**
 * Exchanges an email authentication code and redirects to the authenticated landing.
 * @param request - Callback URL containing the one-time authentication code.
 * @returns A redirect to the application or the expired-link recovery page.
 * @throws Error when authentication infrastructure cannot be initialized.
 */
export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');

    if (code) {
        const source = new SupabaseSource();
        const { error } = await source.instance.auth.exchangeCodeForSession(code);

        if (!error) {
            return NextResponse.redirect(`${origin}${DEFAULT_POST_AUTHENTICATION_DESTINATION}`);
        }

        // Si hay error (ej. código expirado), redirigir a la página de reenvío
        return NextResponse.redirect(`${origin}/resend-confirmation?reason=expired`);
    }

    // Sin code: típicamente el usuario clickeó un link expirado de Supabase; el hash
    // fragment (#error_code=otp_expired) se lee client-side en /resend-confirmation.
    return NextResponse.redirect(`${origin}/resend-confirmation?reason=expired`);
}
