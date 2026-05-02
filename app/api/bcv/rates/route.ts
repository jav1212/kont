import { NextRequest, NextResponse } from "next/server";
import {
    ALLOWED_CODES,
    fetchBcvCurrentAll,
    fetchBcvListFallback,
    normalizeEntry,
    parseVeDate,
    todayCaracas,
    type NormalizedRate,
} from "../_lib";

// GET /api/bcv/rates
//   Optional ?date=YYYY-MM-DD (if omitted → today's rates including percentageChange)
// Response: { date: "YYYY-MM-DD", rates: NormalizedRate[] }

export async function GET(req: NextRequest) {
    const date = req.nextUrl.searchParams.get("date");

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: "Fecha inválida. Usa formato YYYY-MM-DD." }, { status: 400 });
    }

    try {
        const useToday = !date || date === todayCaracas();

        if (useToday) {
            // Use /exchange-rate — returns all currencies with percentageChange
            const all = await fetchBcvCurrentAll({ noStore: true });
            const rates = all
                .filter((e) => (ALLOWED_CODES as readonly string[]).includes(e.code))
                .map(normalizeEntry);

            if (!rates.length) {
                return NextResponse.json({ error: "No hay tasas disponibles." }, { status: 404 });
            }

            return NextResponse.json({ date: rates[0].date, rates });
        }

        // Historic date — use /exchange-rate/list (no percentageChange provided)
        const raw = await fetchBcvListFallback(date!, 7, { noStore: true });
        if (!raw.length) {
            return NextResponse.json({ error: "No hay tasas disponibles para esa fecha." }, { status: 404 });
        }

        // Group by date, pick the most recent date ≤ requested
        const byDate = new Map<string, NormalizedRate[]>();
        for (const entry of raw) {
            if (!(ALLOWED_CODES as readonly string[]).includes(entry.code)) continue;
            const iso = parseVeDate(entry.date);
            if (!byDate.has(iso)) byDate.set(iso, []);
            byDate.get(iso)!.push(normalizeEntry(entry));
        }

        const sortedDates = [...byDate.keys()].sort().reverse();
        for (const d of sortedDates) {
            const rates = byDate.get(d)!;
            if (rates.length > 0) return NextResponse.json({ date: d, rates });
        }

        return NextResponse.json({ error: "No hay tasas disponibles para esa fecha." }, { status: 404 });
    } catch {
        return NextResponse.json(
            { error: "No se pudo consultar el BCV." },
            { status: 502 }
        );
    }
}
