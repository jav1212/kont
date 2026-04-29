// Shared PDF chrome for inventory reports.
// All six inventory PDFs (Libro de Entradas, Salidas, Inventarios, Reporte de
// Período, Saldos, ISLR) share the same header strip, footer/watermark, palette
// and number-formatting helpers — so they read as one branded family.
//
// Layout: A4 landscape (297×210mm). Header reserves top 24mm, footer reserves
// bottom 14mm. Content lives between Y=28 and Y=193 (~165mm vertical).
//
// Watermark policy: the round Kontave logo + the literal "MADE BY · HECHO POR ·
// KONTAVE." sits in the footer band on every page. No diagonal water-mark — it
// would obstruct dense numeric tables.

import jsPDF from "jspdf";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RGB = [number, number, number];
export type Doc = jsPDF;

export interface KontaPdfHeaderOpts {
    companyName:   string;
    companyRif?:   string;
    reportTitle:   string;       // e.g. "Libro de Entradas"
    periodLabel:   string;       // e.g. "Marzo 2026" or "Año 2026"
    generatedAtIso?: string;     // defaults to new Date().toISOString()
    /**
     * Optional legal/regulatory tag rendered as a small badge under the RIF.
     * Used by inventory reports to flag SENIAT compliance ("Reporte Art. 177
     * ISLR"). Skipped silently when undefined.
     */
    legalCaption?: string;
}

// ── Page geometry ─────────────────────────────────────────────────────────────
//
// Layout constants (margins, header band, footer band) are independent of
// paper size. The actual page width/height — and the derived contentBot/
// footerTop — are read from the jsPDF doc itself via `pageBounds(doc)`, so
// every helper here works on A4, A3, Letter or anything else without callers
// needing to pass dimensions.
//
// `PAGE` keeps the legacy A4 values exported for the 5 ledgers/reports that
// haven't been migrated; new generators (or any non-A4 generator) should use
// `pageBounds(doc)` instead of `PAGE.width / PAGE.height / PAGE.contentBot /
// PAGE.footerTop`.

export const PAGE = {
    width:        297,    // A4 landscape mm — legacy, see note above
    height:       210,
    marginX:      10,
    contentTop:   28,     // first usable Y for table rows
    contentBot:   193,    // last usable Y before footer (A4 default)
    footerTop:    196,    // top of footer band (A4 default)
    footerHeight: 14,
} as const;

export interface PageBounds {
    width:      number;
    height:     number;
    contentBot: number;
    footerTop:  number;
}

export function pageBounds(doc: Doc): PageBounds {
    const width  = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    return {
        width,
        height,
        contentBot: height - PAGE.footerHeight - 3,   // matches A4: 210 - 14 - 3 = 193
        footerTop:  height - PAGE.footerHeight,       // matches A4: 210 - 14 = 196
    };
}

// ── Palette ───────────────────────────────────────────────────────────────────

// Text tones are biased dark by design: every text tier prints as solid black
// on inkjet/low-toner printers. We collapse the heading/body distinction onto
// near-black, and keep secondary text at slate-900 so it still prints fully
// dark while remaining (barely) distinguishable on screen.
export const COLORS = {
    ink:        [10,  12,  16]  as RGB,    // near-black — headings, totals, body
    inkMed:     [10,  12,  16]  as RGB,    // near-black — body (was slate-800)
    muted:      [17,  24,  39]  as RGB,    // slate-900 — secondary/labels (was slate-700)
    border:     [229, 231, 235] as RGB,    // slate-200
    borderStr:  [203, 213, 225] as RGB,    // slate-300
    rowAlt:     [248, 250, 252] as RGB,    // slate-50
    bandHead:   [241, 245, 249] as RGB,    // slate-100
    white:      [255, 255, 255] as RGB,
    orange:     [255, 74,  24]  as RGB,    // Konta brand accent (#FF4A18)
    amber:      [120, 53,  15]  as RGB,    // amber-900 — text on amberLight (was 800)
    amberLight: [254, 243, 199] as RGB,    // amber-100 (row highlight)
};

// ── Primitives ────────────────────────────────────────────────────────────────

export function fill(doc: Doc, x: number, y: number, w: number, h: number, c: RGB): void {
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(x, y, w, h, "F");
}

export function hline(doc: Doc, x: number, y: number, w: number, c: RGB = COLORS.border, lw = 0.2): void {
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(lw);
    doc.line(x, y, x + w, y);
}

export function vline(doc: Doc, x: number, y: number, h: number, c: RGB = COLORS.border, lw = 0.2): void {
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(lw);
    doc.line(x, y, x, y + h);
}

export function rect(doc: Doc, x: number, y: number, w: number, h: number, c: RGB = COLORS.border, lw = 0.2): void {
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(lw);
    doc.rect(x, y, w, h, "S");
}

