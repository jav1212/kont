// Balance General (Estado de Situación Financiera) — PDF generator.
// Portrait A4. Two-pane layout:
//   • Left column  — Activos
//   • Right column — Pasivos + Patrimonio (incluyendo utilidad del ejercicio)
// Footer summary verifies Activos = Pasivos + Patrimonio.

import jsPDF from 'jspdf';
import {
    PAGE, COLORS, type Doc,
    drawHeader, drawFooter,
    fill, hline, renderText, renderMono, renderLabel,
    formatN, fmtGeneratedAt,
    loadKontaLogo,
} from '@/src/shared/frontend/utils/pdf-chrome';
import type { BalanceSheet, StatementLine } from './financial-statements';

// ── Input ────────────────────────────────────────────────────────────────────

export interface BalanceSheetPdfInput {
    companyName:  string;
    companyRif:   string;
    companyLogoUrl?: string | null;
    /** Display label of the period (e.g. "Marzo 2026") */
    periodLabel:  string;
    /** Cut-off date shown in the title: "Al 31 de marzo de 2026" */
    cutoffLabel:  string;
    sheet:        BalanceSheet;
}

// ── Layout constants ─────────────────────────────────────────────────────────

const COL_GAP = 6;
const ROW_H   = 5.2;
const LABEL_DENT = 4;

// ── Public ───────────────────────────────────────────────────────────────────

export async function generateBalanceSheetPdf(input: BalanceSheetPdfInput): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Configure header geometry to portrait page width
    const yStart = drawHeader(doc, {
        companyName:  input.companyName,
        companyRif:   input.companyRif,
        reportTitle:  'Balance General',
        periodLabel:  input.cutoffLabel,
    });

    drawCutoffSubheader(doc, input.cutoffLabel, yStart);

    const tableTop = yStart + 14;
    const margin   = PAGE.marginX;
    const pw       = doc.internal.pageSize.getWidth();
    const innerW   = pw - 2 * margin;
    const colW     = (innerW - COL_GAP) / 2;

    // ── Left column: Activos
    let yL = renderColumnHeader(doc, margin, tableTop, colW, 'ACTIVOS');
    yL = renderSection(doc, margin, yL, colW, '', input.sheet.assets);
    yL = renderTotal(doc, margin, yL, colW, 'TOTAL ACTIVOS', input.sheet.totalAssets);

    // ── Right column: Pasivos + Patrimonio
    let yR = renderColumnHeader(doc, margin + colW + COL_GAP, tableTop, colW, 'PASIVOS Y PATRIMONIO');
    yR = renderSection(doc, margin + colW + COL_GAP, yR, colW, 'PASIVOS', input.sheet.liabilities);
    yR = renderSubtotal(doc, margin + colW + COL_GAP, yR, colW, 'Total Pasivos', input.sheet.totalLiabilities);
    yR += 2;
    yR = renderSection(doc, margin + colW + COL_GAP, yR, colW, 'PATRIMONIO', input.sheet.equity);
    // Append "Utilidad del ejercicio" as a synthetic equity row
    yR = renderSyntheticLine(doc, margin + colW + COL_GAP, yR, colW,
        input.sheet.netIncome >= 0 ? 'Utilidad del ejercicio' : 'Pérdida del ejercicio',
        input.sheet.netIncome,
    );
    yR = renderSubtotal(doc, margin + colW + COL_GAP, yR, colW, 'Total Patrimonio',
        Math.round((input.sheet.totalEquity + input.sheet.netIncome) * 100) / 100);
    yR += 2;
    yR = renderTotal(doc, margin + colW + COL_GAP, yR, colW,
        'TOTAL PASIVOS + PATRIMONIO', input.sheet.totalLiabilitiesAndEquity);

    // ── Discrepancy notice (if any)
    const yEnd = Math.max(yL, yR) + 6;
    drawDiscrepancyNote(doc, margin, yEnd, innerW, input.sheet);

    // ── Footer / watermark
    const logo = await loadKontaLogo();
    drawFooter(doc, logo);

    // ── Download
    const dateStamp = fmtGeneratedAt(new Date().toISOString()).replace(/[: ]/g, '').slice(0, 8);
    const filename = `BalanceGeneral_${slug(input.companyName)}_${dateStamp}.pdf`;
    doc.save(filename);
}

// ── Section renderers ───────────────────────────────────────────────────────

function renderColumnHeader(doc: Doc, x: number, y: number, w: number, label: string): number {
    fill(doc, x, y - 4, w, 5.5, COLORS.bandHead);
    renderLabel(doc, label, x + 2, y, 'left', COLORS.ink, 8);
    hline(doc, x, y + 1.5, w, COLORS.borderStr, 0.4);
    return y + 6;
}

