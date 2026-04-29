import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// ============================================================================
// MIDDLEWARE — route protection + role separation + security headers
//
// Reglas:
//   - Usuario con sesión de cliente  → nunca puede ver rutas /admin/*
//   - Usuario con cookie kont-admin  → nunca puede ver rutas de app/públicas
//   - Sin sesión en /admin/*         → /admin/sign-in
//   - Sin sesión en app routes       → /sign-in
//
// Headers de seguridad aplicados a toda respuesta:
//   - Content-Security-Policy: default restrictivo, sobrescrito en el embed
//     de /herramientas/calendario-seniat/embed (allow frame-ancestors *).
//   - X-Frame-Options: DENY (mismo efecto que frame-ancestors 'none',
//     cobertura extra para browsers viejos que no entienden CSP level 2).
// Headers globales sin excepciones viven en vercel.json (HSTS, nosniff,
// Referrer-Policy, Permissions-Policy).
// ============================================================================

// CSP estricto para la app: permite recursos propios + Supabase (auth/realtime/storage)
// + BCV proxy + Unsplash para imágenes marketing. `unsafe-inline` en script/style es
// necesario para Next.js y HeroUI; en el roadmap queda migrar a nonces.
const DEFAULT_CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://va.vercel-scripts.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://vercel.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api-monitor-bcv.vercel.app https://vercel.live",
    "frame-src 'self' https://vercel.live",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
].join("; ");

const PUBLIC_PATHS  = ['/', '/sign-in', '/sign-up', '/forgot-password', '/reset-password'];
const isPublic      = (p: string) => PUBLIC_PATHS.includes(p);
const isAppRoute    = (p: string) =>
    p.startsWith('/payroll') ||
    p.startsWith('/inventory') ||
    p.startsWith('/companies') ||
    p.startsWith('/billing') ||
    p.startsWith('/documents') ||
    p.startsWith('/settings') ||
    p.startsWith('/tools');
const isMarketing   = (p: string) => p.startsWith('/herramientas');
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

    // ── Security headers por-request ──────────────────────────────────────
    // Aplica a todo salvo la ruta de embed que los sobrescribe más abajo.
    response.headers.set("Content-Security-Policy", DEFAULT_CSP);
    response.headers.set("X-Frame-Options", "DENY");

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
                return NextResponse.redirect(new URL('/documents', request.url));
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

    // ── Marketing pages (ruta pública, accesible con o sin login) ────────
    // Ej: /herramientas/divisas. No redirigir usuarios autenticados.
    if (isMarketing(pathname)) {
        // Embed route — permite iframe desde cualquier origen.
        // Sobrescribe el CSP por-request y elimina X-Frame-Options.
        if (pathname.startsWith("/herramientas/calendario-seniat/embed")) {
            response.headers.delete("X-Frame-Options");
            response.headers.set("Content-Security-Policy", "frame-ancestors *;");
        }
        return response;
    }

    // ── Protección de rutas de app regular ───────────────────────────────
    if (!user && isAppRoute(pathname)) {
        return NextResponse.redirect(new URL('/sign-in', request.url));
    }

    // /forgot-password mantiene sesión durante el flujo OTP (verifyOtp({ type:
    // 'recovery' }) crea una sesión efímera entre la etapa 2 y la 3). No la
    // expulsamos al panel hasta que el usuario complete o cancele el cambio
    // de contraseña. /reset-password ya hereda la misma excepción para los
    // correos antiguos con magic-link.
    if (user && isPublic(pathname) && pathname !== '/reset-password' && pathname !== '/forgot-password') {
        return NextResponse.redirect(new URL('/payroll', request.url));
    }

    // ── Verificación del tenant ───────────────────────────────────────────
    if (user && isAppRoute(pathname)) {
        const { data: tenant } = await supabase
            .from('tenants')
            .select('status')
            .eq('id', user.id)
            .single();

        if (!tenant) {
            // Sin tenant propio: aceptar si el usuario es miembro invitado
            // (admin/contable) de algún tenant con membresía aceptada y vigente.
            const { data: memberships } = await supabase
                .from('tenant_memberships')
                .select('tenant_id')
                .eq('member_id', user.id)
                .not('accepted_at', 'is', null)
                .is('revoked_at', null)
                .limit(1);

            if (!memberships || memberships.length === 0) {
                // Sesión realmente huérfana → cerrar sesión
                await supabase.auth.signOut();
                return NextResponse.redirect(new URL('/sign-in', request.url));
            }
            // Miembro invitado: ActiveTenantProvider seleccionará el tenant activo.
            return response;
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
        '/documents/:path*',
        '/settings/:path*',
        '/tools/:path*',
        '/herramientas/:path*',
        '/admin',
        '/admin/:path*',
    ],
};
