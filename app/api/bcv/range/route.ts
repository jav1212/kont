import { NextRequest, NextResponse } from "next/server";
import { BCV_BASE, isAllowedCode, parseVeDate, parseVeNumber, type BcvEntry } from "../_lib";

export const revalidate = 3600;

export interface RangePoint {
    date: string;  // "YYYY-MM-DD"
    sell: number;
}

const MAX_DAYS = 800;
// The upstream list endpoint is queried in windows to keep each response small.
const CHUNK_DAYS = 90;

// GET /api/bcv/range?code=USD&start=YYYY-MM-DD&end=YYYY-MM-DD
// Response: { code, start, end, points: RangePoint[] } — oldest → newest
export async function GET(req: NextRequest) {
    const params = req.nextUrl.searchParams;
    const code = (params.get("code") ?? "USD").toUpperCase();
    const start = params.get("start") ?? "";
    const end = params.get("end") ?? "";

    if (!isAllowedCode(code)) {
        return NextResponse.json({ error: `Moneda no soportada: ${code}` }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
        return NextResponse.json({ error: "Rango inválido. Usa start y end con formato YYYY-MM-DD." }, { status: 400 });
    }
    if (daysBetween(start, end) > MAX_DAYS) {
        return NextResponse.json({ error: `El rango no puede superar ${MAX_DAYS} días.` }, { status: 400 });
    }

    try {
        const byDate = new Map<string, number>();
        for (let chunkStart = start; chunkStart <= end; chunkStart = addDays(chunkStart, CHUNK_DAYS + 1)) {
            const chunkEnd = minDate(addDays(chunkStart, CHUNK_DAYS), end);
            const res = await fetch(`${BCV_BASE}/exchange-rate/list?start=${chunkStart}&end=${chunkEnd}`, { next: { revalidate } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const raw = (await res.json()) as BcvEntry[];
            for (const entry of Array.isArray(raw) ? raw : []) {
                if (entry.code !== code) continue;
                const sell = parseVeNumber(entry.sell);
                if (Number.isFinite(sell) && sell > 0) byDate.set(parseVeDate(entry.date), sell);
            }
        }
        const points: RangePoint[] = [...byDate.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([date, sell]) => ({ date, sell }));
        return NextResponse.json({ code, start, end, points });
    } catch {
        return NextResponse.json({ error: "No se pudo consultar el BCV." }, { status: 502 });
    }
}

function addDays(date: string, days: number): string {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

function minDate(left: string, right: string): string {
    return left < right ? left : right;
}

function daysBetween(start: string, end: string): number {
    return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}
