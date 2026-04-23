// ============================================================================
// Date Helpers — Timezone-safe (America/Caracas UTC-4)
// IMPORTANT: Always use new Date(year, month-1, day) — never new Date("YYYY-MM-DD")
// to avoid UTC parse bugs that shift dates by 1 day in UTC-4 timezone.
// ============================================================================

/**
 * Checks if a given Date is a business day (not Saturday, Sunday, or a holiday).
 * @param date Local Date object
 * @param holidayIsos Array of ISO strings "YYYY-MM-DD" representing holidays
 */
export function isBusinessDay(date: Date, holidayIsos: string[]): boolean {
    const dow = date.getDay(); // 0=Sun, 6=Sat
    if (dow === 0 || dow === 6) return false;

    const iso = toLocalIso(date);
    if (holidayIsos.includes(iso)) return false;

    return true;
}

/**
 * Rolls a date forward until it lands on a business day.
 */
export function rollToNextBusinessDay(date: Date, holidayIsos: string[]): Date {
    let d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    while (!isBusinessDay(d, holidayIsos)) {
        d = addDays(d, 1);
    }
    return d;
}

/**
 * Adds N days to a date (returns a new Date).
 */
export function addDays(date: Date, n: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

/**
 * Returns ISO string "YYYY-MM-DD" using local (not UTC) date parts.
 */
export function toLocalIso(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/**
 * Parses an ISO string "YYYY-MM-DD" into a local Date (not UTC).
 * Avoids the UTC shift bug.
 */
export function parseLocalIso(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
}

/**
 * Formats an ISO date string to a Spanish-formatted date.
 * Example: "2026-03-15" → "15 de marzo de 2026"
 */
export function formatIsoDateEs(iso: string): string {
    const MONTHS_ES = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ];
    const d = parseLocalIso(iso);
    return `${d.getDate()} de ${MONTHS_ES[d.getMonth()]} de ${d.getFullYear()}`;
}

/**
 * Formats an ISO date string to a short Spanish-formatted date.
 * Example: "2026-03-15" → "15 mar. 2026"
 */
export function formatIsoDateEsShort(iso: string): string {
    const MONTHS_SHORT = [
        "ene.", "feb.", "mar.", "abr.", "may.", "jun.",
        "jul.", "ago.", "sep.", "oct.", "nov.", "dic.",
    ];
    const d = parseLocalIso(iso);
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Returns the number of calendar days between today and a future ISO date.
 * Negative if date is in the past.
 */
export function daysBetween(isoFrom: string, isoTo: string): number {
    const from = parseLocalIso(isoFrom);
    const to = parseLocalIso(isoTo);
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

/**
 * Gets today's local ISO string (YYYY-MM-DD) in Venezuela time.
 * Uses local time — assumes the browser is in VET or close.
 */
export function todayLocalIso(): string {
    return toLocalIso(new Date());
}

/**
 * Spanish month names (capitalized), 0-indexed.
 */
export const MONTHS_ES_FULL = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const MONTHS_ES_SHORT = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

// ============================================================================
// Server-side helpers for America/Caracas timezone (UTC-4 fixed, no DST)
// These are safe to use in API routes and cron jobs running on server.
// ============================================================================

/**
 * Converts any ISO timestamp to a YYYY-MM-DD string in America/Caracas time.
 * America/Caracas is UTC-4, no DST.
 */
export function toCaracasDateIso(isoOrDate: string | Date): string {
    const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
    // Subtract 4 hours from UTC to get VET (Venezuela Elapsed Time)
    const vet = new Date(d.getTime() - 4 * 60 * 60 * 1000);
    const y   = vet.getUTCFullYear();
    const m   = String(vet.getUTCMonth() + 1).padStart(2, "0");
    const day = String(vet.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/**
 * Adds N calendar days to a YYYY-MM-DD string and returns a new YYYY-MM-DD.
 * Uses UTC arithmetic to avoid local timezone shifts.
 */
export function addDaysVet(isoDate: string, n: number): string {
    const [y, m, d] = isoDate.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + n));
    const yr   = date.getUTCFullYear();
    const mo   = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dy   = String(date.getUTCDate()).padStart(2, "0");
    return `${yr}-${mo}-${dy}`;
}

/**
 * Returns true if two timestamps represent the same calendar day in VET.
 * @param a ISO timestamp string (or null → returns false)
 * @param b YYYY-MM-DD string in VET
 */
export function isSameDayVet(a: string | null, b: string): boolean {
    if (!a) return false;
    return toCaracasDateIso(a) === b;
}