export function renderText(
    doc: Doc,
    text: string,
    x: number,
    y: number,
    size: number,
    bold: boolean,
    color: RGB,
    align: "left" | "center" | "right" = "left",
    maxW?: number,
    font: "helvetica" | "courier" = "helvetica",
): void {
    doc.setFont(font, bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);

    let str = text;
    if (maxW) {
        const lines = doc.splitTextToSize(text, maxW) as string[];
        str = lines[0] || "";
    }
    doc.text(str, x, y, { align });
}

export const renderLabel = (doc: Doc, text: string, x: number, y: number, align: "left" | "center" | "right" = "left", color: RGB = COLORS.muted, size = 7.5): void =>
    renderText(doc, text.toUpperCase(), x, y, size, true, color, align, undefined, "helvetica");

export const renderMono = (doc: Doc, text: string, x: number, y: number, size: number, bold: boolean, c: RGB, align: "left" | "center" | "right" = "left"): void =>
    renderText(doc, text, x, y, size, bold, c, align, undefined, "courier");

// ── Number / date formatting (es-VE) ─────────────────────────────────────────

export const formatN = (n: number, dec = 2): string =>
    Number.isFinite(n)
        ? n.toLocaleString("es-VE", { minimumFractionDigits: dec, maximumFractionDigits: dec })
        : "—";

export const formatVES = (n: number): string => "Bs. " + formatN(n);

export const formatQty = (n: number): string => {
    if (!Number.isFinite(n)) return "—";
    const isInt = Math.abs(n - Math.round(n)) < 1e-9;
    return n.toLocaleString("es-VE", {
        minimumFractionDigits: isInt ? 0 : 2,
        maximumFractionDigits: 4,
    });
};

const MONTHS_SHORT = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const MONTHS_LONG  = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

export function fmtDateEs(iso: string): string {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return iso;
    return `${parseInt(d, 10)} ${MONTHS_SHORT[parseInt(m, 10) - 1] ?? ""} ${y}`;
}

export function fmtPeriodMonth(yyyymm: string): string {
    const [y, m] = yyyymm.split("-");
    if (!y || !m) return yyyymm;
    return `${MONTHS_LONG[parseInt(m, 10) - 1] ?? ""} ${y}`;
}

