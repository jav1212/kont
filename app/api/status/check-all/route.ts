// POST /api/status/check-all
// Ejecuta health checks server-side en paralelo contra todos los servicios activos.
// Idempotente: si el último server-check fue hace < COOLDOWN_SEC, no hace nada.

import { NextResponse } from "next/server";
import { checkService, getSupabaseServer, type StatusService } from "../_lib";

const COOLDOWN_SEC = 120; // 2 min entre ejecuciones server-side

export async function POST() {
    const supabase = getSupabaseServer();

    const { data: services, error } = await supabase
        .from("status_services")
        .select("*")
        .eq("active", true)
        .order("display_order", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!services?.length) return NextResponse.json({ data: { skipped: true, reason: "no_services" } });

    // Cooldown: inspect the most recent server-check timestamp.
    const { data: lastCheck } = await supabase
        .from("status_checks")
        .select("checked_at")
        .eq("source", "server")
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (lastCheck?.checked_at) {
        const ageSec = (Date.now() - new Date(lastCheck.checked_at).getTime()) / 1000;
        if (ageSec < COOLDOWN_SEC) {
            return NextResponse.json({ data: { skipped: true, cooldownRemainingSec: Math.round(COOLDOWN_SEC - ageSec) } });
        }
    }

    const results = await Promise.allSettled(
        (services as StatusService[]).map((svc) => checkService(svc).then((r) => ({ svc, r })))
    );

    const rows = results
        .map((res) => res.status === "fulfilled" ? res.value : null)
        .filter((x): x is { svc: StatusService; r: Awaited<ReturnType<typeof checkService>> } => x !== null)
        .map(({ svc, r }) => ({
            service_id: svc.id,
            status: r.status,
            response_time_ms: r.response_time_ms,
            http_status: r.http_status,
            error_message: r.error_message,
            source: "server" as const,
        }));

    if (rows.length) {
        const { error: insertError } = await supabase.from("status_checks").insert(rows);
        if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
        data: {
            skipped: false,
            checked: rows.length,
            summary: summarize(rows.map((r) => r.status)),
        },
    });
}

function summarize(statuses: string[]) {
    const counts = { operational: 0, degraded: 0, down: 0 };
    for (const s of statuses) if (s in counts) counts[s as keyof typeof counts]++;
    return { ...counts, total: statuses.length };
}
