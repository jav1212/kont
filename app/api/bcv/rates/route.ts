import { NextRequest, NextResponse } from "next/server";
import { normalizeEntry, parseVeDate, resolveBcvEntries, todayCaracas, type NormalizedRate } from "../_lib";

// GET /api/bcv/rates?date=YYYY-MM-DD
// Response: { date: "YYYY-MM-DD", rates: NormalizedRate[] }
export async function GET(req: NextRequest) {
    const date = req.nextUrl.searchParams.get("date");

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: "Fecha inválida. Usa formato YYYY-MM-DD." }, { status: 400 });
    }

    try {
        const resolution = await resolveBcvEntries(date ?? todayCaracas());
        if (!resolution.entries.length) {
            return NextResponse.json(
                { error: "No hay tasas disponibles para esa fecha." },
                { status: 404, headers: { "X-BCV-Resolution": resolution.strategy } },
            );
        }

        const byDate = new Map<string, NormalizedRate[]>();
        for (const entry of resolution.entries) {
            if (!/^[A-Z]{3}$/.test(entry.code)) continue;
            const iso = parseVeDate(entry.date);
            if (!byDate.has(iso)) byDate.set(iso, []);
            const normalized = normalizeEntry(entry);
            if (Number.isFinite(normalized.sell) && normalized.sell > 0) byDate.get(iso)!.push(normalized);
        }

        for (const effectiveDate of [...byDate.keys()].sort().reverse()) {
            const rates = byDate.get(effectiveDate)!;
            if (rates.length) {
                return NextResponse.json(
                    { date: effectiveDate, rates },
                    { headers: { "X-BCV-Resolution": resolution.strategy } },
                );
            }
        }

        return NextResponse.json(
            { error: "No hay tasas disponibles para esa fecha." },
            { status: 404, headers: { "X-BCV-Resolution": resolution.strategy } },
        );
    } catch {
        return NextResponse.json(
            { error: "No se pudo consultar el BCV." },
            { status: 502, headers: { "X-BCV-Resolution": "provider-error" } },
        );
    }
}
