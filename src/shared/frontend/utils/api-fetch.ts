import { notify } from '@/src/shared/frontend/notify';
import { ApiRequestFailure } from '@/src/shared/frontend/feedback/api-request-failure';

const ACTIVE_TENANT_KEY = 'kont-active-tenant-id';

/**
 * Minimal typed shape for standard API JSON responses.
 * Avoids `any` in hooks that parse fetch responses.
 */
export interface ApiJsonResult {
    data?:  unknown;
    error?: string;
    errorCode?: string;
}

/**
 * Fetch JSON from a tenant-aware API route.
 * Wraps apiFetch and handles JSON parsing safely.
 * Returns { ok, json } — the same destructuring pattern used across remote data hooks —
 * plus the raw `response` so callers can build an ApiRequestFailure.
 */
export async function fetchJson(
    path: string,
    options?: RequestInit,
): Promise<{ ok: boolean; json: ApiJsonResult; response: Response }> {
    const res  = await apiFetch(path, options);
    const text = await res.text();
    let json: ApiJsonResult;
    try   { json = JSON.parse(text) as ApiJsonResult; }
    catch { json = { error: `Error del servidor (${res.status})`, errorCode: undefined }; }
    return { ok: res.ok, json, response: res };
}

/**
 * Tenant-aware fetch wrapper. Injects X-Tenant-Id header from localStorage.
 */
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
    let activeTenantId: string | null = null;
    if (typeof window !== 'undefined') {
        activeTenantId = localStorage.getItem(ACTIVE_TENANT_KEY);
    }

    const headers = new Headers(options?.headers);

    if (activeTenantId) {
        headers.set('X-Tenant-Id', activeTenantId);
    }

    return fetch(url, { ...options, headers });
}

/**
 * Helper para hooks: hace fetchJson y presenta el fallo con `notify.failure`
 * (rechazos 4xx como esperados, 5xx con su código de incidente, fallos de red
 * como sin conexión). Devuelve el `data` del shape estándar `{ data, error }`,
 * o `null` si hubo error (en cuyo caso ya se mostró el toast).
 *
 * Uso:
 *   const items = await callApi<Producto[]>(`/api/inventory/products?…`);
 *   if (!items) return; // error ya visible para el usuario
 */
export async function callApi<T>(
    path: string,
    options?: RequestInit & { fallbackError?: string },
): Promise<T | null> {
    const fallback = options?.fallbackError ?? 'Ocurrió un error inesperado.';
    try {
        const { ok, json, response } = await fetchJson(path, options);
        if (!ok) {
            notify.failure(new ApiRequestFailure(response, json.error ?? fallback, json), fallback, { eventName: 'web.api.request_failed', attributes: { path: path.split('?')[0] } });
            return null;
        }
        return (json.data ?? null) as T | null;
    } catch (error) {
        notify.failure(error, fallback, { eventName: 'web.api.request_failed', attributes: { path: path.split('?')[0] } });
        return null;
    }
}
