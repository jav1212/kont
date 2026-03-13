import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// ============================================================================
// MIDDLEWARE — route protection + tenant status check
//
// Desacoplado del dominio de autenticación. No importa nada de la app.
// Lee la sesión directamente desde la cookie que Supabase SSR gestiona.
//
// Lógica:
//   Sin sesión        → redirige a /sign-in (rutas protegidas)
//   Con sesión        → redirige a /payroll (si intenta entrar a rutas públicas)
//   Tenant suspended  → redirige a /billing (excepto si ya está en /billing o /api)
// ============================================================================

function getSupabase(request: NextRequest) {
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => request.cookies.getAll(),
                setAll: () => {},
            },
        }
    );
}

const PUBLIC_PATHS = ['/', '/sign-in', '/sign-up', '/forgot-password'];
const isPublic     = (p: string) => PUBLIC_PATHS.includes(p);
const isProtected  = (p: string) =>
    p.startsWith('/payroll')  ||
    p.startsWith('/companies') ||
    p.startsWith('/billing');

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const supabase = getSupabase(request);

    const { data: { user } } = await supabase.auth.getUser();

    // ── Sin sesión ────────────────────────────────────────────────────────
    if (!user && isProtected(pathname)) {
        return NextResponse.redirect(new URL('/sign-in', request.url));
    }

    // ── Con sesión en ruta pública ────────────────────────────────────────
    if (user && isPublic(pathname)) {
        return NextResponse.redirect(new URL('/payroll', request.url));
    }

    // ── Verificación de estado del tenant ─────────────────────────────────
    // Solo aplicar en rutas protegidas que no sean /billing (evitar bucle)
    if (user && isProtected(pathname) && !pathname.startsWith('/billing')) {
        const { data: tenant } = await supabase
            .from('tenants')
            .select('status')
            .eq('id', user.id)
            .single();

        if (tenant?.status === 'suspended') {
            return NextResponse.redirect(new URL('/billing', request.url));
        }
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
        '/companies/:path*',
        '/billing/:path*',
    ],
};