export function fmtGeneratedAt(iso: string): string {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const dd   = String(d.getDate()).padStart(2, "0");
    const hh   = String(d.getHours()).padStart(2, "0");
    const mi   = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

// ── Logo loader (cached at module level — same icon for every PDF) ───────────

let logoCache: string | null = null;

export async function loadKontaLogo(): Promise<string | null> {
    if (logoCache) return logoCache;
    try {
        const res = await fetch("/konta-icon-round-512.png");
        if (!res.ok) return null;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        logoCache = dataUrl;
        return dataUrl;
    } catch {
        return null;
    }
}

// ── Header ────────────────────────────────────────────────────────────────────
//
// Top 24mm of every page. Returns Y where caller can start drawing content.
//
//   ┌────────────────────────────────────────────────────────────┐
//   │ ACME C.A.                            LIBRO DE ENTRADAS     │
//   │ J-12345678-9                              MARZO 2026       │
//   │ ━━━━ (orange accent)                                       │
//   │                                  GENERADO: 2026-04-28 18:42│
//   └────────────────────────────────────────────────────────────┘

export function drawHeader(doc: Doc, opts: KontaPdfHeaderOpts): number {
    const { width: pw } = pageBounds(doc);
    const xL = PAGE.marginX;
    const xR = pw - PAGE.marginX;

    // Left block: company + RIF
    renderText(doc, opts.companyName, xL, 12, 12, true, COLORS.ink, "left", pw / 2 - 20);
    if (opts.companyRif) {
        renderMono(doc, `RIF ${opts.companyRif}`, xL, 17.5, 8.5, false, COLORS.muted, "left");
    }

    // Right block: report title (+ legal caption appended) + period + generated timestamp
    const titleText = opts.legalCaption
        ? `${opts.reportTitle} - ${opts.legalCaption}`
        : opts.reportTitle;
    renderText(doc, titleText.toUpperCase(), xR, 12, 11, true, COLORS.ink, "right");
    renderMono(doc, opts.periodLabel.toUpperCase(), xR, 17.5, 9, true, COLORS.inkMed, "right");

    const generatedAt = opts.generatedAtIso ?? new Date().toISOString();
    renderMono(doc, `GENERADO ${fmtGeneratedAt(generatedAt)}`, xR, 22, 7, false, COLORS.muted, "right");

    // Orange accent rule under the title (right aligned, 32mm wide)
    fill(doc, xR - 32, 14, 32, 0.6, COLORS.orange);

    // Bottom divider for the header band
    hline(doc, xL, 25, pw - 2 * PAGE.marginX, COLORS.border, 0.2);

    return PAGE.contentTop;
}

// ── Footer / watermark ────────────────────────────────────────────────────────
//
// Stamped on every page after content rendering is complete. Iterates all
// pages and writes:
//
//   ──── (orange thin accent ~8mm)
//   [K]  MADE BY · HECHO POR · KONTAVE.            PÁG. 1 / 3
//
// Logo is the round Kontave icon (6×6mm) at the left margin.

export function drawFooter(doc: Doc, logoBase64: string | null): void {
    const total = doc.getNumberOfPages();
    const { width: pw, height: ph } = pageBounds(doc);

    for (let i = 1; i <= total; i++) {
        doc.setPage(i);

        const yTop = ph - PAGE.footerHeight;
        const xL = PAGE.marginX;
        const xR = pw - PAGE.marginX;

        // Top accent rule (orange, very short, signals brand without dominating)
        fill(doc, xL, yTop + 1, 8, 0.4, COLORS.orange);
        hline(doc, xL + 9, yTop + 1.2, pw - 2 * PAGE.marginX - 9, COLORS.border, 0.2);

        // Logo (left)
        if (logoBase64) {
            try {
                doc.addImage(logoBase64, "PNG", xL, yTop + 4, 6, 6, undefined, "FAST");
            } catch {
                // fall through silently — footer still shows text + page number
            }
        }

        // Center watermark text
        const cx = pw / 2;
        renderLabel(doc, "Made by · Hecho por · Kontave.", cx, yTop + 8, "center", COLORS.muted, 7);

        // Right: page indicator
        renderMono(doc, `PÁG. ${i} / ${total}`, xR, yTop + 8, 7.5, true, COLORS.inkMed, "right");
    }
}

// ── Pagination helper ────────────────────────────────────────────────────────
//
// Caller passes the next-row Y. If it would overflow the content area, a new
// page is added and the table-header redraw callback is invoked.
// Returns the (possibly reset) Y to draw the next row at.

export function maybePageBreak(
    doc: Doc,
    y: number,
    rowHeight: number,
    redrawHeader: (doc: Doc, y: number) => number,
    pageHeaderOpts?: KontaPdfHeaderOpts,
): number {
    if (y + rowHeight <= pageBounds(doc).contentBot) return y;
    doc.addPage();
    const yAfterTitle = pageHeaderOpts ? drawHeader(doc, pageHeaderOpts) : PAGE.contentTop;
    return redrawHeader(doc, yAfterTitle);
}

// ── Table-row primitive ───────────────────────────────────────────────────────
//
// Generic table row drawer used by all six generators. Accepts an array of
// {x, w, text, align, mono, bold, color} cell descriptors.

export interface PdfCell {
    x:      number;
    w:      number;
    text:   string;
    align?: "left" | "center" | "right";
    mono?:  boolean;
    bold?:  boolean;
    size?:  number;
    color?: RGB;
}

export function drawRow(doc: Doc, y: number, height: number, cells: PdfCell[], opts?: { zebra?: boolean; band?: RGB }): void {
    if (opts?.zebra) {
        const totalW = cells.reduce((acc, c) => Math.max(acc, c.x + c.w), 0) - cells[0]!.x;
        fill(doc, cells[0]!.x, y, totalW, height, opts.band ?? COLORS.rowAlt);
    }
    const baseline = y + height - 2;
    for (const c of cells) {
        const align = c.align ?? "left";
        const xText = align === "right" ? c.x + c.w - 1 : align === "center" ? c.x + c.w / 2 : c.x + 1;
        const size  = c.size ?? 8;
        const color = c.color ?? COLORS.inkMed;
        if (c.mono) renderMono(doc, c.text, xText, baseline, size, !!c.bold, color, align);
        else        renderText(doc, c.text, xText, baseline, size, !!c.bold, color, align, c.w - 1.5);
    }
}

export function drawHeaderRow(doc: Doc, y: number, height: number, cells: Omit<PdfCell, "color" | "size">[]): void {
    const totalW = cells.reduce((acc, c) => Math.max(acc, c.x + c.w), 0) - cells[0]!.x;
    fill(doc, cells[0]!.x, y, totalW, height, COLORS.bandHead);
    hline(doc, cells[0]!.x, y + height, totalW, COLORS.borderStr, 0.3);

    const baseline = y + height - 2.2;
    for (const c of cells) {
        const align = c.align ?? "left";
        const xText = align === "right" ? c.x + c.w - 1 : align === "center" ? c.x + c.w / 2 : c.x + 1;
        renderLabel(doc, c.text, xText, baseline, align, COLORS.inkMed, 7);
    }
}

// ── Filename helper ───────────────────────────────────────────────────────────

export function safeFilename(name: string): string {
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")    // strip combining diacritics
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}
