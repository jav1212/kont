// GET /api/status/services
// Retorna la lista de servicios con su último estado y un timeline de 90 días.
// Dispara check-all server-side si hace más de 2 min del último check (best-effort,
// no bloquea la respuesta si falla).

import { NextResponse } from "next/server";
import { getSupabaseServer, aggregateBucket, type ServiceStatus } from "../_lib";

const AUTO_CHECK_COOLDOWN_SEC = 120;
const BUCKETS_DAYS = 90;

export interface ServiceWithStatus {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    url: string;
    category: "fiscal" | "laboral" | "mercantil";
    logoUrl: string | null;
    displayOrder: number;
    lastStatus: ServiceStatus | null;
    lastResponseMs: number | null;
    lastCheckedAt: string | null;
    lastSource: "server" | "client" | null;
    uptimeBuckets: { date: string; status: ServiceStatus | null; avgMs: number | null }[];
}

export interface ServicesResponse {
    services: ServiceWithStatus[];
    summary: { operational: number; degraded: number; down: number; unknown: number; total: number };
    lastServerCheckAt: string | null;
}

export async function GET(req: Request) {
    const supabase = getSupabaseServer();

    const { data: services, error } = await supabase
        .from("status_services")
        .select("*")
        .eq("active", true)
        .order("display_order", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!services?.length) {
        return NextResponse.json({ data: { services: [], summary: { operational: 0, degraded: 0, down: 0, unknown: 0, total: 0 }, lastServerCheckAt: null } });
    }

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - BUCKETS_DAYS);

    const { data: checks } = await supabase
        .from("status_checks")
        .select("service_id, checked_at, status, response_time_ms, source")
        .gte("checked_at", since.toISOString())
        .order("checked_at", { ascending: false })
        .limit(50_000);

    const checksByService = new Map<string, typeof checks>();
    for (const c of checks ?? []) {
        const list = checksByService.get(c.service_id) ?? [];
        list.push(c);
        checksByService.set(c.service_id, list);
    }

    const enriched: ServiceWithStatus[] = services.map((svc) => {
        const svcChecks = checksByService.get(svc.id) ?? [];
        const last = svcChecks[0]; // already ordered desc
        const uptimeBuckets = buildDailyBuckets(svcChecks, BUCKETS_DAYS);
        return {
            id: svc.id,
            slug: svc.slug,
            name: svc.name,
            description: svc.description,
            url: svc.url,
            category: svc.category,
            logoUrl: svc.logo_url,
            displayOrder: svc.display_order,
            lastStatus: (last?.status as ServiceStatus) ?? null,
            lastResponseMs: last?.response_time_ms ?? null,
            lastCheckedAt: last?.checked_at ?? null,
            lastSource: (last?.source as "server" | "client") ?? null,
            uptimeBuckets,
        };
    });

    const summary = enriched.reduce(
        (acc, s) => {
            if (s.lastStatus === "operational") acc.operational++;
            else if (s.lastStatus === "degraded") acc.degraded++;
            else if (s.lastStatus === "down") acc.down++;
            else acc.unknown++;
            acc.total++;
            return acc;
        },
        { operational: 0, degraded: 0, down: 0, unknown: 0, total: 0 },
    );

    const { data: lastServerCheck } = await supabase
        .from("status_checks")
        .select("checked_at")
        .eq("source", "server")
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    // Trigger background check if cooldown elapsed. Best-effort: we don't await.
    maybeTriggerCheck(lastServerCheck?.checked_at ?? null, req);

    const response: ServicesResponse = {
        services: enriched,
        summary,
        lastServerCheckAt: lastServerCheck?.checked_at ?? null,
    };
    return NextResponse.json({ data: response });
}

function buildDailyBuckets(
    checks: { checked_at: string; status: string; response_time_ms: number | null }[],
    days: number,
): { date: string; status: ServiceStatus | null; avgMs: number | null }[] {
    const byDay = new Map<string, { status: ServiceStatus; response_time_ms: number | null }[]>();
    for (const c of checks) {
        const day = c.checked_at.slice(0, 10); // YYYY-MM-DD
        const list = byDay.get(day) ?? [];
        list.push({ status: c.status as ServiceStatus, response_time_ms: c.response_time_ms });
        byDay.set(day, list);
    }

    const out: { date: string; status: ServiceStatus | null; avgMs: number | null }[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setUTCDate(today.getUTCDate() - i);
        const iso = d.toISOString().slice(0, 10);
        const list = byDay.get(iso) ?? [];
        const agg = aggregateBucket(list);
        out.push({ date: iso, status: agg.status, avgMs: agg.avg_ms });
    }
    return out;
}

function maybeTriggerCheck(lastAt: string | null, req: Request) {
    if (lastAt) {
        const ageSec = (Date.now() - new Date(lastAt).getTime()) / 1000;
        if (ageSec < AUTO_CHECK_COOLDOWN_SEC) return;
    }
    try {
        const url = new URL("/api/status/check-all", req.url);
        void fetch(url, { method: "POST", cache: "no-store" }).catch(() => {});
    } catch {
        // ignore — best-effort
    }
}
