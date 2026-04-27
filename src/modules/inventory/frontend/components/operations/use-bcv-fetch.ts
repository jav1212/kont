"use client";

// Auto-fetch the BCV exchange rate whenever the operation date changes.
// Centralizes the duplicated effect from adjustments/returns/self-consumption pages.

import { useEffect, useState, startTransition } from "react";
import { useBcvRate } from "@/src/modules/inventory/frontend/components/bcv-rate-input";

export function useBcvAutoFetch(date: string) {
    const bcv = useBcvRate();
    const [bcvDate, setBcvDate] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!date) return;
        let cancelled = false;
        startTransition(() => {
            setLoading(true);
            setError(null);
            setBcvDate(null);
        });
        fetch(`/api/bcv/rate?date=${date}&code=USD`)
            .then((r) => r.json())
            .then((json) => {
                if (cancelled) return;
                if (json.rate) {
                    bcv.setRateFromApi(json.rate, bcv.decimals);
                    setBcvDate(json.date);
                    setError(null);
                } else {
                    setError(json.error ?? "Sin datos BCV para esta fecha");
                }
            })
            .catch(() => { if (!cancelled) setError("Error al consultar BCV"); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date]);

    return {
        ...bcv,
        bcvDate,
        loading,
        error,
        setBcvDate,
    };
}
