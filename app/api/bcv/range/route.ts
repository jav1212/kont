import { NextRequest, NextResponse } from "next/server";
import { salesDate } from "@kontave/sales/domain";
import { BcvServerUsdRateHistory, MAX_BCV_RANGE_DAYS } from "@/src/modules/sales/backend/infra/financed-sales/bcv-usd-rate-history";

export const revalidate = 3600;

export interface RangePoint {
    date: string;  // "YYYY-MM-DD"
    sell: number;
}

// GET /api/bcv/range?code=USD&start=YYYY-MM-DD&end=YYYY-MM-DD
// Response: { code, start, end, points: RangePoint[] } — oldest → newest
export async function GET(req: NextRequest) {
    const params = req.nextUrl.searchParams;
    const code = (params.get("code") ?? "USD").toUpperCase();
    const start = params.get("start") ?? "";
    const end = params.get("end") ?? "";

    if (code !== "USD") {
        return NextResponse.json({ error: `Moneda no soportada: ${code}` }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
        return NextResponse.json({ error: "Rango inválido. Usa start y end con formato YYYY-MM-DD." }, { status: 400 });
    }
    if ((Date.parse(end) - Date.parse(start)) / 86_400_000 > MAX_BCV_RANGE_DAYS) {
        return NextResponse.json({ error: `El rango no puede superar ${MAX_BCV_RANGE_DAYS} días.` }, { status: 400 });
    }

    try {
        const points = await new BcvServerUsdRateHistory(revalidate).ratesBetween(salesDate(start), salesDate(end));
        return NextResponse.json({ code, start, end, points: points.map((point): RangePoint => ({ date: point.effectiveDate, sell: Number(point.vesPerUsd) })) });
    } catch {
        return NextResponse.json({ error: "No se pudo consultar el BCV." }, { status: 502 });
    }
}
