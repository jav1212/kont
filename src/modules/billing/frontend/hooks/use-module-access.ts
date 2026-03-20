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
