// POST /api/status/check-all
// Ejecuta health checks server-side en paralelo contra todos los servicios activos.
// Idempotente: si el último server-check fue hace < COOLDOWN_SEC, no hace nada.

import { NextResponse } from "next/server";
import { getSupabaseServer, runServerChecks } from "../_lib";

const COOLDOWN_SEC = 120; // 2 min entre ejecuciones server-side automáticas

export async function POST() {
    const supabase = getSupabaseServer();
    const result   = await runServerChecks(supabase, { cooldownSec: COOLDOWN_SEC });

    if (result.skipped) {
        return NextResponse.json({
            data: { skipped: true, cooldownRemainingSec: result.cooldownRemainingSec },
        });
    }

    return NextResponse.json({
        data: { skipped: false, checked: result.inserted ?? 0 },
    });
}
