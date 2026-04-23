"use client";

// ActiveTenantProvider — bridges URL-based tenant context (?tid=) with the
// useActiveTenant hook. Keeps the URL's tid param in sync with the resolved
// tenant. When the user switches tenant, the URL is updated and cid is cleared
// (since companies are tenant-scoped).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useActiveTenant, UseActiveTenantResult } from "../hooks/use-active-tenant";
import { useUrlContext } from "@/src/shared/frontend/hooks/use-url-context";

export const ActiveTenantContext = createContext<UseActiveTenantResult | null>(null);

export function ActiveTenantProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { urlTenantId, buildReplaceUrl } = useUrlContext();
    const tenant = useActiveTenant(urlTenantId);

    // Keep the URL's tid in sync with the resolved activeTenantId.
    const didMount = useRef(false);
    useEffect(() => {
        if (!didMount.current) { didMount.current = true; return; }
        if (tenant.loading) return;
        if (tenant.activeTenantId === urlTenantId) return;
        // When tid changes, also clear cid — companies belong to the tenant.
        router.replace(buildReplaceUrl({ tid: tenant.activeTenantId, cid: null }));
    }, [tenant.activeTenantId, tenant.loading, urlTenantId, router, buildReplaceUrl]);

    // Wrap switchTenant to also update the URL query param
    const switchTenant = useCallback((tenantId: string) => {
        tenant.switchTenant(tenantId);
        // Clear cid — companies are tenant-scoped, old cid is stale.
        router.replace(buildReplaceUrl({ tid: tenantId, cid: null }));
    }, [tenant, router, buildReplaceUrl]);

    const clearActiveTenant = useCallback(() => {
        tenant.clearActiveTenant();
        router.replace(buildReplaceUrl({ tid: null, cid: null }));
    }, [tenant, router, buildReplaceUrl]);

    const value: UseActiveTenantResult = useMemo(() => ({
        ...tenant,
        switchTenant,
        clearActiveTenant,
    }), [tenant, switchTenant, clearActiveTenant]);

    return (
        <ActiveTenantContext.Provider value={value}>
            {children}
        </ActiveTenantContext.Provider>
    );
}

export function useActiveTenantContext(): UseActiveTenantResult {
    const ctx = useContext(ActiveTenantContext);
    if (!ctx) throw new Error("useActiveTenantContext must be used inside <ActiveTenantProvider>");
    return ctx;
}
