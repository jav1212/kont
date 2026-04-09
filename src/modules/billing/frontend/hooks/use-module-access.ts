"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";

interface Subscription {
    id:     string;
    status: string;
    product: { slug: string } | null;
}

const STORAGE_KEY = "kont-active-tenant-id";
const TENANT_EVENT = "kont-active-tenant-changed";
const SELF_KEY = "__self__";

const subscriptionCache = new Map<string, Subscription[]>();
const subscriptionPromiseCache = new Map<string, Promise<Subscription[]>>();
const planCache = new Map<string, string | null>();
const planPromiseCache = new Map<string, Promise<string | null>>();

function getActiveTenantCacheKey(): string {
    if (typeof window === "undefined") return SELF_KEY;
    return localStorage.getItem(STORAGE_KEY) ?? SELF_KEY;
}

async function fetchSubscriptions(tenantKey: string): Promise<Subscription[]> {
    const cached = subscriptionCache.get(tenantKey);
    if (cached) return cached;

    const pending = subscriptionPromiseCache.get(tenantKey);
    if (pending) return pending;

    const promise = apiFetch("/api/billing/subscriptions")
            .then((r) => r.json())
            .then((r) => {
                const data = (r.data ?? []) as Subscription[];
                subscriptionCache.set(tenantKey, data);
                subscriptionPromiseCache.delete(tenantKey);
                return data;
            })
            .catch(() => {
                subscriptionPromiseCache.delete(tenantKey);
                return [] as Subscription[];
            });

    subscriptionPromiseCache.set(tenantKey, promise);
    return promise;
}

export function useModuleAccess(slug: string) {
    const [hasAccess, setHasAccess] = useState(false);
    const [status,    setStatus]    = useState<string | null>(null);
    const [loading,   setLoading]   = useState(true);
    const [tenantKey, setTenantKey] = useState<string>(SELF_KEY);

    useEffect(() => {
        const syncTenant = () => {
            setLoading(true);
            setTenantKey(getActiveTenantCacheKey());
        };
        syncTenant();
        window.addEventListener(TENANT_EVENT, syncTenant);
        return () => window.removeEventListener(TENANT_EVENT, syncTenant);
    }, []);

    useEffect(() => {
        fetchSubscriptions(tenantKey).then((subs) => {
            const sub = subs.find((s) => s.product?.slug === slug);
            if (sub) {
                setStatus(sub.status);
                setHasAccess(sub.status === 'active' || sub.status === 'trial');
            } else {
                setStatus(null);
                setHasAccess(false);
            }
            setLoading(false);
        });
    }, [slug, tenantKey]);

    return { hasAccess, status, loading };
}

/** Invalidate the cache (call after admin actions or payment approval). */
export function invalidateModuleAccessCache() {
    subscriptionCache.clear();
    subscriptionPromiseCache.clear();
    planCache.clear();
    planPromiseCache.clear();
}

// ── Plan name hook ─────────────────────────────────────────────────────────────

async function fetchPlanName(tenantKey: string): Promise<string | null> {
    if (planCache.has(tenantKey)) return planCache.get(tenantKey) ?? null;

    const pending = planPromiseCache.get(tenantKey);
    if (pending) return pending;

    const promise = apiFetch("/api/billing/tenant")
            .then((r) => r.json())
            .then((r) => {
                const value = (r.data?.plan?.name ?? null) as string | null;
                planCache.set(tenantKey, value);
                planPromiseCache.delete(tenantKey);
                return value;
            })
            .catch(() => {
                planPromiseCache.delete(tenantKey);
                return null;
            });

    planPromiseCache.set(tenantKey, promise);
    return promise;
}

export function usePlanName(): string | null {
    const [planName, setPlanName] = useState<string | null>(null);
    const [tenantKey, setTenantKey] = useState<string>(SELF_KEY);

    useEffect(() => {
        const syncTenant = () => {
            setPlanName(null);
            setTenantKey(getActiveTenantCacheKey());
        };
        syncTenant();
        window.addEventListener(TENANT_EVENT, syncTenant);
        return () => window.removeEventListener(TENANT_EVENT, syncTenant);
    }, []);

    useEffect(() => {
        fetchPlanName(tenantKey).then(setPlanName);
    }, [tenantKey]);

    return planName;
}
