import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api-monitor-bcv.vercel.app";

// Parsea "42,10" → 42.10
function parseRate(s: string): number {
    return parseFloat(String(s).replace(",", "."));
}

// Convierte "28/01/2026" → "2026-01-28"
function parseVeDate(s: string): string {
    const [d, m, y] = s.split("/");
    return `${y}-${m}-${d}`;
}

function extractUsd(items: any[]): { rate: number; date: string } | null {
    const usd = items.find((i) => i.code === "USD");
    if (!usd) return null;
    const rate = parseRate(usd.sell ?? usd.buy ?? "0");
    if (!rate) return null;
    return { rate, date: parseVeDate(usd.date) };
}

export async function GET(req: NextRequest) {
    const date = req.nextUrl.searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: "Fecha inválida. Usa formato YYYY-MM-DD." }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];

    try {
        let result: { rate: number; date: string } | null = null;

        if (date === today) {
            const res = await fetch(`${BASE}/exchange-rate/main`, { next: { revalidate: 1800 } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            result = extractUsd(await res.json());
        } else {
            const res = await fetch(`${BASE}/exchange-rate/list?start=${date}&end=${date}`, {
                next: { revalidate: 86400 },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            result = extractUsd(await res.json());
        }

        if (!result) {
            return NextResponse.json(
                { error: "No hay tasa USD disponible para esa fecha." },
                { status: 404 }
            );
        }

        return NextResponse.json(result);
    } catch {
        return NextResponse.json(
            { error: "No se pudo consultar la tasa BCV. Ingrésala manualmente." },
            { status: 502 }
        );
    }
}
