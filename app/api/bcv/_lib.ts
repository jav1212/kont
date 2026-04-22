// Shared helpers for BCV proxy routes (/api/bcv/*).
// Upstream API: https://api-monitor-bcv.vercel.app
//
// Verified response shape (2026-04-22):
//   - buy / sell  → number (e.g. 481.5517035)
//   - date        → string "DD/MM/YYYY"
//   - percentageChange → string with % suffix (e.g. "0.22%", "-0.05%")
//
// parseVeNumber is defensive: tolerates "42,10" string form in case the upstream
// ever returns numbers as Venezuelan-formatted strings.

export const BCV_BASE = process.env.BCV_API_URL ?? "https://api-monitor-bcv.vercel.app";

export interface BcvEntry {
    code: string;
    country?: string;
    buy: number | string;
    sell: number | string;
    date: string;
    percentageChange?: string | number | null;
}

export interface NormalizedRate {
    code: string;
    country: string;
    buy: number;
    sell: number;
    date: string;
    percentageChange: number | null;
}

/** Allowlist of currency codes we expose. Matches what BCV publishes. */
export const ALLOWED_CODES = [
    "USD", "EUR", "CNY", "TRY", "RUB", "AED", "GBP", "JPY", "CAD", "MXN", "BRL",
] as const;

export type AllowedCode = typeof ALLOWED_CODES[number];

export function isAllowedCode(code: string): code is AllowedCode {
    return (ALLOWED_CODES as readonly string[]).includes(code);
}

/** "28/01/2026" → "2026-01-28" */
export function parseVeDate(s: string): string {
    const [d, m, y] = s.split("/");
    return `${y}-${m}-${d}`;
}

/** "2026-01-28" → "28/01/2026" */
export function formatVeDate(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
}

/** Subtract N days from YYYY-MM-DD string (UTC-safe). */
export function subtractDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().split("T")[0];
}

/** Today in YYYY-MM-DD (Caracas timezone: -04:00). */
export function todayCaracas(): string {
    const now = new Date();
    const offsetMs = -4 * 60 * 60 * 1000;
    return new Date(now.getTime() + offsetMs).toISOString().split("T")[0];
}

/**
 * Parse a numeric value that could come as number, "42.10", or "42,10".
 * Returns NaN on failure — caller decides what to do.
 */
export function parseVeNumber(v: unknown): number {
    if (typeof v === "number") return v;
    if (typeof v !== "string") return NaN;
    const cleaned = v.trim().replace(/\s/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? NaN : n;
}

/** Parse "0.22%", "-0.05%", 0.22, "-0,05%" → number. null on missing/invalid. */
export function parsePercentage(v: unknown): number | null {
    if (v == null) return null;
    if (typeof v === "number") return v;
    if (typeof v !== "string") return null;
    const cleaned = v.trim().replace("%", "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
}

/** Normalize a raw BCV entry to numeric/consistent types. */
export function normalizeEntry(e: BcvEntry): NormalizedRate {
    return {
        code: e.code,
        country: e.country ?? "",
        buy: parseVeNumber(e.buy),
        sell: parseVeNumber(e.sell),
        date: parseVeDate(e.date),
        percentageChange: parsePercentage(e.percentageChange ?? null),
    };
}

/**
 * From a list of BcvEntry, find the first entry with given code (ordered by most
 * recent date) and return its sell rate + normalized ISO date.
 * Used by /api/bcv/rate to preserve existing contract.
 */
export function extractCode(items: BcvEntry[], code: string): { rate: number; date: string } | null {
    // Group by date, then pick the most recent date that has this code
    const byDate = new Map<string, BcvEntry[]>();
    for (const entry of items) {
        const iso = parseVeDate(entry.date);
        if (!byDate.has(iso)) byDate.set(iso, []);
        byDate.get(iso)!.push(entry);
    }
    const sortedDates = [...byDate.keys()].sort().reverse();
    for (const d of sortedDates) {
        const entry = byDate.get(d)!.find((i) => i.code === code);
        if (!entry) continue;
        const sell = parseVeNumber(entry.sell);
        if (isFinite(sell) && sell > 0) return { rate: sell, date: d };
    }
    return null;
}

/**
 * Fetch the full list from the upstream history endpoint, with an N-day fallback
 * window to cover weekends/holidays when BCV doesn't publish.
 */
export async function fetchBcvListFallback(
    endDate: string,
    fallbackDays = 7,
    init?: { revalidate?: number; noStore?: boolean },
): Promise<BcvEntry[]> {
    const start = subtractDays(endDate, fallbackDays);
    const url = `${BCV_BASE}/exchange-rate/list?start=${start}&end=${endDate}`;

    const cache: RequestInit & { next?: { revalidate: number } } = init?.noStore
        ? { cache: "no-store" }
        : init?.revalidate != null
            ? { next: { revalidate: init.revalidate } }
            : { cache: "no-store" };

    const res = await fetch(url, cache);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as BcvEntry[];
    return Array.isArray(data) ? data : [];
}

/**
 * Fetch all current rates (with percentageChange) from /exchange-rate.
 */
export async function fetchBcvCurrentAll(init?: { revalidate?: number; noStore?: boolean }): Promise<BcvEntry[]> {
    const url = `${BCV_BASE}/exchange-rate`;
    const cache: RequestInit & { next?: { revalidate: number } } = init?.noStore
        ? { cache: "no-store" }
        : init?.revalidate != null
            ? { next: { revalidate: init.revalidate } }
            : { cache: "no-store" };

    const res = await fetch(url, cache);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as BcvEntry[];
    return Array.isArray(data) ? data : [];
}
