// POST /api/status/report
// Recibe un reporte crowdsourced desde el navegador del visitante.
// Rate-limited por fingerprint (IP+UA) a 1 report por servicio por minuto.

import { NextResponse } from "next/server";
import { z } from "zod";
import { fingerprintFromRequest, getSupabaseServer, wasReportedRecently } from "../_lib";

const schema = z.object({
    slug: z.string().min(1).max(64),
    status: z.enum(["operational", "degraded", "down"]),
    response_time_ms: z.number().int().min(0).max(60_000).nullable().optional(),
});

export async function POST(req: Request) {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const { slug, status, response_time_ms } = parsed.data;
    const fingerprint = fingerprintFromRequest(req);

    if (wasReportedRecently(fingerprint, slug)) {
        return NextResponse.json({ data: { accepted: false, reason: "rate_limited" } });
    }

    const supabase = getSupabaseServer();

    const { data: service } = await supabase
        .from("status_services")
        .select("id, active")
        .eq("slug", slug)
        .maybeSingle();

    if (!service || !service.active) {
        return NextResponse.json({ error: "service_not_found" }, { status: 404 });
    }

    const { error: insertError } = await supabase.from("status_checks").insert({
        service_id: service.id,
        status,
        response_time_ms: response_time_ms ?? null,
        source: "client",
        client_fingerprint: fingerprint,
    });
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    return NextResponse.json({ data: { accepted: true } });
}
