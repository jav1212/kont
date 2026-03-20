import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// ============================================================================
// MIDDLEWARE — route protection + role separation
//
// Reglas:
//   - Usuario con sesión de cliente  → nunca puede ver rutas /admin/*
//   - Usuario con cookie kont-admin  → nunca puede ver rutas de app/públicas
//   - Sin sesión en /admin/*         → /admin/sign-in
//   - Sin sesión en app routes       → /sign-in
// ============================================================================

const PUBLIC_PATHS  = ['/', '/sign-in', '/sign-up', '/forgot-password', '/reset-password'];
const isPublic      = (p: string) => PUBLIC_PATHS.includes(p);
const isAppRoute    = (p: string) =>
    p.startsWith('/payroll') ||
    p.startsWith('/inventory') ||
    p.startsWith('/companies') ||
    p.startsWith('/billing');
const isAdminRoute  = (p: string) => p.startsWith('/admin');
const isAdminPublic = (p: string) =>
    p === '/admin/sign-in' ||
    p === '/admin/forgot-password' ||
    p === '/admin/reset-password';

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const isAdminSession = request.cookies.get('kont-admin')?.value === '1';

    // Crear respuesta que puede propagar cookies (necesario para signOut)
    const response = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => request.cookies.getAll(),
                setAll: (list) =>
                    list.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    ),
            },
        }
    );

    const { data: { user } } = await supabase.auth.getUser();

    // ── Rutas de administración ───────────────────────────────────────────
    if (isAdminRoute(pathname)) {
        if (isAdminPublic(pathname)) {
            // Admin ya autenticado con cookie → panel
            if (isAdminSession) {
                return NextResponse.redirect(new URL('/admin', request.url));
            }
            // Cliente con sesión activa intentando ver páginas públicas de admin → app
            // Excepto reset-password: necesita la sesión de Supabase para cambiar contraseña
            if (user && pathname !== '/admin/reset-password') {
                return NextResponse.redirect(new URL('/payroll', request.url));
            }
            return response;
        }

        // Resto de /admin/* requiere cookie de admin
        if (!isAdminSession) {
            // Si tiene sesión de cliente, redirigir a la app en vez de al sign-in de admin
            return user
                ? NextResponse.redirect(new URL('/payroll', request.url))
                : NextResponse.redirect(new URL('/admin/sign-in', request.url));
        }

        return response;
    }

    // ── Admin no puede usar la app regular ni las páginas públicas ────────
    if (isAdminSession) {
        return NextResponse.redirect(new URL('/admin', request.url));
    }

    // ── Protección de rutas de app regular ───────────────────────────────
    if (!user && isAppRoute(pathname)) {
        return NextResponse.redirect(new URL('/sign-in', request.url));
    }

    if (user && isPublic(pathname) && pathname !== '/reset-password') {
        return NextResponse.redirect(new URL('/payroll', request.url));
    }

    // ── Verificación del tenant ───────────────────────────────────────────
    if (user && isAppRoute(pathname)) {
        const { data: tenant } = await supabase
            .from('tenants')
            .select('status')
            .eq('id', user.id)
            .single();

        // Sesión huérfana (tenant eliminado) → cerrar sesión
        if (!tenant) {
            await supabase.auth.signOut();
            return NextResponse.redirect(new URL('/sign-in', request.url));
        }

        if (tenant.status === 'suspended' && !pathname.startsWith('/billing')) {
            return NextResponse.redirect(new URL('/billing', request.url));
        }
    }

    return response;
}

export const config = {
    matcher: [
        '/',
        '/sign-in',
        '/sign-up',
        '/forgot-password',
        '/reset-password',
        '/payroll/:path*',
        '/inventory/:path*',
        '/companies/:path*',
        '/billing/:path*',
        '/admin',
        '/admin/:path*',
    ],
};
