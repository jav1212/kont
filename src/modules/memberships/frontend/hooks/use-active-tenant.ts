"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";

const STORAGE_KEY = "kont-active-tenant-id";

export interface TenantEntry {
    tenantId:    string;
    role:        "owner" | "admin" | "contable";
    tenantEmail: string;
    isOwn:       boolean;
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

                // Resolve active tenant from localStorage, fallback to own
                const stored = typeof window !== "undefined"
                    ? localStorage.getItem(STORAGE_KEY)
                    : null;

                const isValid = stored && list.some((t) => t.tenantId === stored);
                const resolved = isValid ? stored : (user!.id ?? null);

                if (resolved) {
                    localStorage.setItem(STORAGE_KEY, resolved);
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
    }, []);

    const clearActiveTenant = useCallback(() => {
        setActiveTenantId(user?.id ?? null);
        if (typeof window !== "undefined") {
            if (user?.id) localStorage.setItem(STORAGE_KEY, user.id);
            else localStorage.removeItem(STORAGE_KEY);
        }
    }, [user?.id]);

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
