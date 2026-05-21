// Helpers compartidos para PDFs de tipo "recibo" (un documento por empleado
// con firma) generados por la familia payroll: nómina, bonificaciones, cesta
// ticket y bono socio económico.
//
// Centraliza el formato OFICIO 216×330mm con dos copias por hoja (Original /
// Copia) y el mini-header parametrizable, para que cada PDF de la familia
// reutilice la misma geometría sin duplicar constantes.

import type jsPDF from "jspdf";
import {
    COLORS,
    fill,
    hline,
    rect,
    renderText,
    renderMono,
    renderLabel,
} from "./pdf-chrome";

type Doc = jsPDF;

// ── Modo del reporte ─────────────────────────────────────────────────────────

export type ReportMode = "general" | "individual" | "duplicado";

// ── Geometría OFICIO (216 × 330mm portrait) ──────────────────────────────────
//
//   Y=0   ┌──────────────────────────────────────┐
//         │  (5mm margen superior)               │
//   Y=5   │  RECIBO ORIGINAL (top)               │  150mm
//   Y=155 │                                      │
//         │  (~5mm separación)                   │
//   Y=160 │ ─ ─ ─ ─ ─ Recortar aquí ─ ─ ─ ─ ─ ─ ─│
//         │  (~5mm separación)                   │
//   Y=165 │  RECIBO COPIA (bottom)               │  150mm
//   Y=315 │                                      │
//         │  Footer Konta (logo + Pág. X/N)      │  14mm (Y=316-330)
//   Y=330 └──────────────────────────────────────┘

export const OFICIO_FORMAT: [number, number] = [216, 330];
export const HALF_TOP_Y    = 5;
export const HALF_BOTTOM_Y = 165;
export const HALF_HEIGHT   = 150;
export const CUT_LINE_Y    = 160;

// ── Línea de corte ───────────────────────────────────────────────────────────

export function drawCutLine(doc: Doc, y: number): void {
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 8;

    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.setDrawColor(COLORS.borderStr[0], COLORS.borderStr[1], COLORS.borderStr[2]);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    doc.setLineDashPattern([], 0);

    renderText(doc, "-- Recortar aquí --", pageWidth / 2, y - 1.5, 7, false, COLORS.muted, "center", undefined, "helvetica");
}

// ── Mini-header compacto (10mm) ──────────────────────────────────────────────
//
// Para uso dentro de cada mitad de hoja en modo "duplicado". Layout:
//
//   [ORIGINAL]                                    RECIBO DE NÓMINA
//   ACME C.A.                                     1Q · MAY 2026
//   RIF J-12345678-9                              ━━━━━━━━━━━ (acento)
//   ─────────────────────────────────────────────────────────── (divider)

export interface CompactHeaderOpts {
    companyName: string;
    companyId?:  string;
}

export function drawCompactHeader(
    doc: Doc,
    opts: CompactHeaderOpts,
    xL: number,
    xR: number,
    yStart: number,
    label: "ORIGINAL" | "COPIA",
    periodLabel: string,
    reportTitle: string,
): number {
    const contentW = xR - xL;

    // Chip ORIGINAL/COPIA arriba-izquierda
    const chipW = 22;
    const chipH = 4;
    fill(doc, xL, yStart, chipW, chipH, COLORS.orange);
    renderText(doc, label, xL + chipW / 2, yStart + chipH - 1.2, 7, true, COLORS.white, "center", undefined, "helvetica");

    // Título arriba-derecha (alineado con el chip)
    renderText(doc, reportTitle, xR, yStart + chipH - 1, 9, true, COLORS.ink, "right");

    let y = yStart + chipH + 1;

    // Empresa + RIF (izquierda)
    renderText(doc, opts.companyName, xL, y + 3, 9, true, COLORS.ink, "left", contentW * 0.55);
    if (opts.companyId) {
        renderMono(doc, `RIF ${opts.companyId}`, xL, y + 6.5, 7, false, COLORS.muted, "left");
    }

    // Período (derecha)
    renderMono(doc, periodLabel, xR, y + 3, 7.5, true, COLORS.inkMed, "right");

    // Acento naranja corto
    fill(doc, xR - 26, y + 4.8, 26, 0.5, COLORS.orange);

    // Divider inferior
    hline(doc, xL, y + 8.5, contentW, COLORS.border, 0.2);

    return y + 9.5;
}

// ── Chip ORIGINAL/COPIA para modo full (fallback de overflow) ────────────────
//
// Se coloca a la derecha justo bajo el divisor del header global de Konta
// (drawHeader sitúa el divisor en Y=25; este chip va en yStart-5).

export function drawOriginalCopyChip(
    doc: Doc,
    xR: number,
    yStart: number,
    label: "ORIGINAL" | "COPIA",
): void {
    const chipW = 22, chipH = 4;
    const chipX = xR - chipW;
    const chipY = yStart - 5;
    fill(doc, chipX, chipY, chipW, chipH, COLORS.orange);
    renderText(doc, label, chipX + chipW / 2, chipY + chipH - 1.2, 7, true, COLORS.white, "center", undefined, "helvetica");
}

// ── Firmas (Empleador / Trabajador) ──────────────────────────────────────────
//
// Compact (16mm): caja simple con etiquetas y línea de firma.
// Full (26mm): igual + checkbox de conformidad con texto parametrizable
// (cada reporte tiene su propia leyenda de recepción).

export interface SignaturesOpts {
    compact:         boolean;
    /** Sólo se renderiza en modo full. Omítelo para no dibujar checkbox. */
    conformityText?: string;
}

export function drawSignatures(
    doc: Doc,
    marginLeft: number,
    contentWidth: number,
    y: number,
    opts: SignaturesOpts,
): number {
    const SIG_WIDTH  = (contentWidth - 16) / 2;
    const SIG_HEIGHT = opts.compact ? 16 : 26;
    const labelOff   = opts.compact ? 3.5 : 5;
    const lineOff    = opts.compact ? 6   : 9;

    // Empleador
    const sx1 = marginLeft;
    rect(doc, sx1, y, SIG_WIDTH, SIG_HEIGHT, COLORS.borderStr, 0.3);
    hline(doc, sx1 + 8, y + SIG_HEIGHT - lineOff, SIG_WIDTH - 16, COLORS.borderStr, 0.3);
    renderLabel(doc, "Empleador", sx1 + SIG_WIDTH / 2, y + SIG_HEIGHT - labelOff, "center", COLORS.muted, 7);

    // Trabajador
    const sx2 = marginLeft + (SIG_WIDTH + 16);
    rect(doc, sx2, y, SIG_WIDTH, SIG_HEIGHT, COLORS.borderStr, 0.3);

    if (!opts.compact && opts.conformityText) {
        const cbSize = 2.5;
        const cbX = sx2 + 4;
        const cbY = y + 4;
        rect(doc, cbX, cbY, cbSize, cbSize, COLORS.borderStr, 0.3);
        renderText(
            doc,
            opts.conformityText,
            cbX + cbSize + 1.5,
            cbY + cbSize - 0.4,
            7.5,
            false,
            COLORS.muted,
            "left",
            SIG_WIDTH - cbSize - 8,
            "helvetica",
        );
    }

    hline(doc, sx2 + 8, y + SIG_HEIGHT - lineOff, SIG_WIDTH - 16, COLORS.borderStr, 0.3);
    renderLabel(doc, opts.compact ? "Conforme" : "Trabajador / Conforme", sx2 + SIG_WIDTH / 2, y + SIG_HEIGHT - labelOff, "center", COLORS.muted, 7);

    return y + SIG_HEIGHT + (opts.compact ? 2 : 6);
}
