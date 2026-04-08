"use client";

import { useEffect, useState } from "react";

interface Subscription {
    id:     string;
    status: string;
    product: { slug: string } | null;
}

let cache: Subscription[] | null = null;
let cachePromise: Promise<Subscription[]> | null = null;

async function fetchSubscriptions(): Promise<Subscription[]> {
    if (cache) return cache;
    if (!cachePromise) {
        cachePromise = fetch("/api/billing/subscriptions")
            .then((r) => r.json())
            .then((r) => {
                cache = r.data ?? [];
                return cache!;
            })
            .catch(() => {
                cachePromise = null;
                return [] as Subscription[];
            });
    }
    return cachePromise;
}

export function useModuleAccess(slug: string) {
    const [hasAccess, setHasAccess] = useState(false);
    const [status,    setStatus]    = useState<string | null>(null);
    const [loading,   setLoading]   = useState(true);

    useEffect(() => {
        fetchSubscriptions().then((subs) => {
            const sub = subs.find((s) => s.product?.slug === slug);
            if (sub) {
                setStatus(sub.status);
                setHasAccess(sub.status === 'active' || sub.status === 'trial');
            }
            setLoading(false);
        });
    }, [slug]);

    return { hasAccess, status, loading };
}

/** Invalidate the cache (call after admin actions or payment approval). */
export function invalidateModuleAccessCache() {
    cache = null;
    cachePromise = null;
}

// ── Plan name hook ─────────────────────────────────────────────────────────────

let planCache: string | null | undefined = undefined;
let planCachePromise: Promise<string | null> | null = null;

async function fetchPlanName(): Promise<string | null> {
    if (planCache !== undefined) return planCache;
    if (!planCachePromise) {
        planCachePromise = fetch("/api/billing/tenant")
            .then((r) => r.json())
            .then((r) => {
                planCache = r.data?.plan?.name ?? null;
                return planCache!;
            })
            .catch(() => {
                planCachePromise = null;
                return null;
            });
    }
    return planCachePromise;
}

export function usePlanName(): string | null {
    const [planName, setPlanName] = useState<string | null>(null);

    useEffect(() => {
        fetchPlanName().then(setPlanName);
    }, []);

    return planName;
}
