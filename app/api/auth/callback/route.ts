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

        // Si hay error (ej. código expirado), redirigir al sign-in con mensaje
        return NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent("El enlace de confirmación expiró. Intenta iniciar sesión o regístrate de nuevo.")}`);
    }

    return NextResponse.redirect(`${origin}/pages/un-auth?error_description=No+auth+code+found`);
}