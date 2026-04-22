// GET /api/status/history?slug=seniat&hours=24
// Retorna la serie temporal de checks de un servicio para la página de detalle.

import { NextResponse } from "next/server";
import { getSupabaseServer, type ServiceStatus } from "../_lib";

const MAX_HOURS = 24 * 90; // 90 días
const DEFAULT_HOURS = 24;

export interface HistoryPoint {
    checkedAt: string;
    status: ServiceStatus;
    responseMs: number | null;
    source: "server" | "client";
}

export interface HistoryResponse {
    service: { id: string; slug: string; name: string; url: string; category: string };
    hours: number;
    points: HistoryPoint[];
    incidents: { id: string; startedAt: string; resolvedAt: string | null; description: string | null }[];
    uptime: { days7: number | null; days30: number | null; days90: number | null };
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const hoursParam = url.searchParams.get("hours");
    const hours = hoursParam ? Math.min(MAX_HOURS, Math.max(1, parseInt(hoursParam, 10))) : DEFAULT_HOURS;

    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const supabase = getSupabaseServer();

    const { data: service, error: svcErr } = await supabase
        .from("status_services")
        .select("id, slug, name, url, category")
        .eq("slug", slug)
        .maybeSingle();
    if (svcErr) return NextResponse.json({ error: svcErr.message }, { status: 500 });
    if (!service) return NextResponse.json({ error: "service_not_found" }, { status: 404 });

    const sinceHours = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data: points } = await supabase
        .from("status_checks")
        .select("checked_at, status, response_time_ms, source")
        .eq("service_id", service.id)
        .gte("checked_at", sinceHours)
        .order("checked_at", { ascending: true })
        .limit(5000);

    const { data: incidents } = await supabase
        .from("status_incidents")
        .select("id, started_at, resolved_at, description")
        .eq("service_id", service.id)
        .order("started_at", { ascending: false })
        .limit(20);

    const uptime = {
        days7: await computeUptime(supabase, service.id, 7),
        days30: await computeUptime(supabase, service.id, 30),
        days90: await computeUptime(supabase, service.id, 90),
    };

    const response: HistoryResponse = {
        service,
        hours,
        points: (points ?? []).map((p) => ({
            checkedAt: p.checked_at,
            status: p.status as ServiceStatus,
            responseMs: p.response_time_ms,
            source: p.source as "server" | "client",
        })),
        incidents: (incidents ?? []).map((i) => ({
            id: i.id,
            startedAt: i.started_at,
            resolvedAt: i.resolved_at,
            description: i.description,
        })),
        uptime,
    };

    return NextResponse.json({ data: response });
}

async function computeUptime(supabase: ReturnType<typeof getSupabaseServer>, serviceId: string, days: number): Promise<number | null> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
        .from("status_checks")
        .select("status")
        .eq("service_id", serviceId)
        .gte("checked_at", since);
    if (!data?.length) return null;
    const up = data.filter((d) => d.status === "operational").length;
    return Math.round((up / data.length) * 10000) / 100; // e.g. 99.87
}
