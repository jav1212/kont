"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ServicesResponse, ServiceWithStatus } from "@/app/api/status/services/route";

export type { ServiceWithStatus } from "@/app/api/status/services/route";

interface CachedPayload {
    at: number;
    payload: ServicesResponse;
}

const CACHE_TTL_MS = 60 * 1000;
let cache: CachedPayload | null = null;

export interface UseStatusServicesResult {
    services: ServiceWithStatus[];
    summary: ServicesResponse["summary"] | null;
    lastServerCheckAt: string | null;
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

export function useStatusServices(initialData?: ServicesResponse | null): UseStatusServicesResult {
    const hydrated = useRef(false);

    if (!hydrated.current && initialData) {
        cache = { at: Date.now(), payload: initialData };
        hydrated.current = true;
    }

    const [payload, setPayload] = useState<ServicesResponse | null>(() => cache?.payload ?? initialData ?? null);
    const [loading, setLoading] = useState<boolean>(!cache && !initialData);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (force = false) => {
        if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
            setPayload(cache.payload);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/status/services", { cache: "no-store" });
            const body = await res.json();
            if (!res.ok) {
                setError(body.error ?? "No se pudo cargar el estatus.");
                setLoading(false);
                return;
            }
            cache = { at: Date.now(), payload: body.data };
            setPayload(body.data);
        } catch {
            setError("No se pudo conectar.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(false); }, [load]);

    useEffect(() => {
        const id = setInterval(() => void load(true), 60_000);
        return () => clearInterval(id);
    }, [load]);

    useEffect(() => {
        function onVisible() {
            if (document.visibilityState === "visible") {
                if (!cache || Date.now() - cache.at >= CACHE_TTL_MS) void load(false);
            }
        }
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [load]);

    return {
        services: payload?.services ?? [],
        summary: payload?.summary ?? null,
        lastServerCheckAt: payload?.lastServerCheckAt ?? null,
        loading,
        error,
        refresh: () => void load(true),
    };
}
