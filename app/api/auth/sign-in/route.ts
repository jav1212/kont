import { AuthenticationFailure } from "@kontave/auth";
import { applySecureWebSessionCookies, secureWebSignIn } from "@/src/modules/auth/backend/security/secure-web-sign-in";
import { rateLimit } from "@/src/shared/backend/utils/rate-limit";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Authenticates a password sign-in and publishes the SSR session only after all
 * active organization security policies have accepted it.
 * @param req - Untrusted credential request.
 * @returns An approved identity, or a display-safe authentication error.
 */
export async function POST(req: Request) {
    const denied = await rateLimit(req, { bucket: "auth-sign-in", limit: 8, windowSec: 60 });
    if (denied) return denied;

    try {
        const { email, password } = await req.json();
        if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || password.length > 1024) {
            return NextResponse.json({ error: "Formato de solicitud inválido." }, { status: 400 });
        }
        const cookieStore = await cookies();
        const result = await secureWebSignIn({ requestCookies: cookieStore.getAll(), email, password });
        const response = NextResponse.json({ data: { user: result.user } }, { headers: { "Cache-Control": "no-store" } });
        applySecureWebSessionCookies(response, result.cookies);
        return response;
    } catch (error) {
        if (error instanceof AuthenticationFailure) {
            const status = error.code === "PROVIDER_UNAVAILABLE" ? 503 : 401;
            return NextResponse.json({ error: error.message }, { status, headers: { "Cache-Control": "no-store" } });
        }
        return NextResponse.json({ error: "Formato de solicitud inválido." }, { status: 400 });
    }
}
