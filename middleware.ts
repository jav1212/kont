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
//   Sin sesión → redirige a /sign-in (rutas protegidas)
//   Con sesión → redirige a /payroll (si intenta entrar a rutas públicas)
// ============================================================================

function getSession(request: NextRequest) {
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll:  () => request.cookies.getAll(),
                setAll:  () => {},
            },
        }
    );

    return supabase.auth.getUser();
}

const PUBLIC_PATHS  = ['/', '/sign-in', '/sign-up', '/forgot-password'];
const isPublic      = (p: string) => PUBLIC_PATHS.includes(p);
const isProtected   = (p: string) => p.startsWith('/payroll') || p.startsWith('/inventory');

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const { data: { user } } = await getSession(request);

    // ── Sin sesión ────────────────────────────────────────────────────
    if (!user && isProtected(pathname)) {
        return NextResponse.redirect(new URL('/sign-in', request.url));
    }

    // ── Con sesión ────────────────────────────────────────────────────
    if (user && isPublic(pathname)) {
        return NextResponse.redirect(new URL('/payroll', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/',
        '/sign-in',
        '/sign-up',
        '/forgot-password',
        '/payroll/:path*',
        '/inventory/:path*',
    ],
};
