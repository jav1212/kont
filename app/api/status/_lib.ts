// Shared helpers for /api/status/* routes.
//
// Status classifier:
//   - operational: HTTP 2xx/3xx AND elapsed <= degraded_threshold_ms
//   - degraded:    HTTP 2xx/3xx AND elapsed  > degraded_threshold_ms, OR HTTP 4xx
//   - down:        HTTP 5xx, timeout, or network error
//
// The check is intentionally lenient: many Venezuelan portals return 403/404
// when probed without cookies, but the service itself is up. We treat those as
// "degraded" rather than "down" so we don't raise false alarms.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export type ServiceStatus = "operational" | "degraded" | "down";

export interface StatusService {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    url: string;
    category: "fiscal" | "laboral" | "mercantil";
    logo_url: string | null;
    check_method: "GET" | "HEAD";
    timeout_ms: number;
    degraded_threshold_ms: number;
    active: boolean;
    display_order: number;
}

export interface CheckResult {
    status: ServiceStatus;
    response_time_ms: number;
    http_status: number | null;
    error_message: string | null;
}

let _client: SupabaseClient | null = null;
export function getSupabaseServer(): SupabaseClient {
    if (_client) return _client;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase env vars missing");
    _client = createClient(url, key, { auth: { persistSession: false } });
    return _client;
}

/**
 * Execute a health check against a single service. Never throws — always
 * resolves with a CheckResult. Uses AbortController for timeout enforcement.
 */
export async function checkService(service: StatusService): Promise<CheckResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), service.timeout_ms);
    const t0 = performance.now();

    try {
        const res = await fetch(service.url, {
            method: service.check_method,
            signal: controller.signal,
            redirect: "follow",
            cache: "no-store",
            headers: {
                // Pretend to be a normal browser — some portals reject non-browser UAs.
                "User-Agent": "Mozilla/5.0 (compatible; KontStatus/1.0; +https://konta.com.ve/herramientas/status)",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        });
        const elapsed = Math.round(performance.now() - t0);
        return {
            status: classify(res.status, elapsed, service.degraded_threshold_ms, false),
            response_time_ms: elapsed,
            http_status: res.status,
            error_message: null,
        };
    } catch (err) {
        const elapsed = Math.round(performance.now() - t0);
        const isTimeout = controller.signal.aborted;
        return {
            status: "down",
            response_time_ms: elapsed,
            http_status: null,
            error_message: isTimeout ? "timeout" : err instanceof Error ? err.message : "network_error",
        };
    } finally {
        clearTimeout(timer);
    }
}

function classify(httpStatus: number, elapsedMs: number, degradedThresholdMs: number, timedOut: boolean): ServiceStatus {
    if (timedOut) return "down";
    if (httpStatus >= 500) return "down";
    if (httpStatus >= 400) return "degraded";
    if (elapsedMs > degradedThresholdMs) return "degraded";
    return "operational";
}

/**
 * Build a stable, non-reversible fingerprint from request headers. Used for
 * rate-limiting crowdsource reports without storing PII.
 */
export function fingerprintFromRequest(req: Request): string {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? req.headers.get("x-real-ip")
        ?? "unknown";
    const ua = req.headers.get("user-agent") ?? "unknown";
    return crypto.createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 32);
}

/**
 * Returns true if the fingerprint already reported this service within the
 * last windowSeconds. Uses a bounded in-memory LRU to avoid hitting the DB
 * for every report.
 */
const reportCache = new Map<string, number>();
const REPORT_WINDOW_MS = 60_000;
const REPORT_CACHE_MAX = 10_000;

export function wasReportedRecently(fingerprint: string, slug: string): boolean {
    const key = `${fingerprint}:${slug}`;
    const at = reportCache.get(key);
    const now = Date.now();
    if (at && now - at < REPORT_WINDOW_MS) return true;
    reportCache.set(key, now);
    if (reportCache.size > REPORT_CACHE_MAX) {
        // Evict oldest ~10% when full
        const cutoff = now - REPORT_WINDOW_MS;
        for (const [k, v] of reportCache) {
            if (v < cutoff) reportCache.delete(k);
            if (reportCache.size <= REPORT_CACHE_MAX * 0.9) break;
        }
    }
    return false;
}

export interface ServerCheckResult {
    skipped:              boolean;
    inserted?:            number;
    cooldownRemainingSec?: number;
}

/**
 * Run health checks against all active services in parallel and persist results.
 * Respects a cooldown: if the most recent server-source check is within cooldownSec,
 * returns { skipped: true } without running checks. Awaits insertion so callers can
 * safely re-query status_checks afterward and see the fresh rows.
 */
export async function runServerChecks(
    supabase: SupabaseClient,
    opts: { cooldownSec: number },
): Promise<ServerCheckResult> {
    const { data: services, error } = await supabase
        .from("status_services")
        .select("*")
        .eq("active", true)
        .order("display_order", { ascending: true });

    if (error || !services?.length) return { skipped: true };

    const { data: lastCheck } = await supabase
        .from("status_checks")
        .select("checked_at")
        .eq("source", "server")
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (lastCheck?.checked_at) {
        const ageSec = (Date.now() - new Date(lastCheck.checked_at).getTime()) / 1000;
        if (ageSec < opts.cooldownSec) {
            return { skipped: true, cooldownRemainingSec: Math.round(opts.cooldownSec - ageSec) };
        }
    }

    const results = await Promise.allSettled(
        (services as StatusService[]).map((svc) => checkService(svc).then((r) => ({ svc, r })))
    );

    const rows = results
        .map((res) => res.status === "fulfilled" ? res.value : null)
        .filter((x): x is { svc: StatusService; r: Awaited<ReturnType<typeof checkService>> } => x !== null)
        .map(({ svc, r }) => ({
            service_id:       svc.id,
            status:           r.status,
            response_time_ms: r.response_time_ms,
            http_status:      r.http_status,
            error_message:    r.error_message,
            source:           "server" as const,
        }));

    if (rows.length) {
        await supabase.from("status_checks").insert(rows);
    }

    return { skipped: false, inserted: rows.length };
}

/** Aggregate an array of checks into a single status + latency for a time bucket. */
export function aggregateBucket(checks: { status: ServiceStatus; response_time_ms: number | null }[]): {
    status: ServiceStatus | null;
    avg_ms: number | null;
} {
    if (!checks.length) return { status: null, avg_ms: null };
    // Worst-case wins: down > degraded > operational
    const rank = { down: 3, degraded: 2, operational: 1 } as const;
    let worst: ServiceStatus = "operational";
    let sum = 0;
    let n = 0;
    for (const c of checks) {
        if (rank[c.status] > rank[worst]) worst = c.status;
        if (c.response_time_ms != null) { sum += c.response_time_ms; n++; }
    }
    return { status: worst, avg_ms: n ? Math.round(sum / n) : null };
}
