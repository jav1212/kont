import "server-only";

// Server adapter for historical official USD rates, read from the BCV proxy
// upstream in windows small enough for its list endpoint.

import { exactDecimal } from "@kontave/monetary/domain";
import { salesDate, type SalesDate } from "@kontave/sales/domain";
import type { UsdVesRateHistory, UsdVesRatePoint } from "@kontave/sales/application";

const BCV_BASE = process.env.BCV_API_URL ?? "https://bcv.kontave.com";
const CHUNK_DAYS = 90;
/** Longest range served in one call, about two years. */
export const MAX_BCV_RANGE_DAYS = 800;

interface UpstreamEntry {
    code: string;
    sell: number | string;
    date: string; // "DD/MM/YYYY"
}

/** Reads every published USD sell rate between two dates from the BCV upstream. */
export class BcvServerUsdRateHistory implements UsdVesRateHistory {
    /**
     * Creates the adapter.
     * @param revalidateSeconds - Next.js fetch cache lifetime for each window.
     */
    constructor(private readonly revalidateSeconds = 3600) {}

    /** {@inheritDoc UsdVesRateHistory.ratesBetween} */
    async ratesBetween(start: SalesDate, end: SalesDate): Promise<readonly UsdVesRatePoint[]> {
        if (start > end) return [];
        if (daysBetween(start, end) > MAX_BCV_RANGE_DAYS) throw new Error(`BCV range exceeds ${MAX_BCV_RANGE_DAYS} days.`);
        const byDate = new Map<string, string>();
        for (let chunkStart: string = start; chunkStart <= end; chunkStart = addDays(chunkStart, CHUNK_DAYS + 1)) {
            const chunkEnd = minDate(addDays(chunkStart, CHUNK_DAYS), end);
            const response = await fetch(`${BCV_BASE}/exchange-rate/list?start=${chunkStart}&end=${chunkEnd}`, { next: { revalidate: this.revalidateSeconds } });
            if (!response.ok) throw new Error(`BCV upstream HTTP ${response.status}`);
            const raw = (await response.json()) as UpstreamEntry[];
            for (const entry of Array.isArray(raw) ? raw : []) {
                if (entry.code !== "USD") continue;
                const sell = typeof entry.sell === "number" ? String(entry.sell) : entry.sell.trim().replace(",", ".");
                if (!/^\d+(\.\d+)?$/.test(sell) || Number(sell) <= 0) continue;
                const [day, month, year] = entry.date.split("/");
                byDate.set(`${year}-${month}-${day}`, sell);
            }
        }
        return [...byDate.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([date, sell]) => ({ effectiveDate: salesDate(date), vesPerUsd: exactDecimal(sell) }));
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
