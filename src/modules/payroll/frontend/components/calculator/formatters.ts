// Calculator-shared formatters.
// Used by every payroll sub-calculator (vacations, social-benefits,
// profit-sharing, liquidations) so currency, dates, and document IDs
// render identically across the module.

const ES_VE_OPTS: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
};

const MONTHS_LONG = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Bs. 13.250,00 */
export function formatCurrency(n: number): string {
    return "Bs. " + n.toLocaleString("es-VE", ES_VE_OPTS);
}

/** 13.250,00 (no prefix) */
export function formatNumber(n: number): string {
    return n.toLocaleString("es-VE", ES_VE_OPTS);
}

/** $166,29 USD */
export function formatUsd(n: number): string {
    return "$" + n.toLocaleString("es-VE", ES_VE_OPTS) + " USD";
}

/** 23 de abril de 2026 — long humanised date for constancia headers */
export function formatDateLong(iso: string): string {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${parseInt(d, 10)} de ${MONTHS_LONG[parseInt(m, 10) - 1]} de ${y}`;
}

/** 23 ABR 2026 — uppercase short date for "Emitido" labels */
export function formatDateUpper(iso: string): string {
    if (!iso) return "—";
    return new Date(iso + "T00:00:00")
        .toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })
        .toUpperCase();
}

/** Stable 4–6 char document id from any seed (cédula, period, motivo, …). */
export function makeDocumentId(...parts: Array<string | number | undefined>): string {
    const seed = parts.filter(Boolean).join("|");
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36).toUpperCase().padStart(6, "0").slice(-6);
}
