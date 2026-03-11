// src/middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { getAuthActions } from '@/src/backend/auth/infra/auth-factory';

export async function middleware(request: NextRequest) {
    const { me } = getAuthActions();
    
    // Ejecutamos el caso de uso que verifica el usuario actual
    // Esto internamente usa Supabase ahora, pero para el Middleware es transparente
    const result = await me.execute();
    const user = result.isSuccess ? result.getValue() : null;

    const { pathname } = request.nextUrl;

    // 1. Si el usuario está logueado y trata de ir a la raíz, lo mandamos a la app (/auth)
    if (user && pathname === '/') {
        return NextResponse.redirect(new URL('/auth', request.url));
    }

    // 2. Si el usuario NO está logueado y trata de entrar a rutas protegidas (/auth/...)
    // lo mandamos a la zona pública (/un-auth)
    if (!user && pathname.startsWith('/auth')) {
        return NextResponse.redirect(new URL('/un-auth', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Coincide con todas las rutas excepto:
         * - api (rutas de API)
         * - _next/static (archivos estáticos)
         * - _next/image (optimización de imágenes)
         * - favicon.ico (icono del sitio)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};