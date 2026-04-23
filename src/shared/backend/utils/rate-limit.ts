// =============================================================================
// rate-limit.ts — helper de rate limiting con Upstash Redis
//
// Cómo usar en una API route:
//
//   import { rateLimit, keyFromRequest } from "@/src/shared/backend/utils/rate-limit";
//
//   export async function POST(req: Request) {
//       const denied = await rateLimit(req, { bucket: "admin-sign-in", limit: 5, windowSec: 60 });
//       if (denied) return denied;
//       // ... handler normal
//   }
//
// Variables de entorno requeridas en Vercel (Production + Preview):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//
// Si no están definidas (ej. dev local sin Upstash), el helper se convierte en
// no-op — deja pasar todas las peticiones y loggea un warning una sola vez.
// Esto garantiza que el dev loop no se rompa; en producción el deploy debe
// fallar el smoke test si las vars faltan.
// =============================================================================

import { Ratelimit } from "@upstash/ratelimit";
import { Redis }     from "@upstash/redis";

let redis: Redis | null = null;
let warned = false;

function getRedis(): Redis | null {
    if (redis) return redis;

    const url   = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        if (!warned) {
            console.warn("[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN no configurados — rate limiting deshabilitado.");
            warned = true;
        }
        return null;
    }

    redis = new Redis({ url, token });
    return redis;
}

// Cache de limiters por (bucket + ventana) para no re-instanciar en cada request.
const limiterCache = new Map<string, Ratelimit>();

function getLimiter(bucket: string, limit: number, windowSec: number): Ratelimit | null {
    const r = getRedis();
    if (!r) return null;

    const key = `${bucket}:${limit}:${windowSec}`;
    const cached = limiterCache.get(key);
    if (cached) return cached;

    const limiter = new Ratelimit({
        redis:     r,
        limiter:   Ratelimit.slidingWindow(limit, `${windowSec} s`),
        analytics: false,
        prefix:    "kont:rl",
    });
    limiterCache.set(key, limiter);
    return limiter;
}

/**
 * Deriva una clave única por cliente. Prioriza x-forwarded-for (Vercel la setea);
 * cae a x-real-ip. Si ambas faltan, usa "anonymous" — comportamiento seguro
 * porque todos los clientes anónimos compartirán la misma cuota.
 */
export function keyFromRequest(req: Request, extra?: string): string {
    const xff = req.headers.get("x-forwarded-for");
    const ip  = xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "anonymous";
    return extra ? `${ip}:${extra}` : ip;
}

export type RateLimitOptions = {
    /** Nombre lógico del bucket (ej. "admin-sign-in"). Se usa en el prefix de Redis. */
    bucket:     string;
    /** Cantidad de requests permitidos en la ventana. */
    limit:      number;
    /** Ventana en segundos (sliding window). */
    windowSec:  number;
    /** Complemento opcional a la key (ej. userId para cuota por usuario). */
    keyExtra?:  string;
};

/**
 * Aplica rate limiting. Devuelve:
 *   - null  → deja pasar
 *   - Response 429 con headers Retry-After / X-RateLimit-*  → cortar
 *
 * En producción sin Upstash configurado deja pasar todo (fail-open).
 */
export async function rateLimit(
    req: Request,
    opts: RateLimitOptions
): Promise<Response | null> {
    const limiter = getLimiter(opts.bucket, opts.limit, opts.windowSec);
    if (!limiter) return null;

    const key = keyFromRequest(req, opts.keyExtra);
    const identifier = `${opts.bucket}:${key}`;

    try {
        const { success, reset, remaining, limit } = await limiter.limit(identifier);

        if (success) return null;

        const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
        return Response.json(
            { error: "Demasiados intentos. Intenta de nuevo en unos segundos." },
            {
                status: 429,
                headers: {
                    "Retry-After":           String(retryAfterSec),
                    "X-RateLimit-Limit":     String(limit),
                    "X-RateLimit-Remaining": String(remaining),
                    "X-RateLimit-Reset":     String(Math.ceil(reset / 1000)),
                },
            }
        );
    } catch (err) {
        // Si Redis está caído, preferimos fail-open antes que tumbar el login.
        console.error("[rate-limit] error al consultar Upstash:", (err as Error).message);
        return null;
    }
}
