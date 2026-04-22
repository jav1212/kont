"use client";

// Silencioso: al montar, hace checks client-side con fetch no-cors hacia los
// portales y reporta el resultado a /api/status/report. Útil para recolectar
// datos desde IPs venezolanas reales ya que los portales bloquean IPs externas.
//
// Limitaciones (documentadas):
//   - no-cors no permite leer status/body → sólo distinguimos "hubo red" vs "no hubo red".
//   - Un 404/500 aparece como "operational" porque el TCP handshake respondió.
//   - Rate-limit local via localStorage para no spammear el backend.

import { useEffect, useRef } from "react";
import type { ServiceWithStatus } from "../hooks/use-status-services";

const LS_PREFIX = "konta:status:reported:";
const LS_TTL_MS = 2 * 60 * 1000;
const INTER_CHECK_DELAY_MS = 600;
const DEFAULT_DEGRADED_MS = 3000;
const DEFAULT_TIMEOUT_MS = 10_000;

interface Props {
    services: ServiceWithStatus[];
}

export function ClientVerifier({ services }: Props) {
    const fired = useRef(false);

    useEffect(() => {
        if (fired.current) return;
        fired.current = true;
        if (typeof window === "undefined") return;

        (async () => {
            for (const svc of services) {
                if (shouldSkip(svc.slug)) continue;
                const result = await verifyOne(svc.url);
                report(svc.slug, result.status, result.elapsedMs);
                markReported(svc.slug);
                await sleep(INTER_CHECK_DELAY_MS);
            }
        })();
    }, [services]);

    return null;
}

function shouldSkip(slug: string): boolean {
    try {
        const raw = localStorage.getItem(LS_PREFIX + slug);
        if (!raw) return false;
        const at = parseInt(raw, 10);
        return !isNaN(at) && Date.now() - at < LS_TTL_MS;
    } catch { return false; }
}

function markReported(slug: string) {
    try { localStorage.setItem(LS_PREFIX + slug, String(Date.now())); } catch { /* ignore */ }
}

async function verifyOne(url: string): Promise<{ status: "operational" | "degraded" | "down"; elapsedMs: number }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const t0 = performance.now();
    try {
        await fetch(url, { mode: "no-cors", signal: controller.signal, cache: "no-store" });
        const elapsed = Math.round(performance.now() - t0);
        return { status: elapsed > DEFAULT_DEGRADED_MS ? "degraded" : "operational", elapsedMs: elapsed };
    } catch {
        return { status: "down", elapsedMs: Math.round(performance.now() - t0) };
    } finally {
        clearTimeout(timer);
    }
}

function report(slug: string, status: "operational" | "degraded" | "down", response_time_ms: number) {
    try {
        fetch("/api/status/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug, status, response_time_ms }),
            keepalive: true,
        }).catch(() => { /* best-effort */ });
    } catch { /* ignore */ }
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
