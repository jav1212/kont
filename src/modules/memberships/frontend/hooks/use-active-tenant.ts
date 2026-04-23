"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { invalidateModuleAccessCache } from "@/src/modules/billing/frontend/hooks/use-module-access";

const STORAGE_KEY = "kont-active-tenant-id";
const TENANT_EVENT = "kont-active-tenant-changed";

export interface TenantEntry {
    tenantId:        string;
    role:            "owner" | "admin" | "contable";
    tenantEmail:     string;
    tenantAvatarUrl: string | null;
    isOwn:           boolean;
}

export interface UseActiveTenantResult {
    allTenants:        TenantEntry[];
    activeTenantId:    string | null;
    activeTenantRole:  "owner" | "admin" | "contable" | null;
    isActingOnBehalf:  boolean;
    loading:           boolean;
    switchTenant:      (tenantId: string) => void;
    clearActiveTenant: () => void;
}

export function useActiveTenant(): UseActiveTenantResult {
    const { user, isAuthenticated } = useAuth();

    const [allTenants, setAllTenants]           = useState<TenantEntry[]>([]);
    const [activeTenantId, setActiveTenantId]   = useState<string | null>(null);
    const [loading, setLoading]                 = useState(true);

    const notifyTenantChange = useCallback(() => {
        if (typeof window !== "undefined") {
            window.dispatchEvent(new Event(TENANT_EVENT));
        }
    }, []);

    // Fetch all accessible tenants
    useEffect(() => {
        if (!isAuthenticated || !user?.id) {
            // Clear stale tenant selection on sign-out so the next user starts fresh
            if (typeof window !== "undefined") {
                localStorage.removeItem(STORAGE_KEY);
            }
            setAllTenants([]);
            setActiveTenantId(null);
            setLoading(false);
            return;
        }

        let cancelled = false;

        async function fetchTenants() {
            setLoading(true);
            try {
                const res  = await fetch("/api/memberships");
                if (!res.ok) return;
                const json = await res.json();
                const list: TenantEntry[] = json.data ?? [];

                if (cancelled) return;

                setAllTenants(list);

                // Resolve active tenant from localStorage.
                // Fallback order: own tenant → first available membership → null.
                // Invited users (no own tenant) act on behalf of the tenant that
                // invited them; they don't have a tenant of their own until they
                // call activate_own_tenant() to upgrade into a paying owner.
                const stored = typeof window !== "undefined"
                    ? localStorage.getItem(STORAGE_KEY)
                    : null;

                const isValid  = stored && list.some((t) => t.tenantId === stored);
                const ownEntry = list.find((t) => t.isOwn);
                const resolved = isValid
                    ? stored
                    : (ownEntry?.tenantId ?? list[0]?.tenantId ?? null);

                if (resolved) {
                    localStorage.setItem(STORAGE_KEY, resolved);
                } else if (typeof window !== "undefined") {
                    localStorage.removeItem(STORAGE_KEY);
                }
                setActiveTenantId(resolved);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchTenants();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated, user?.id]);

    const switchTenant = useCallback((tenantId: string) => {
        setActiveTenantId(tenantId);
        if (typeof window !== "undefined") {
            localStorage.setItem(STORAGE_KEY, tenantId);
        }
        invalidateModuleAccessCache();
        notifyTenantChange();
    }, [notifyTenantChange]);

    const clearActiveTenant = useCallback(() => {
        // Reset to own tenant if the user has one; otherwise first membership.
        const ownEntry = allTenants.find((t) => t.isOwn);
        const fallback = ownEntry?.tenantId ?? allTenants[0]?.tenantId ?? null;

        setActiveTenantId(fallback);
        if (typeof window !== "undefined") {
            if (fallback) localStorage.setItem(STORAGE_KEY, fallback);
            else          localStorage.removeItem(STORAGE_KEY);
        }
        invalidateModuleAccessCache();
        notifyTenantChange();
    }, [notifyTenantChange, allTenants]);

    const activeTenant    = allTenants.find((t) => t.tenantId === activeTenantId) ?? null;
    const isActingOnBehalf = !!activeTenantId && activeTenantId !== user?.id;

    return {
        allTenants,
        activeTenantId,
        activeTenantRole: activeTenant?.role ?? null,
        isActingOnBehalf,
        loading,
        switchTenant,
        clearActiveTenant,
    };
}
