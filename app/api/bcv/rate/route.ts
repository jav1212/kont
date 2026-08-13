import { NextRequest, NextResponse } from "next/server";
import { extractCode, resolveBcvEntries } from "../_lib";

// Public contract (stable): GET /api/bcv/rate?date=YYYY-MM-DD&code=USD
// Response: { rate: number, date: "YYYY-MM-DD", code: string }
export async function GET(req: NextRequest) {
    const date = req.nextUrl.searchParams.get("date");
    const code = req.nextUrl.searchParams.get("code") ?? "USD";

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: "Fecha inválida. Usa formato YYYY-MM-DD." }, { status: 400 });
    }
    if (!/^[A-Z]{3}$/.test(code)) {
        return NextResponse.json({ error: "Código de moneda inválido." }, { status: 400 });
    }

    try {
        const resolution = await resolveBcvEntries(date);
        if (!resolution.entries.length) {
            return NextResponse.json(
                { error: "No hay tasa disponible para esa fecha." },
                { status: 404, headers: { "X-BCV-Resolution": resolution.strategy } },
            );
        }

        const result = extractCode(resolution.entries, code);
        if (!result) {
            return NextResponse.json(
                { error: `No hay tasa ${code} disponible para esa fecha.` },
                { status: 404, headers: { "X-BCV-Resolution": resolution.strategy } },
            );
        }

        return NextResponse.json(
            { ...result, code },
            { headers: { "X-BCV-Resolution": resolution.strategy } },
        );
    } catch {
        return NextResponse.json(
            { error: "No se pudo consultar la tasa BCV. Ingrésala manualmente." },
            { status: 502, headers: { "X-BCV-Resolution": "provider-error" } },
        );
    }
}
