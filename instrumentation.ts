import { logAndGetCode } from "@/src/shared/backend/errors/system-error";

/**
 * Last-resort capture for exceptions that escape an API route or server render.
 * Normal API errors are logged closer to their source; this hook covers the
 * uncaught remainder without changing the response produced by Next.js.
 */
export async function onRequestError(
    error: unknown,
    request: { url?: string; method?: string },
) {
    const route = request.url?.split("?")[0];
    await logAndGetCode(error, {
        source: route?.startsWith("/api/") ? "api" : "unknown",
        route,
        method: request.method,
    });
}
