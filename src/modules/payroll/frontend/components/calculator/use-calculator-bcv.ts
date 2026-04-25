"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";

// Calculator-flavour BCV state.
// Different from `useBcvRate` (in shared/bcv-pill) which fetches once and
// is read-only. The calculators expose an editable rate, a manual refresh
// button, and surface fetch errors inline.

export interface CalculatorBcv {
    /** rate as a string for controlled <input> binding */
    exchangeRate:  string;
    setExchangeRate(v: string): void;
    /** parsed numeric rate (0 if unparseable) */
    bcvRate:       number;
    /** true while a fetch is in flight */
    bcvLoading:    boolean;
    /** last fetch error message, or null */
    bcvFetchError: string | null;
    /** fire a fresh fetch from /api/bcv/rate?date=today */
    fetchBcvRate(): Promise<void>;
}

interface Options {
    /** initial rate string when no fetch has happened yet (defaults to "79.59") */
    initial?:    string;
    /** auto-fetch on mount (default true) */
    autoFetch?:  boolean;
}

export function useCalculatorBcv(opts: Options = {}): CalculatorBcv {
    const { initial = "79.59", autoFetch = true } = opts;

    const [exchangeRate,   setExchangeRate]  = useState(initial);
    const [bcvLoading,     setBcvLoading]    = useState(false);
    const [bcvFetchError,  setBcvFetchError] = useState<string | null>(null);

    const fetchBcvRate = useCallback(async () => {
        setBcvLoading(true);
        setBcvFetchError(null);
        try {
            const iso = getTodayIsoDate();
            const res  = await fetch(`/api/bcv/rate?date=${iso}`);
            const data = await res.json();
            if (!res.ok) {
                setBcvFetchError(data.error ?? "No rate found");
                return;
            }
            const next = data.price ?? data.rate;
            if (next != null) setExchangeRate(String(next));
            else setBcvFetchError("Sin tasa");
        } catch {
            setBcvFetchError("No se pudo conectar.");
        } finally {
            setBcvLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!autoFetch) return;
        void fetchBcvRate();
    }, [autoFetch, fetchBcvRate]);

    const bcvRate = useMemo(() => parseFloat(exchangeRate) || 0, [exchangeRate]);

    return { exchangeRate, setExchangeRate, bcvRate, bcvLoading, bcvFetchError, fetchBcvRate };
}
