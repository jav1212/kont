// ============================================================================
// ICS Exporter — RFC 5545 iCalendar format with VALARM support
// Compatible with Google Calendar, Apple Calendar, Outlook
// ============================================================================

import type { CalendarEntry, TaxpayerType } from "../data/types";
import { parseLocalIso } from "./date-helpers";

const CRLF = "\r\n";
const MAX_LINE_LENGTH = 75;

/**
 * Folds a long iCal line per RFC 5545 §3.1 (75-char line limit).
 */
function foldLine(line: string): string {
    if (line.length <= MAX_LINE_LENGTH) return line;
    const chunks: string[] = [];
    let remaining = line;
    chunks.push(remaining.slice(0, MAX_LINE_LENGTH));
    remaining = remaining.slice(MAX_LINE_LENGTH);
    while (remaining.length > 0) {
        // Continuation lines start with a single space (RFC 5545 §3.1)
        chunks.push(" " + remaining.slice(0, MAX_LINE_LENGTH - 1));
        remaining = remaining.slice(MAX_LINE_LENGTH - 1);
    }
    return chunks.join(CRLF);
}

/**
 * Formats a local Date to iCal DATE format YYYYMMDD (all-day event).
 */
function formatIcalDate(iso: string): string {
    return iso.replace(/-/g, "");
}

/**
 * Stable UID derived from rif + obligationId + dueDate.
 * Uses a simple hash to ensure stability across re-exports.
 */
function makeStableUid(rif: string, obligationId: string, dueDate: string): string {
    const raw = `${rif}-${obligationId}-${dueDate}-konta-seniat`;
    // Simple djb2 hash for stable UID without crypto API
    let hash = 5381;
    for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
        hash = hash >>> 0; // Convert to unsigned 32-bit integer
    }
    return `${hash.toString(16).padStart(8, "0")}-seniat-konta@konta.app`;
}

/**
 * Generates an ICS file content from calendar entries.
 * Triggers download in the browser.
 */
export function exportAsIcs(
    entries: CalendarEntry[],
    options: {
        rif: string;
        taxpayerType: TaxpayerType;
        companyName?: string;
        year: number;
    }
): void {
    const { rif, taxpayerType, companyName, year } = options;
    const calName = companyName
        ? `Calendario SENIAT ${year} — ${companyName}`
        : `Calendario SENIAT ${year} — ${rif}`;

    const now = new Date();
    const dtstamp =
        now.getUTCFullYear().toString() +
        String(now.getUTCMonth() + 1).padStart(2, "0") +
        String(now.getUTCDate()).padStart(2, "0") +
        "T" +
        String(now.getUTCHours()).padStart(2, "0") +
        String(now.getUTCMinutes()).padStart(2, "0") +
        String(now.getUTCSeconds()).padStart(2, "0") +
        "Z";

    const lines: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        `PRODID:-//Konta//Calendario SENIAT ${year}//ES`,
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        `X-WR-CALNAME:${calName}`,
        "X-WR-TIMEZONE:America/Caracas",
        "X-WR-CALDESC:Obligaciones tributarias SENIAT Venezuela generadas por Konta",
    ];

    for (const entry of entries) {
        const uid = makeStableUid(rif, entry.obligationId, entry.dueDate);
        const dateStr = formatIcalDate(entry.dueDate);
        // DTEND for all-day events is exclusive (next day)
        const dtDate = parseLocalIso(entry.dueDate);
        const dtEndDate = new Date(dtDate.getFullYear(), dtDate.getMonth(), dtDate.getDate() + 1);
        const dtEndStr = formatIcalDate(
            `${dtEndDate.getFullYear()}-${String(dtEndDate.getMonth() + 1).padStart(2, "0")}-${String(dtEndDate.getDate()).padStart(2, "0")}`
        );

        const summaryBase = `SENIAT · ${entry.shortTitle}`;
        const description = [
            entry.title,
            `RIF: ${rif}`,
            `Tipo: ${taxpayerType === "especial" ? "Sujeto Pasivo Especial" : "Contribuyente Ordinario"}`,
            `Base legal: ${entry.legalBasis}`,
            entry.rolled ? `Fecha original: ${entry.originalDate} (ajustada por feriado/fin de semana)` : "",
            "",
            "Generado por Konta — konta.app/herramientas/calendario-seniat",
        ].filter(Boolean).join("\\n");

        lines.push("BEGIN:VEVENT");
        lines.push(foldLine(`UID:${uid}`));
        lines.push(`DTSTAMP:${dtstamp}`);
        lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
        lines.push(`DTEND;VALUE=DATE:${dtEndStr}`);
        lines.push(foldLine(`SUMMARY:${summaryBase}`));
        lines.push(foldLine(`DESCRIPTION:${description}`));
        lines.push("TRANSP:TRANSPARENT");
        lines.push(`CATEGORIES:${entry.category}`);
        lines.push(`X-KONTA-OBLIGATION-ID:${entry.obligationId}`);
        lines.push(`X-KONTA-PERIOD:${entry.period}`);
        // VALARM: 1 day before, display notification
        lines.push("BEGIN:VALARM");
        lines.push("TRIGGER:-P1D");
        lines.push("ACTION:DISPLAY");
        lines.push(foldLine(`DESCRIPTION:Mañana vence: ${summaryBase} — ${rif}`));
        lines.push("END:VALARM");
        lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    const icsContent = lines.map(foldLine).join(CRLF) + CRLF;

    // Download
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seniat-${year}-${rif.replace(/[^A-Z0-9]/gi, "")}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
