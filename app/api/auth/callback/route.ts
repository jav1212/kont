import { SupabaseSource } from '@/src/shared/backend/source/infra/supabase';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');

    if (code) {
        const source = new SupabaseSource();
        const { error } = await source.instance.auth.exchangeCodeForSession(code);
        
        if (!error) {
            return NextResponse.redirect(`${origin}/dashboard`);
        }
        
        // Si hay error (ej. código expirado), redirigimos a la landing con el mensaje
        return NextResponse.redirect(`${origin}/pages/un-auth?error_description=${encodeURIComponent(error.message)}`);
    }

    return NextResponse.redirect(`${origin}/pages/un-auth?error_description=No+auth+code+found`);
}