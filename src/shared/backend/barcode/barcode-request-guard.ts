import type { SupabaseClient } from "@supabase/supabase-js";
import { validateBarcodeAccessSession } from "@/src/modules/auth/backend/barcode/barcode-access-service";

/** Server-authoritative scope for a provider session created from a carnet. */
export interface BarcodeRequestAccess {
    readonly registered: boolean;
    readonly active: boolean;
    readonly tenantId?: string;
    readonly terminalId?: string;
    readonly expiresAt?: string;
}

/**
 * Resolves a verified provider session against its terminal credential and registry.
 * @param client - Request-scoped Supabase auth client; never a service-role client.
 * @param userId - Identity already verified with the provider for this request.
 * @param terminalCredential - HttpOnly enrollment cookie supplied by this browser.
 * @returns The registered session's current scope, or an ordinary-session marker.
 * @throws Error when identity verification or registry availability fails.
 */
export async function readBarcodeRequestAccess(
    client: SupabaseClient,
    userId: string,
    terminalCredential?: string,
): Promise<BarcodeRequestAccess> {
    const { data, error } = await client.auth.getClaims();
    if (error || data?.claims.sub !== userId) {
        throw new Error("No se pudo verificar la sesión");
    }
    const sessionId = data.claims.session_id;
    if (typeof sessionId !== "string") {
        throw new Error("La sesión no tiene identificador verificable");
    }
    return validateBarcodeAccessSession(userId, sessionId, terminalCredential);
}

/**
 * Checks explicit tenant selectors without trusting a browser's selected workspace.
 * @param access - Validated barcode session scope.
 * @param selectors - Optional tenant IDs obtained from headers or route parameters.
 * @returns Whether every explicit selector belongs to the authorized tenant.
 */
export function barcodeTenantMatches(
    access: BarcodeRequestAccess,
    ...selectors: readonly (string | null | undefined)[]
): boolean {
    return !access.registered || (
        access.active && !!access.tenantId &&
        selectors.every((value) => !value || value === access.tenantId)
    );
}

/**
 * Identifies routes required to recover from a locked or expired browser session.
 * @param pathname - Exact URL pathname, without query parameters.
 * @returns Whether the handler owns its own authentication and cleanup checks.
 */
export function isBarcodeSessionRecoveryPath(pathname: string): boolean {
    return [
        "/api/auth/barcode", "/api/auth/barcode/session", "/api/auth/barcode/lock",
        "/api/auth/sign-out", "/api/auth/sign-in",
    ].includes(pathname);
}
