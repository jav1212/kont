// Number formatting helpers aligned with Venezuelan locale ("42,10").
// Centralized so every tools component uses the same rounding and style.

export function formatVes(n: number, digits: number = 2): string {
    if (!isFinite(n)) return "—";
    return n.toLocaleString("es-VE", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

/** Round a value to `digits` decimals. Returns NaN on non-finite input. */
export function roundToDecimals(n: number, digits: number): number {
    if (!isFinite(n)) return NaN;
    const factor = Math.pow(10, digits);
    return Math.round(n * factor) / factor;
}

export function formatRate(n: number): string {
    // BCV rates are sometimes > 100 Bs/$, sometimes < 1 Bs (JPY, RUB).
    // Auto-adjust precision: 2 decimals if ≥ 1, 4 decimals if < 1.
    if (!isFinite(n)) return "—";
    const digits = Math.abs(n) >= 1 ? 2 : 4;
    return n.toLocaleString("es-VE", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

/**
 * Parse user-entered number tolerating both "1.234,56" and "1234.56".
 * Returns NaN on invalid input.
 */
export function parseUserNumber(s: string): number {
    if (!s) return NaN;
    const cleaned = s.trim().replace(/\s/g, "");
    // If contains comma, assume Venezuelan format: "." is thousand sep, "," is decimal
    if (cleaned.includes(",")) {
        return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
    }
    return parseFloat(cleaned);
}

export function formatPercentage(n: number | null | undefined): string {
    if (n == null || !isFinite(n)) return "—";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(2)}%`;
}

export function formatIsoDateEs(iso: string): string {
    // "2026-04-22" → "22 abr 2026"
    const [y, m, d] = iso.split("-");
    const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const mi = parseInt(m, 10) - 1;
    return `${parseInt(d, 10)} ${months[mi] ?? m} ${y}`;
}