function renderSection(doc: Doc, x: number, y: number, w: number, title: string, lines: StatementLine[]): number {
    if (title) {
        renderLabel(doc, title, x + 1, y, 'left', COLORS.muted, 7);
        y += 4;
    }
    if (lines.length === 0) {
        renderText(doc, '— sin movimientos —', x + LABEL_DENT, y, 7.5, false, COLORS.muted, 'left');
        return y + ROW_H;
    }
    for (const line of lines) {
        if (y > pageBottomY(doc)) {
            doc.addPage();
            y = PAGE.contentTop;
        }
        renderMono(doc, line.accountCode, x + LABEL_DENT, y, 7, false, COLORS.muted, 'left');
        renderText(doc, truncate(line.accountName, 38), x + LABEL_DENT + 18, y, 8, false, COLORS.ink, 'left');
        renderMono(doc, formatN(line.amount), x + w - 2, y, 8, false, COLORS.ink, 'right');
        y += ROW_H;
    }
    return y;
}

function renderSubtotal(doc: Doc, x: number, y: number, w: number, label: string, amount: number): number {
    hline(doc, x + 1, y - 1.5, w - 2, COLORS.border, 0.2);
    renderText(doc, label, x + LABEL_DENT, y + 2, 8, true, COLORS.ink, 'left');
    renderMono(doc, formatN(amount), x + w - 2, y + 2, 8.5, true, COLORS.ink, 'right');
    return y + ROW_H + 2;
}

function renderTotal(doc: Doc, x: number, y: number, w: number, label: string, amount: number): number {
    fill(doc, x, y - 1, w, ROW_H + 2, COLORS.bandHead);
    hline(doc, x, y - 1, w, COLORS.orange, 0.6);
    renderLabel(doc, label, x + 2, y + 3, 'left', COLORS.ink, 8);
    renderMono(doc, formatN(amount), x + w - 2, y + 3, 9.5, true, COLORS.ink, 'right');
    return y + ROW_H + 4;
}

function renderSyntheticLine(doc: Doc, x: number, y: number, w: number, label: string, amount: number): number {
    renderText(doc, '·', x + LABEL_DENT, y, 8, true, COLORS.orange, 'left');
    renderText(doc, label, x + LABEL_DENT + 6, y, 8, true, COLORS.ink, 'left');
    renderMono(doc, formatN(amount), x + w - 2, y, 8, true, COLORS.ink, 'right');
    return y + ROW_H;
}

function drawCutoffSubheader(doc: Doc, cutoffLabel: string, y: number): void {
    const pw = doc.internal.pageSize.getWidth();
    renderLabel(doc, `Cifras al ${cutoffLabel.toUpperCase()} · Expresado en Bolívares (Bs.)`,
        pw / 2, y + 5, 'center', COLORS.muted, 7);
}

function drawDiscrepancyNote(doc: Doc, x: number, y: number, w: number, sheet: BalanceSheet): void {
    const isBalanced = Math.abs(sheet.discrepancy) < 0.01;
    const color = isBalanced ? COLORS.muted : COLORS.amber;
    const bg    = isBalanced ? COLORS.rowAlt : COLORS.amberLight;
    fill(doc, x, y, w, 11, bg);
    hline(doc, x, y, w, COLORS.borderStr, 0.2);
    hline(doc, x, y + 11, w, COLORS.borderStr, 0.2);

    if (isBalanced) {
        renderText(doc,
            `✓ Balance cuadra · Activos = Pasivos + Patrimonio (${formatN(sheet.totalAssets)})`,
            x + 3, y + 4.5, 7.5, true, color, 'left');
        renderText(doc,
            'Cuadre verificado contra todos los asientos contables registrados como confirmados (status = posted).',
            x + 3, y + 8.5, 6.5, false, color, 'left');
    } else {
        renderText(doc,
            `⚠ Discrepancia de ${formatN(sheet.discrepancy)} Bs. — Activos: ${formatN(sheet.totalAssets)}, Pas+Pat: ${formatN(sheet.totalLiabilitiesAndEquity)}`,
            x + 3, y + 4.5, 7.5, true, color, 'left');
        renderText(doc,
            'Revisa los asientos contables — un balance que no cuadra suele indicar partidas con débito ≠ crédito.',
            x + 3, y + 8.5, 6.5, false, color, 'left');
    }
}

// ── Utility ─────────────────────────────────────────────────────────────────

function pageBottomY(doc: Doc): number {
    return doc.internal.pageSize.getHeight() - PAGE.footerHeight - 5;
}

function truncate(s: string, n: number): string {
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function slug(s: string): string {
    return s.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}
