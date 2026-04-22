"use client";

import { useCallback, useEffect, useState } from "react";

export interface HistoryPoint {
    date: string;
    buy: number;
    sell: number;
}

export interface UseBcvHistoryResult {
    points: HistoryPoint[];
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; points: HistoryPoint[] }>();

export function useBcvHistory(code: string, days: number = 30): UseBcvHistoryResult {
    const key = `${code}:${days}`;
    const cached = cache.get(key);
    const [points, setPoints] = useState<HistoryPoint[]>(cached?.points ?? []);
    const [loading, setLoading] = useState(!cached);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (force = false) => {
        const existing = cache.get(key);
        if (!force && existing && Date.now() - existing.at < CACHE_TTL_MS) {
            setPoints(existing.points);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/bcv/history?code=${code}&days=${days}`);
            const body = await res.json();
            if (!res.ok) {
                setError(body.error ?? "Error al consultar histórico.");
                setLoading(false);
                return;
            }
            const received = (body.points as HistoryPoint[]) ?? [];
            cache.set(key, { at: Date.now(), points: received });
            setPoints(received);
        } catch {
            setError("No se pudo conectar con el BCV.");
        } finally {
            setLoading(false);
        }
    }, [code, days, key]);

    useEffect(() => {
        void load(false);
    }, [load]);

    return {
        points,
        loading,
        error,
        refresh: () => void load(true),
    };
}
