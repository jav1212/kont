const ACTIVE_TENANT_KEY = 'kont-active-tenant-id';

/**
 * Wrapper de fetch que inyecta automáticamente el header X-Tenant-Id
 * cuando hay un tenant activo guardado en localStorage.
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
