import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.BCV_API_URL ?? "https://api-monitor-bcv.vercel.app";

interface BcvEntry {
    code: string;
    buy: number;
    sell: number;
    date: string; // "DD/MM/YYYY"
}

/** "28/01/2026" → "2026-01-28" */
function parseVeDate(s: string): string {
    const [d, m, y] = s.split("/");
    return `${y}-${m}-${d}`;
}

function extractCode(items: BcvEntry[], code: string): { rate: number; date: string } | null {
    const entry = items.find((i) => i.code === code);
    if (!entry || !entry.sell) return null;
    return { rate: entry.sell, date: parseVeDate(entry.date) };
}

/** Subtract N days from YYYY-MM-DD string */
function subtractDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
    const date = req.nextUrl.searchParams.get("date");
    const code = req.nextUrl.searchParams.get("code") ?? "USD";

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: "Fecha inválida. Usa formato YYYY-MM-DD." }, { status: 400 });
    }

    try {
        // Try exact date first; if empty (weekend/holiday), fall back up to 7 days prior
        const start = subtractDays(date, 7);
        const res = await fetch(`${BASE}/exchange-rate/list?start=${start}&end=${date}`, {
            next: { revalidate: 3600 },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: BcvEntry[] = await res.json();

        if (!data.length) {
            return NextResponse.json(
                { error: "No hay tasa disponible para esa fecha." },
                { status: 404 }
            );
        }

        // The API groups all currencies per date; take the last available date ≤ requested
        // Group by date and pick the latest
        const byDate = new Map<string, BcvEntry[]>();
        for (const entry of data) {
            const iso = parseVeDate(entry.date);
            if (!byDate.has(iso)) byDate.set(iso, []);
            byDate.get(iso)!.push(entry);
        }

        // Sort dates descending, take the most recent ≤ requested date
        const sortedDates = [...byDate.keys()].sort().reverse();
        for (const d of sortedDates) {
            const result = extractCode(byDate.get(d)!, code);
            if (result) return NextResponse.json({ ...result, code });
        }

        return NextResponse.json(
            { error: `No hay tasa ${code} disponible para esa fecha.` },
            { status: 404 }
        );
    } catch {
        return NextResponse.json(
            { error: "No se pudo consultar la tasa BCV. Ingrésala manualmente." },
            { status: 502 }
        );
    }
}
