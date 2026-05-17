import { NextRequest, NextResponse } from "next/server";
import {
    extractCode,
    fetchBcvCurrentAll,
    fetchBcvListFallback,
    parseVeDate,
    parseVeNumber,
    todayCaracas,
} from "../_lib";

// Public contract (stable): GET /api/bcv/rate?date=YYYY-MM-DD&code=USD
// Response: { rate: number, date: "YYYY-MM-DD", code: string }
// Used by payroll + inventory flows. DO NOT change response shape.

export async function GET(req: NextRequest) {
    const date = req.nextUrl.searchParams.get("date");
    const code = req.nextUrl.searchParams.get("code") ?? "USD";

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: "Fecha inválida. Usa formato YYYY-MM-DD." }, { status: 400 });
    }

    try {
        // Si la fecha pedida es hoy en Caracas, preferimos el endpoint "vigente"
        // (mismo que usa /api/bcv/rates): devuelve la tasa que BCV ya publicó
        // como efectiva, incluso fines de semana y feriados en que
        // /exchange-rate/list todavía no incluye la entrada del próximo día hábil.
        if (date === todayCaracas()) {
            try {
                const all = await fetchBcvCurrentAll();
                const entry = all.find((e) => e.code === code);
                if (entry) {
                    const sell = parseVeNumber(entry.sell);
                    if (isFinite(sell) && sell > 0) {
                        return NextResponse.json({
                            rate: sell,
                            date: parseVeDate(entry.date),
                            code,
                        });
                    }
                }
            } catch {
                // Cualquier fallo del endpoint vigente cae al path histórico de abajo.
            }
        }

        const data = await fetchBcvListFallback(date, 7);
        if (!data.length) {
            return NextResponse.json(
                { error: "No hay tasa disponible para esa fecha." },
                { status: 404 }
            );
        }

        const result = extractCode(data, code);
        if (!result) {
            return NextResponse.json(
                { error: `No hay tasa ${code} disponible para esa fecha.` },
                { status: 404 }
            );
        }

        return NextResponse.json({ ...result, code });
    } catch {
        return NextResponse.json(
            { error: "No se pudo consultar la tasa BCV. Ingrésala manualmente." },
            { status: 502 }
        );
    }
}
