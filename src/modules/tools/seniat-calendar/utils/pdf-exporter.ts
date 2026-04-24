// ============================================================================
// PDF Exporter — jsPDF calendar summary
// Follows the pattern of payroll-pdf.ts: pure jsPDF, no server involvement
// ============================================================================

import jsPDF from "jspdf";
import type { CalendarEntry, TaxpayerType } from "../data/types";
import { MONTHS_ES_FULL } from "./date-helpers";

// ── Palette ───────────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const C = {
    bg:        [255, 255, 255] as RGB,
    ink:       [17,  21,  37]  as RGB,
    muted:     [95,  103, 128] as RGB,
    border:    [220, 224, 234] as RGB,
    primary:   [217, 58,  16]  as RGB,
    info:      [37,  99,  235] as RGB,
    warning:   [146, 64,  14]  as RGB,
    error:     [185, 28,  28]  as RGB,
    success:   [4,   120, 87]  as RGB,
    rowAlt:    [248, 248, 252] as RGB,
    white:     [255, 255, 255] as RGB,
};

type Doc = jsPDF;

const fill = (doc: Doc, x: number, y: number, w: number, h: number, c: RGB) => {
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(x, y, w, h, "F");
};

const text = (
    doc: Doc,
    str: string,
    x: number,
    y: number,
    size: number,
    bold: boolean,
    color: RGB,
    align: "left" | "center" | "right" = "left",
    maxW?: number
) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    if (maxW) {
        const lines = doc.splitTextToSize(str, maxW) as string[];
        doc.text(lines[0] ?? "", x, y, { align });
    } else {
        doc.text(str, x, y, { align });
    }
};

const hline = (doc: Doc, x: number, y: number, w: number, c: RGB = C.border, lw = 0.3) => {
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(lw);
    doc.line(x, y, x + w, y);
};

function categoryColor(category: string): RGB {
    switch (category) {
        case "IVA": return C.info;
        case "ISLR_RETENCIONES":
        case "RETENCIONES_ISLR_TERCEROS": return C.warning;
        case "ISLR_ANUAL":
        case "ISLR_ESTIMADA": return C.error;
        case "LOCTI": return C.success;
        default: return C.muted;
    }
}

function drawHeader(
    doc: Doc,
    pw: number,
    companyName: string,
    rif: string,
    taxpayerType: TaxpayerType,
    year: number
) {
    fill(doc, 0, 0, pw, 22, C.primary);
    text(doc, "KONTA", 16, 13, 16, true, C.white);
    text(doc, `Calendario Tributario SENIAT ${year}`, 16, 19, 8.5, false, C.white);
    text(
        doc,
        `${companyName.toUpperCase()} · RIF: ${rif} · ${taxpayerType === "especial" ? "Sujeto Pasivo Especial" : "Contribuyente Ordinario"}`,
        pw - 16, 13, 8.5, false, C.white, "right"
    );
    text(
        doc,
        "Providencia SNAT/2025/000091 · G.O. Nº 43.273 del 09/12/2025",
        pw - 16, 19, 7, false, [255, 220, 180] as RGB, "right"
    );
}

function drawFooter(doc: Doc, pw: number, ph: number, pageNum: number, totalPages: number) {
    fill(doc, 0, ph - 10, pw, 10, C.rowAlt);
    hline(doc, 0, ph - 10, pw, C.border, 0.2);
    text(doc, `kontave.com/herramientas/calendario-seniat`, 16, ph - 4.5, 7, false, C.muted);
    text(doc, `Página ${pageNum} de ${totalPages}`, pw - 16, ph - 4.5, 7, false, C.muted, "right");
}

export interface PdfExportOptions {
    entries: CalendarEntry[];
    companyName: string;
    rif: string;
    taxpayerType: TaxpayerType;
    year: number;
}

