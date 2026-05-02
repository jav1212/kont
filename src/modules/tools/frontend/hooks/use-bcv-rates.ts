"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { notify } from "@/src/shared/frontend/notify";

export interface BcvRate {
    code: string;
    country: string;
    buy: number;
    sell: number;
    date: string;  // "YYYY-MM-DD"
    percentageChange: number | null;
}

export interface UseBcvRatesResult {
    rates: BcvRate[];
    date: string | null;
    loading: boolean;
    refresh: () => void;
}

// Stable toast id so retries replace the previous error instead of stacking.
const ERROR_TOAST_ID = "bcv-rates-error";

// Simple in-memory cache across components — keyed by date (or "today").
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const cache = new Map<string, { at: number; payload: { date: string; rates: BcvRate[] } }>();

/**
 * Fetch BCV rates for a given date. Pass null/undefined to mean "today".
 * Returns initialData if provided (SSR-prefetched); hydrates cache on first render.
 */
export function useBcvRates(date?: string | null, initialData?: { date: string; rates: BcvRate[] } | null): UseBcvRatesResult {
    const key = date ?? "today";
    const hydrated = useRef(false);

    // Hydrate cache with SSR data once
    if (!hydrated.current && initialData) {
        cache.set(key, { at: Date.now(), payload: initialData });
        hydrated.current = true;
    }

    const cached = cache.get(key);
    const [state, setState] = useState<{ rates: BcvRate[]; date: string | null }>(() => ({
        rates: cached?.payload.rates ?? initialData?.rates ?? [],
        date: cached?.payload.date ?? initialData?.date ?? null,
    }));
    const [loading, setLoading] = useState<boolean>(!cached && !initialData);

    const load = useCallback(async (force = false) => {
        const existing = cache.get(key);
        if (!force && existing && Date.now() - existing.at < CACHE_TTL_MS) {
            setState(existing.payload);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const url = date ? `/api/bcv/rates?date=${date}` : `/api/bcv/rates`;
            const res = await fetch(url);
            const body = await res.json();
            if (!res.ok) {
                notify.error(body.error ?? "Error al consultar BCV.", { id: ERROR_TOAST_ID });
                setLoading(false);
                return;
            }
            cache.set(key, { at: Date.now(), payload: body });
            setState(body);
        } catch {
            notify.error("No se pudo conectar con el BCV.", { id: ERROR_TOAST_ID });
        } finally {
            setLoading(false);
        }
    }, [date, key]);

    useEffect(() => {
        void load(false);
    }, [load]);

    // Refresh when tab becomes visible again
    useEffect(() => {
        function onVisible() {
            if (document.visibilityState === "visible") {
                const existing = cache.get(key);
                if (!existing || Date.now() - existing.at >= CACHE_TTL_MS) {
                    void load(false);
                }
            }
        }
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [key, load]);

    return {
        rates: state.rates,
        date: state.date,
        loading,
        refresh: () => void load(true),
    };
}
