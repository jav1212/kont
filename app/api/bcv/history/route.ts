import { NextRequest, NextResponse } from "next/server";
import {
    BCV_BASE,
    isAllowedCode,
    parseVeDate,
    parseVeNumber,
    subtractDays,
    todayCaracas,
} from "../_lib";

export const revalidate = 1800;

export interface HistoryPoint {
    date: string;  // "YYYY-MM-DD"
    buy: number;
    sell: number;
}

// GET /api/bcv/history?code=USD&days=30
// Response: { code, days, points: HistoryPoint[] }  — oldest → newest

export async function GET(req: NextRequest) {
    const code = (req.nextUrl.searchParams.get("code") ?? "USD").toUpperCase();
    const daysRaw = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10);

    if (!isAllowedCode(code)) {
        return NextResponse.json({ error: `Moneda no soportada: ${code}` }, { status: 400 });
    }

    const days = Math.max(7, Math.min(90, isNaN(daysRaw) ? 30 : daysRaw));

    try {
        const end = todayCaracas();
        const start = subtractDays(end, days);

        const url = `${BCV_BASE}/exchange-rate/list?start=${start}&end=${end}`;
        const res = await fetch(url, { next: { revalidate: 1800 } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = (await res.json()) as Array<{ code: string; buy: unknown; sell: unknown; date: string }>;

        const seen = new Set<string>();
        const points: HistoryPoint[] = [];
        for (const e of raw) {
            if (e.code !== code) continue;
            const iso = parseVeDate(e.date);
            if (seen.has(iso)) continue;
            seen.add(iso);
            const buy = parseVeNumber(e.buy);
            const sell = parseVeNumber(e.sell);
            if (!isFinite(sell) || sell <= 0) continue;
            points.push({ date: iso, buy, sell });
        }

        points.sort((a, b) => a.date.localeCompare(b.date));
        return NextResponse.json({ code, days, points });
    } catch {
        return NextResponse.json(
            { error: "No se pudo consultar el histórico BCV." },
            { status: 502 }
        );
    }
}