export function exportAsPdf({ entries, companyName, rif, taxpayerType, year }: PdfExportOptions): void {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    const pw = doc.internal.pageSize.getWidth();  // ~215.9
    const ph = doc.internal.pageSize.getHeight(); // ~279.4
    const ml = 16;
    const mr = pw - 16;
    const cw = mr - ml;

    // Group entries by month
    const byMonth = new Map<number, CalendarEntry[]>();
    for (let m = 1; m <= 12; m++) byMonth.set(m, []);
    for (const entry of entries) {
        const m = parseInt(entry.dueDate.split("-")[1], 10);
        byMonth.get(m)?.push(entry);
    }

    // 2 months per page
    const MONTHS_PER_PAGE = 2;
    const totalPages = Math.ceil(12 / MONTHS_PER_PAGE);

    let pageNum = 0;
    for (let startM = 1; startM <= 12; startM += MONTHS_PER_PAGE) {
        pageNum++;
        if (pageNum > 1) doc.addPage();

        fill(doc, 0, 0, pw, ph, C.bg);
        drawHeader(doc, pw, companyName, rif, taxpayerType, year);
        drawFooter(doc, pw, ph, pageNum, totalPages);

        let y = 28;

        for (let mi = 0; mi < MONTHS_PER_PAGE; mi++) {
            const month = startM + mi;
            if (month > 12) break;

            const monthEntries = byMonth.get(month) ?? [];

            // Month header bar
            fill(doc, ml, y, cw, 8, C.rowAlt);
            hline(doc, ml, y, cw, C.border, 0.3);
            hline(doc, ml, y + 8, cw, C.border, 0.3);
            text(
                doc,
                `${MONTHS_ES_FULL[month - 1].toUpperCase()} ${year}`,
                ml + 3, y + 5.5, 9.5, true, C.ink
            );
            text(
                doc,
                `${monthEntries.length} obligación${monthEntries.length !== 1 ? "es" : ""}`,
                mr - 3, y + 5.5, 8, false, C.muted, "right"
            );

            y += 10;

            if (monthEntries.length === 0) {
                text(doc, "Sin obligaciones registradas este mes", ml + 4, y + 5, 8, false, C.muted);
                y += 12;
            } else {
                // Column headers
                text(doc, "FECHA", ml, y + 3, 7.5, true, C.muted);
                text(doc, "OBLIGACIÓN", ml + 18, y + 3, 7.5, true, C.muted);
                text(doc, "PERÍODO", mr - 28, y + 3, 7.5, true, C.muted);
                y += 6;
                hline(doc, ml, y, cw, C.border, 0.2);
                y += 2;

                monthEntries.forEach((entry, idx) => {
                    if (idx % 2 === 0) fill(doc, ml, y, cw, 7.5, C.rowAlt);

                    const catColor = categoryColor(entry.category);
                    doc.setFillColor(catColor[0], catColor[1], catColor[2]);
                    doc.rect(ml, y + 1.5, 1.5, 5, "F");

                    const [, , dd] = entry.dueDate.split("-");
                    const dateStr = `${parseInt(dd)} ${MONTHS_ES_FULL[month - 1].slice(0, 3).toUpperCase()}`;

                    text(doc, dateStr, ml + 3, y + 5, 9, true, C.ink);
                    text(doc, entry.shortTitle, ml + 18, y + 5, 8.5, false, C.ink, "left", 60);
                    text(doc, entry.period.replace(/-/g, "/"), mr - 3, y + 5, 7.5, false, C.muted, "right");

                    if (entry.rolled) {
                        text(
                            doc,
                            `(orig. ${entry.originalDate.split("-").slice(1).join("/")})`,
                            mr - 3, y + 7.5, 6, false, C.muted, "right"
                        );
                    }

                    y += 8;
                });
            }

            y += 6;
        }
    }

    doc.save(`calendario-seniat-${year}-${rif.replace(/[^A-Z0-9]/gi, "")}.pdf`);
}
