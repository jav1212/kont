import { SupabaseSource } from '@/src/shared/backend/source/infra/supabase';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');

    if (code) {
        const source = new SupabaseSource();
        const { error } = await source.instance.auth.exchangeCodeForSession(code);

        if (!error) {
            return NextResponse.redirect(`${origin}/documents`);
        }

        // Si hay error (ej. código expirado), redirigir a la página de reenvío
        return NextResponse.redirect(`${origin}/resend-confirmation?reason=expired`);
    }

    // Sin code: típicamente el usuario clickeó un link expirado de Supabase; el hash
    // fragment (#error_code=otp_expired) se lee client-side en /resend-confirmation.
    return NextResponse.redirect(`${origin}/resend-confirmation?reason=expired`);
}