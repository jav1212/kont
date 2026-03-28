const ACTIVE_TENANT_KEY = 'kont-active-tenant-id';

/**
 * Minimal typed shape for standard API JSON responses.
 * Avoids `any` in hooks that parse fetch responses.
 */
export interface ApiJsonResult {
    data?:  unknown;
    error?: string;
}

/**
 * Fetch JSON from a tenant-aware API route.
 * Wraps apiFetch and handles JSON parsing safely.
 * Returns { ok, json } — the same destructuring pattern used across remote data hooks.
 */
export async function fetchJson(
    path: string,
    options?: RequestInit,
): Promise<{ ok: boolean; json: ApiJsonResult }> {
    const res  = await apiFetch(path, options);
    const text = await res.text();
    let json: ApiJsonResult;
    try   { json = JSON.parse(text) as ApiJsonResult; }
    catch { json = { error: `Error del servidor (${res.status})` }; }
    return { ok: res.ok, json };
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
