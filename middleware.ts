import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// ============================================================================
// MIDDLEWARE — route protection
//
// Desacoplado del dominio de autenticación. No importa nada de la app.
// Lee la sesión directamente desde la cookie que Supabase SSR gestiona.
//
// Si mañana cambia el proveedor (Auth0, Clerk, custom JWT…) solo se
// reemplaza este archivo — el resto del dominio no se toca.
//
// Lógica:
//   Sin sesión → redirige a /pages/un-auth
//   Con sesión → redirige a /pages/auth (si intenta entrar a rutas públicas)
// ============================================================================

function getSession(request: NextRequest) {
    // createServerClient solo lee cookies aquí — no hace ninguna llamada de red.
    // Es el único punto donde el middleware conoce a Supabase.
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll:  () => request.cookies.getAll(),
                setAll:  () => {},  // middleware no necesita mutar cookies
            },
        }
    );

    // getUser() valida el JWT de la cookie — sin llamada a la DB
    return supabase.auth.getUser();
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const { data: { user } } = await getSession(request);

    // ── Sin sesión ────────────────────────────────────────────────────────
    if (!user) {
        if (pathname === '/' || pathname.startsWith('/pages/auth')) {
            return NextResponse.redirect(new URL('/pages/un-auth', request.url));
        }
    }

    // ── Con sesión ────────────────────────────────────────────────────────
    if (user) {
        if (pathname === '/' || pathname.startsWith('/pages/un-auth')) {
            return NextResponse.redirect(new URL('/pages/auth', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/',
        '/pages/auth/:path*',
        '/pages/un-auth/:path*',
    ],
};